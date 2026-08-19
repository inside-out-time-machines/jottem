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

## Nog te doen in dit traject

| Fase | Inhoud |
|---|---|
| 3 | Next 15.5.23 → 16.3.1 (ruimt de laatste 3 hoge advisories via `sharp` op), TypeScript 5.9 → 7.0 |
| 4 | Security hoog: Mailpit-default, `/jottem/{id}/detail`, SSRF-resolver, DEV_AUTH, `email_verified` |
| 5 | Security midden en laag: 17 bevindingen, gegroepeerd naar plek |
| 6 | Schuld 2-5: outbox-dead-letter, N+1, indexen en paginering, seed |
| 7 | Schuld 6-10: sterke factor, blokkerende I/O, omgevingsvariabelen, CI, god-component |

## Bewust niet gedaan (kleinste diff)

- Geen hashes in de pins: dat vraagt `pip-compile`/`uv` in de build. Exacte versies zijn er
  wel, dus de build is nu al reproduceerbaar; hashes zijn een verbetering voor fase 7 (CI).
- Geen opschoning "omdat we er toch waren": codewijzigingen in deze fasen beperken zich tot
  wat de versiewissel of de migratiefout vereiste.
- De `:latest`-images in compose (mailpit, minio, minio/mc, yasgui) staan nog los; die horen
  bij fase 5 (platform).
