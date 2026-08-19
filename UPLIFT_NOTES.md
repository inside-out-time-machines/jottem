# Uplift-aantekeningen

Traject op branch `uplift`, gestart 19 augustus 2026 vanaf commit `4a3a051`. Grondslag:
`analysis/jottem/ASSESSMENT.md`. Oracle: `analysis/jottem/BASELINE.md` (31 contracttests +
27 rooktestcontroles). **Elke fase hieronder reproduceerde die nulmeting volledig.**

Bewijsvorm: geen dual-run van een bestaande suite (die was er niet), maar een hier
gebouwde zwart-doossuite die het gedrag van vóór de uplift vastpinde en na elke fase
opnieuw draait tegen dezelfde dev-omgeving.

## Fase 0 - Nulmeting (`5cc52cc`)

Contracttests (`tests/contract/`, pytest + httpx) en een rooktest in Chromium
(`tests/e2e/smoke.mjs`), plus `analysis/jottem/BASELINE.md`. Dekt de publieke API, de
open data (IIIF, W3C-annotaties, RDF, RSS, Change Discovery, datasetbeschrijving, dump),
de afscherming van beheerroutes en vijf publiekspagina's in de browser.

Eén aanname bleek te streng en is meteen rechtgezet: de rooktest pakte de eerste jottem
van het project en die had geen annotaties. Hij kiest nu een jottem mét annotaties.

## Fase 1 - Next 15.1.6 → 15.5.23 (`5a27243`)

| Delta | Aard | Afgehandeld |
|---|---|---|
| Kritieke advisory in Next (RCE React-flightprotocol), plus cache-poisoning-DoS en SSRF | dependency | `next@15.5.23`, `react`/`react-dom@19.2.8` |
| Build gebruikte de lockfile niet (`npm install` na `COPY package.json`) | project-systeem | `web/Dockerfile`: `COPY package.json package-lock.json` + `npm ci` |

Geen codewijziging nodig: `npx tsc --noEmit` en `npm run build` liepen ongewijzigd door,
en de eigen Open Graph-tags, het `<style precedence>`-blok en `output: "standalone"`
gedragen zich hetzelfde.

