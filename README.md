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

De stack draait op **dev.iotm.nl** achter Traefik (TLS via wildcard *.dev.iotm.nl,
TransIP DNS-challenge): `api.dev.iotm.nl`, `auth.dev.iotm.nl` (Authentik),
`s3.dev.iotm.nl` (tijdelijk MinIO als S3-object-storage), `mail.dev.iotm.nl` (Mailpit).

```sh
cd deploy
cp .env.example .env        # vul de secrets in
docker compose up -d --build
```

Secrets staan uitsluitend in `.env` (buiten git); de deploy-configuratie zelf is
publiek en hoort dus nooit geheimen te bevatten.

Lokale smoke-test zonder Traefik (alles op 127.0.0.1:81xx):

```sh
cd deploy
cp .env.example .env.local  # zet de 127.0.0.1-URL's onderin aan en TRANSIP_KEY_BESTAND=/dev/null
docker compose -f docker-compose.yml -f compose.local.yml --env-file .env.local up -d --build
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
