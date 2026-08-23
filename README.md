# Jottem

Monorepo van het **Jottem-platform**: het participatieve digitale erfgoedplatform van
[Inside Out Time Machines](https://www.iotm.nl/) waarmee inwoners foto's, documenten en
herinneringen delen binnen projecten van erfgoedorganisaties - te beginnen met de pilot
*Smaak van Gouda* (Streekarchief Midden-Holland).

## Structuur

```
api/        backend-API (FastAPI, SQLAlchemy/Alembic) + Celery-worker (outbox, mail)
web/        webfrontend (Next.js, huisstijl uit de merkgids)
deploy/     docker-compose en configuratie (zonder secrets)
tests/      contract- en end-to-end-tests
```

## Dev-omgeving (MVP-fundament)

De stack draait op **dev.iotm.nl** achter Traefik (TLS per hostnaam via Let's Encrypt
met de HTTP-01-challenge): `api.dev.iotm.nl`, `auth.dev.iotm.nl` (Authentik),
`iiif.dev.iotm.nl`, `anno.dev.iotm.nl`, `data.dev.iotm.nl`, `status.dev.iotm.nl`
(Grafana), plus twee hosts die alleen in deze omgeving bestaan: `s3.dev.iotm.nl`
(MinIO) en `mail.dev.iotm.nl` (Mailpit).

```sh
cd deploy
cp .env.example .env             # vul de secrets in (COMPOSE_PROFILES=dev staat er al in)
docker compose up -d --build
```

### Domeinen en omgevingen

Eén compose-bestand bedient beide omgevingen. De hostnamen leiden af van twee
variabelen in `.env`:

| variabele | dev | productie |
|---|---|---|
| `BASISDOMEIN` | `dev.iotm.nl` | `iotm.nl` |
| `WEB_HOST` (frontend) | leeg, dus gelijk aan `BASISDOMEIN` | `www.iotm.nl` |

`BASISDOMEIN` levert `api.`, `auth.`, `iiif.`, `anno.`, `data.` en `status.`;
`WEB_HOST` levert de publieksfrontend, de OIDC-redirect-URI en de huisstijl-assets van
de inlogschermen. In productie staat de frontend dus op www terwijl de diensten op de
kale domeinnaam staan, en verwijst een 301 de kale `iotm.nl` door naar www.

De diensten die alleen bij ontwikkelen horen (MinIO, Mailpit) staan in het profiel
`dev`; de apex-redirect staat in het profiel `prod`:

`COMPOSE_PROFILES` in `.env` bepaalt welk profiel meedraait (`dev` of `prod`), zodat een
kaal `docker compose up -d` het juiste doet. Expliciet kan ook:

```sh
docker compose --profile dev up -d      # ontwikkelomgeving
docker compose --profile prod up -d     # productie (externe S3 en MTA via .env)
```

**Een domeinwissel is geen kwestie van alleen `.env` aanpassen.** Doorloop:

1. `BASISDOMEIN`, `WEB_HOST` en `OMGEVING` zetten, plus in productie `S3_ENDPOINT`,
   `S3_PUBLIEK`, `SMTP_HOST` en `SMTP_PORT`.
2. De frontend **opnieuw bouwen**: alle `NEXT_PUBLIC_*`-waarden worden tijdens de build
   in de clientbundel gebakken, dus `docker compose up -d --build web` is verplicht.
3. De blueprints opnieuw toepassen, want de redirect-URI en de huisstijl-URL's veranderen:
   `docker compose exec authentik-worker ak apply_blueprint /blueprints/custom/<bestand>.yaml`.
4. De redirect-URI's bij de social-loginproviders (Google, Microsoft, Facebook) omzetten
   naar de nieuwe `auth.`-host.
5. Controleren wat er al gepubliceerd is: de annotatie-IRI's in AnnoRepo dragen de
   naamsruimte van het oude domein. Dat is een gegevensmigratie, geen configuratie:
   `docker compose exec worker celery -A app.worker call app.worker.migreer_annotatiecontext`.
   Het vocabulaire zelf (`<datahost>/ns/jottem.jsonld`) en de frames volgen automatisch:
   de API levert ze uit en zet de canonieke IRI om naar de host van deze omgeving.

Vooraf controleren wat een `.env` oplevert kan zonder iets te starten:
`docker compose --profile prod config | grep -E 'Host\(|JOTTEM_'`.

Secrets staan uitsluitend in `.env` (buiten git); de deploy-configuratie zelf is
publiek en hoort dus nooit geheimen te bevatten.

Lokale smoke-test zonder Traefik (alles op 127.0.0.1:81xx):

```sh
cd deploy
cp .env.example .env.local  # zet de 127.0.0.1-URL's onderin aan
docker compose -f docker-compose.yml -f compose.local.yml \
  --env-file .env.local up -d --build
```

De API migreert en seedt bij het opstarten (SAMH + project *Smaak van Gouda* +
testaccounts voor de dev-bypass `X-Dev-Sub`: `dev-anna` (uploader), `dev-mona`
(moderator), `dev-otto` (organisatiebeheerder)).

## Ontwerp

- Ontwerpdocument: https://design.iotm.nl/ ([repo](https://github.com/inside-out-time-machines/design))
- Realisatieplan (MVP-scope en mijlpalen): https://design.iotm.nl/#realisatieplan
- Merkgids (huisstijl): https://brand.iotm.nl/
- Klikbaar prototype: https://prototype.iotm.nl/

De [Herkenbaar API](https://github.com/inside-out-time-machines/herkenbaar-api) (detectie van
herkenbare personen, AGPL-3.0) is bewust een aparte repository.

## Licentie

[EUPL-1.2](LICENSE).