**Resultaat `npm audit`:** van 1 kritiek + 2 hoog naar **3 hoog**, allemaal
`sharp <0.35.0` (libvips-CVE's) die Next 15.5.23 transitief meebrengt. Dat vraagt Next 16
en is daarmee fase 3.

**Nulmeting na deze fase:** 31/31 contract, 27/27 rooktest. Live geverifieerd:
`x-powered-by: Next.js`, container draait 15.5.23.

## Fase 2 - Python-stack (`765311b`, `1d22157`, `13b1613`)

| Delta | Aard | Afgehandeld |
|---|---|---|
| redis 5.2 → 8.1 kon niet los: celery 5.4 pint `redis<6.0.0` (in de container geverifieerd) | dependency, gecoördineerd | celery 5.4 → 5.6.3 samen met redis 8.1.0 |
| libvips-CVE's via pyvips | dependency | pyvips 2.2 → 3.1.1 (libvips 8.16.1) |
| Framework en randlagen achter | dependency | fastapi 0.141.1, starlette mee, pydantic-settings 2.15.0, alembic 1.19.1, boto3 1.43.74, rdflib 7.6.0, sqlalchemy 2.0.52, uvicorn 0.52.4, python-multipart 0.0.32, PyJWT 2.13.0 |
| Wildcard-pins: de gedraaide versie was niet reproduceerbaar | project-systeem | `api/requirements.txt` volledig op exacte versies |
| **Schuld 1:** `0001_init` deed `Base.metadata.create_all()`, waardoor een verse database bij 0002 omviel | judgment | 0001 vervangen door een bevroren momentopname met expliciete `op.create_table`-opdrachten |

**Twee dingen die het recept pas tijdens de uitvoering prijsgaf:**
1. De generator die de bevroren 0001 opleverde zette `unique=True` op kolommen die óók een
   unieke index krijgen. Een verse database kreeg daardoor drie extra constraints
   (`gebruiker_sub_key`, `gebruiker_email_key`, `organisatie_slug_key`) die de gegroeide
   database niet heeft. Rechtgezet in `1d22157`.
2. De schemavergelijking tussen twee databases sorteert op OID en suggereert daardoor
   verschillen die er niet zijn. Vergelijk gesorteerd.

**Bewijs migratieherstel:** op een wegwerpdatabase draait `alembic upgrade head` nu tot
revisie 0009, en het resultaat is kolom voor kolom, index voor index en constraint voor
constraint gelijk aan de gegroeide database (28 constraints, identiek na sorteren). De
wegwerpdatabase is daarna verwijderd.

**Nulmeting na deze fase:** 31/31 contract, 27/27 rooktest. Extra gecontroleerd: de worker
verwerkt de outbox elke 10 seconden zonder fouten onder celery 5.6 + redis 8, pyvips 3
maakt een thumbnail uit een bestaand origineel (1849×1200 → 400 px), en IIIF-manifest plus
Turtle-uitvoer zijn ongewijzigd.

**Restant `pip list --outdated`:** alleen `pip` zelf en `pydantic_core` (transitief via
pydantic, dat fastapi pint).

## Fase 3 - Next 15.5.23 → 16.3.1 en TypeScript 5.9 → 7.0.2

| Delta | Aard | Afgehandeld |
|---|---|---|
| De laatste 3 hoge advisories (`sharp <0.35.0`, libvips) hingen aan Next 15 | dependency | `next@16.3.1`; **`npm audit` meldt nu 0 kwetsbaarheden** |
| Async request-API's, herziene caching, `next.config.ts`-opties | mechanisch | geen codewijziging nodig: `params`/`searchParams` waren al async, `cache: "no-store"` staat expliciet, `output: "standalone"` en de `headers()`-hook blijven geldig |
| TypeScript 5.9 → 7.0.2 (native compiler) | mechanisch | `tsc --noEmit` en `next build` schoon met dezelfde `tsconfig.json` |

De hele klasse Next 16-breuken raakt deze code niet: er is geen middleware, geen
`instrumentation.ts`, geen route-segmentconfig, geen `next/font` en geen `next/image`. De
enige imports uit Next zijn de `Metadata`- en `NextConfig`-typen en `next/navigation`.

**Nulmeting na deze fase:** 31/31 contract, 27/27 rooktest. Extra gecontroleerd op de
draaiende omgeving: 10 Open Graph-tags en 0 twitter-tags in de head, canonical aanwezig,
header in de organisatiekleur, beide deelknoppen present met een nagebootste Share API, en
de annotatiepopup opent met de juiste inhoud.

## Fase 4 - Security hoog

| ID | Bevinding | Fix | Bewijs |
|---|---|---|---|
| SEC-001 | Mailpit valt open zonder `MAILPIT_UI_AUTH` | `${MAILPIT_UI_AUTH:?...}`: compose weigert te starten zonder waarde; `.env.example` heeft nu een placeholder | `mail.dev.iotm.nl` geeft 401 zonder auth |
| SEC-003 | `GET /jottem/{id}/detail` gaf zonder token presigned originelen van ongemodereerd en gedepubliceerd materiaal | gepubliceerd blijft publiek (de publiekspagina rendert ermee), al het andere eist een token plus autorisatie (inzender, moderator of beheerder van de organisatie, platformbeheerder); gedepubliceerd geeft 410 zonder inhoud | met de hand getoetst door een jottem tijdelijk op `nieuw` te zetten: **401**, geen `X-Amz-Signature` in het antwoord, en met een verzonnen `X-Dev-Sub` óók 401; status daarna teruggezet |
| SEC-002 | SSRF: de IP-controle werd door redirects omzeild, en de service-URL uit een extern manifest werd niet gecontroleerd | handmatige redirectlus (`veilig_ophalen`) die elke hop opnieuw valideert, plus controle op CGNAT, metadata-IP en IPv4-mapped IPv6; manifest-URL's gaan door dezelfde controle; één generieke foutmelding zodat de resolver geen poortscanner is | met een nagebootste transportlaag: redirect naar `169.254.169.254`, `minio:9000` en `127.0.0.1:9090` **geblokkeerd**, redirect naar een publieke URL gevolgd; validator weigert localhost, 10/8, 100.64/10, `::ffff:127.0.0.1`, `minio:9000` en niet-http(s) |
| SEC-004 | `X-Dev-Sub` gaf platformbeheerder inclusief een verzonnen `amr=["totp"]`, en de seed zette dev-accounts overal terug | de API weigert te starten als `dev_auth` aanstaat buiten een dev-omgeving; de bypass levert `amr=["dev-bypass"]` dat de sterke-factor-poort alleen in dev passeert; dev-testaccounts worden buiten dev niet meer aangemaakt | contracttests: elke beheerroute 401, ook met `X-Dev-Sub` |
| SEC-005 | Rolkoppeling op e-mailadres zonder controle op `email_verified` | koppelen aan een klaargezette rij gebeurt alleen als de identiteitsprovider het adres heeft geverifieerd; anders ontstaat een gewoon nieuw account zonder rollen | codepad; Authentik levert `email_verified` via de standaard e-mail-scope |

**Nulmeting na deze fase:** 33/33 contract (twee tests erbij voor het detail-endpoint),
27/27 rooktest.

**Niet meegenomen, hoort bij een latere fase:** het bootstrap-beheerderadres staat nog
hardgecodeerd in `seed.py` en wordt bij elke start opnieuw gezet (schuld 5, fase 6), en
uitnodigingen lopen nog op e-mailadres in plaats van op een eenmalig token (fase 5).

## Fase 5 - Security midden en laag

**Invoervalidatie aan de rand**

| ID | Fix |
|---|---|
| SEC-006 | De presigned PUT legt alleen bucket, sleutel en content-type vast, dus controleert `POST /jottem` nu achteraf: grootte tegen de 50 MB-grens en de magische bytes tegen JPG/PNG/TIFF. Faalt dat, dan wordt het object verwijderd en volgt 413 of 415 |
| SEC-007 | De objectsleutel komt niet meer uit de bestandsnaam van de client maar uit het gecontroleerde content-type (`s3.extensie_voor`), in alle vier de routers |
| SEC-008 | Vrije metadata heeft grenzen (40 velden, sleutel 60, waarde 2000 tekens), `lat`/`lon` moeten getallen binnen bereik zijn en `*Uri`-velden echte http(s)-URL's; daarmee kan één ongeldige waarde de RDF-pijplijn niet meer breken |
| SEC-010 | Schema-allowlist (`^https?://`) op `termUri`, `bronUrl`, `website`, `spatialUri`, `datasetLicentie` en de externe-bron-URL |
| SEC-019 | `PUT /mijn/profiel` accepteert alleen sleutels onder `profielen/`, dus geen presigned GET meer op willekeurige objecten in de gedeelde bucket |

**Uitvoer en koppelvlakken**

| ID | Fix |
|---|---|
| SEC-009 | `quoteattr()` voor attribuutwaarden in de RSS-feed; `escape()` laat aanhalingstekens staan en die braken het `enclosure`-attribuut open |
| SEC-016 | `/healthz` geeft per component alleen `ok` of `fout`; de uitzonderingstekst met interne hostnamen gaat naar het log |
| SEC-017 | Querywaarden worden als enum getypeerd (`MediaStatus`, `Rol`), dus 422 in plaats van een 500 met stacktrace |

**Toegang en misbruik**

| ID | Fix |
|---|---|
| SEC-011 | De rate limit sleutelt op het verbindings-IP (Traefik is de enige proxy ervoor) in plaats van op de door de client meegestuurde `X-Forwarded-For` |
| SEC-021 | `eis_rol` leest de organisatie niet meer uit de querystring; de scope komt uit het pad en wordt door de route zelf gecontroleerd |
| SEC-014 (deel) | Uitschrijven voor attenderingen gebeurt niet meer met een GET: de link toont een bevestigingspagina en de wijziging loopt via POST, zodat een mailscanner niemand meer ongemerkt uitschrijft |

**Platform**

| ID | Fix | Bewijs |
|---|---|---|
| SEC-015 | Volledige securityheaders (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`) | live gemeten op alle publiekspagina's |
| SEC-013 | Fuseki staat op een eigen netwerk (`rdf`) met alleen api, worker en de datapagina erbij, zodat een SPARQL-query met `SERVICE <...>` geen interne dienst meer bereikt | vóór: `SERVICE <http://minio:9000/>` gaf MinIO's eigen 403 terug (verbinding gelukt); ná: 502, verbinding mislukt. `/sparql` leest gewoon door |
| SEC-018 | Geen werkende credential-defaults meer in `config.py`; ontbrekende variabelen breken de start | |
| SEC-020 | Containers draaien als `jottem` respectievelijk `node` in plaats van root, `.dockerignore` voor api en web, en `/minio/`-paden (metrics en beheer-API) zijn aan de rand afgesloten | `s3.dev.iotm.nl/minio/v2/metrics/cluster` gaf 200, geeft nu 403; `docker compose exec api id -un` → `jottem` |
| SEC-022 | Docstrings die garanties claimden die de code niet waarmaakte (Herkenbaar-check "in een volgende iteratie", sterke factor bij de dev-bypass) zijn bijgewerkt | |

**Eén ding ging onderweg mis en is meteen hersteld:** de CSP brak de annotatielaag, omdat
Annotorious met PIXI tekent en dat `unsafe-eval` nodig heeft. De strenge CSP geldt nu
overal, met één gemotiveerde uitzondering voor `/jottem/*`. En de netwerkisolatie van
Fuseki gaf eerst 504's: Traefik weet bij twee netwerken niet welke hij moet gebruiken,
dus dat staat nu expliciet in een label.

**Nulmeting na deze fase:** 33/33 contract, 27/27 rooktest.

**Doorgeschoven naar fase 7, met reden:**
- SEC-014 (rest): persoonsgegevens in `Gebeurtenislog` vragen om een bewaartermijn en om
  alleen identifiers in de payload; dat is een gegevensmigratie plus een opruimtaak, geen
  patch.
- SEC-020 (rest): de API tekent nog met de MinIO-rootsleutel; een service-account met een
  policy op drie buckets vraagt om nieuwe credentials in `.env` en een rotatiemoment.
- SEC-005 (rest): uitnodigingen lopen nog op e-mailadres; een eenmalig token raakt de
  uitnodigingsmail en de eerste-login-flow.
- De CSP heeft nog `unsafe-inline` voor scripts; een nonce vraagt aanpassing van de
  Next-configuratie.

## Nog te doen in dit traject

| Fase | Inhoud |
|---|---|
| 6 | Schuld 2-5: outbox-dead-letter, N+1, indexen en paginering, seed |
| 7 | Schuld 6-10: sterke factor, blokkerende I/O, omgevingsvariabelen, CI, god-component |

## Bewust niet gedaan (kleinste diff)

- Geen hashes in de pins: dat vraagt `pip-compile`/`uv` in de build. Exacte versies zijn er
  wel, dus de build is nu al reproduceerbaar; hashes zijn een verbetering voor fase 7 (CI).
- Geen opschoning "omdat we er toch waren": codewijzigingen in deze fasen beperken zich tot
  wat de versiewissel of de migratiefout vereiste.
- De `:latest`-images in compose (mailpit, minio, minio/mc, yasgui) staan nog los; die horen
  bij fase 5 (platform).
