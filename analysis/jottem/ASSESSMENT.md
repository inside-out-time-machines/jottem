# Modernisatie-assessment Jottem

*Opgesteld 19 augustus 2026 op commit `4a3a051`. Meetgereedschap: `scc` (regels en
complexiteit), `lizard` (cyclomatische complexiteit per functie), `npm outdated` /
`npm audit`, `pip list --outdated`, en Prometheus op de dev-omgeving. Bevindingen die ik
zelf tegen de draaiende stack heb getoetst zijn gemarkeerd met **[geverifieerd]**;
bevindingen uit codeanalyse zonder uitvoering met **[uit code]**.*

## Managementsamenvatting

Jottem is geen legacy-systeem maar een jonge, goed gestructureerde MVP: 10.748 regels
code in twee applicaties (FastAPI-backend, Next.js-frontend) plus een compose-stack van
33 services, gebouwd in vier maanden en sinds augustus 2026 draaiend op de
dev-omgeving. De architectuur is helder in twaalf domeinen te lezen, de standaarden aan
de buitenkant (IIIF, W3C Web Annotations, schema.org AP NDE) zijn daadwerkelijk
geïmplementeerd, en SQL-injectie, template-injectie en de OIDC-flow zijn netjes
afgedekt.

Het risico zit niet in de bedrijfslogica maar op de randen en in de operatie. Drie zaken
verdienen aandacht vóór livegang: **een verse database komt de migraties niet door**
(geverifieerd: `alembic upgrade head` breekt op migratie 0002), **`GET /jottem/{id}/detail`
is onbeveiligd** en levert presigned originelen van niet-gemodereerd en gedepubliceerd
materiaal, en **de SSRF-bescherming in de bronnenresolver wordt door redirects omzeild**.
Daarnaast draait het geheel zonder enige test, zonder CI en zonder security-headers.

Aanbevolen patroon: **Refactor-in-place met een versie-uplift** - niet herbouwen, maar
hardenen, afhankelijkheden bijwerken en de ontbrekende testlaag toevoegen.

## Systeeminventaris

`scc`, exclusief `node_modules`, `.next`, `.git` en `__pycache__`:

| Taal | Bestanden | Regels code | Complexiteit |
|---|---:|---:|---:|
| Python | 43 | 3.931 | 616 |
| TypeScript | 35 | 4.169 | 660 |
| YAML | 12 | 1.070 | 0 |
| Jinja (mailsjablonen) | 22 | 108 | 8 |
| CSS | 1 | 314 | 0 |
| Overig (HTML, JSON, shell, Dockerfile, VCL, SVG) | 31 | 1.156 | 13 |
| **Totaal** | **144** | **10.748** | **1.297** |

Gemiddelde cyclomatische complexiteit 3,4 over 555 functies (lizard); 13 functies boven
de drempel. Zwaarste bestanden: `web/app/jottem/[id]/interactief.tsx` (650 regels,
complexiteit 199), `web/app/upload/page.tsx` (65), `api/app/routers/annotaties.py` (76),
`api/app/routers/jottem.py` (56), `api/app/worker.py` (53).

**Technologievingerafdruk**

| Laag | Wat | Bewijs |
|---|---|---|
| Backend | FastAPI 0.115 op Python 3.12, SQLAlchemy 2.0, Alembic (10 migraties), Celery 5.4, rdflib 7.1, pyvips 2.2 | `api/requirements.txt`, `api/Dockerfile:11` |
| Frontend | Next.js 15.1.6 (App Router, React 19) op Node 22, OpenSeadragon + Annotorious, Leaflet, MapLibre | `web/package.json`, `web/Dockerfile:2` |
| Datastores | PostgreSQL 17 (bron van waarheid), MongoDB 6 achter AnnoRepo 0.9 (annotaties), Fuseki 6.2 (RDF), MinIO (S3), Valkey 8 (cache) | `deploy/docker-compose.yml` |
| Identiteit | Authentik 2025.6, declaratief via blueprints; OIDC code+PKCE | `deploy/authentik-blueprints/`, `web/lib/oidc.ts` |
| Beeld | Cantaloupe 5.0.7 achter Varnish 7.6, pyramidal TIFF-derivaten | `api/app/derivaten.py`, `deploy/varnish/default.vcl` |
| Routing en observability | Traefik v3.6, Prometheus 2.53 + Grafana 11.2 met vier exporters | `deploy/monitoring/` |
| Koppelvlakken | 59 REST-endpoints (33 GET, 13 POST, 8 PUT, 5 DELETE), IIIF Presentation/Image, W3C Annotation Protocol, RSS, SPARQL, NDE Datasetregister, Termennetwerk-GraphQL, Herkenbaar API | `api/app/routers/` |
| Tests | **geen** - `tests/` is leeg, geen testrunner, geen CI-configuratie | `tests/`, `web/package.json` |

## Architectuur in één oogopslag

Twaalf domeinen in vier lagen; het diagram staat in `ARCHITECTURE.mmd` (37 randen, twee
bewuste cycli: ANNO ↔ PUB via de canvas-IRI en OPEN ↔ BEH via de dataset-flow).

| Domein | Doel | Kernbestanden |
|---|---|---|
| **DATA** | Datamodel, sessies, migraties, seed | `api/app/models.py`, `db.py`, `schemas.py`, `alembic/versions/`, `seed.py` |
| **IAM** | OIDC-validatie, rollen uit de database, sterke factor, profiel | `api/app/auth.py`, `routers/mijn.py`, `web/lib/oidc.ts`, `deploy/authentik-blueprints/` |
| **EVENT** | Gebeurtenislog, outbox, worker, mail | `api/app/outbox.py`, `worker.py`, `mail.py`, `api/templates/mail/` |
| **UPLOAD** | Presigned upload, externe bronnen, portretrechtsignaal | `api/app/routers/upload.py`, `bronnen.py`, `herkenbaar.py`, `web/app/upload/` |
| **MOD** | Moderatiewachtrij, goed- en afkeuren, meldingen | `api/app/routers/moderatie.py`, `web/app/moderatie/page.tsx` |
| **ANNO** | Verrijkingencatalogus, W3C-annotaties, AnnoRepo | `api/app/verrijkingen.py`, `anno.py`, `routers/annotaties.py`, `web/app/jottem/[id]/` |
| **PUB** | Duurzame URL, content negotiation, IIIF-manifest, publiekspagina's | `api/app/routers/jottem.py`, `publiek.py`, `web/app/organisatie/`, `web/lib/kleuren.ts` |
| **IIIF** | Derivaten, image-URL's, objectopslag, tilescache | `api/app/derivaten.py`, `iiif.py`, `s3.py`, `deploy/varnish/` |
| **OPEN** | RDF, Fuseki, Collections, Change Discovery, RSS, dump, NDE-register | `api/app/rdf.py`, `fuseki.py`, `routers/opendata.py`, `routers/dataset.py` |
| **BEH** | Organisaties, huisstijl, projecten, uitnodigingen, rollen | `api/app/routers/organisatiebeheer.py`, `projectbeheer.py`, `web/app/beheer/` |
| **TERM** | Termennetwerk-proxy met cache, GeoNames-coördinaten | `api/app/routers/termennetwerk.py`, `geo.py` |
| **PLAT** | Compose-stack, TLS-routing, CORS, health, monitoring | `deploy/docker-compose.yml`, `api/app/main.py`, `deploy/monitoring/` |

## Runtimeprofiel

Prometheus draait mee (9 scrape-targets, allemaal up). Cijfers over 24 uur, gemeten aan
de Traefik-histogrammen. **Belangrijke beperking:** dit is dev-verkeer (ontwikkeltests en
handmatig browsen), en Traefik gebruikt standaardbuckets van 0,1 / 0,3 / 1,2 / 5 s, dus
percentielen binnen een bucket zijn interpolatie. De bucketverdeling zelf is wél hard.

| Dienst | Domein | Requests/24u | < 0,1 s | < 1,2 s | > 5 s |
|---|---|---:|---:|---:|---:|
| `auth@docker` (Authentik) | IAM | 283 | 244 | 251 | **23 (8%)** |
| `api@docker` | alle backend-domeinen | 46 | 46 | 46 | 0 |
| `web@docker` | PUB | 119 | 111 | 119 | 0 |
| `anno@docker` | ANNO | 1.286 | - | - | 0 |
| `datapagina@docker` | OPEN | 1.401 | - | - | 0 |
| `grafana@docker` | PLAT | 7.953 | - | - | 0 |

**Hoogste variantie: het IAM-domein.** 8% van de Authentik-requests duurt langer dan
vijf seconden, terwijl API en frontend volledig binnen 100 ms blijven. Dat is de enige
plek waar de staart uit beeld loopt en het raakt de inlogervaring direct.

**Meetgat:** de API en de frontend leveren zelf geen metrics; er is geen scrape-target
voor de applicatie. Er is dus geen zicht op endpoint-latency, databasetijd of
outbox-achterstand. Aanbeveling: `prometheus-fastapi-instrumentator` op de API, een
Celery-metric voor de outbox-leeftijd, en fijnere histogram-buckets in Traefik.

## Technische schuld (top 10)

| # | Bevinding | Bewijs | Fix |
|---|---|---|---|
| 1 | **Een verse database komt de migraties niet door.** `0001_init` doet `Base.metadata.create_all()` tegen de *huidige* modellen, dus een lege database krijgt meteen alle latere kolommen; 0002 valt daarna om. Alleen de meegegroeide dev-database overleeft. Herstel uit back-up en elke nieuwe omgeving lopen vast. **[geverifieerd:** op een wegwerpdatabase gaf `alembic upgrade head` `DuplicateColumn: column "datasetAangemeld" of relation "project" already exists`**]** | `api/alembic/versions/0001_init.py:17`, `0002_dataset_aangemeld.py:17`, `deploy/docker-compose.yml:259` | Vervang 0001 door een bevroren `op.create_table()`-momentopname en toets `upgrade head` op een lege database in CI |
| 2 | **De outbox is een gifpil: één slechte rij blokkeert alle mail.** `verwerk_outbox` kent geen per-rij `try/except` en geen pogingenteller; een ontbrekende mediarij of SMTP-fout breekt de batch vóór `verwerktOp` wordt gezet, waarna dezelfde 50 rijen elke 10 seconden opnieuw worden opgehaald. **[uit code]** | `api/app/worker.py:49-77`, `derivaten.py:36`, `mail.py:65` | Per rij afvangen en committen, kolom `pogingen`/`laatsteFout` met dead-letter-drempel |
| 3 | **N+1 met externe fan-out op de startpagina.** `GET /organisaties` doet een projectquery per organisatie, een COUNT per project en vervolgens één HTTP-call naar AnnoRepo *per gepubliceerde jottem*, elk met een nieuwe httpx-client; de startpagina rendert server-side met `no-store`. **[uit code]** | `api/app/routers/mijn.py:165-205`, `anno.py:122,140`, `web/app/page.tsx:31-37` | `selectinload` + één `GROUP BY`, annotatietellingen door de worker laten bijhouden |
| 4 | **Geen paginering en geen indexen op de foreign keys.** Moderatiewachtrij, "mijn jottems", IIIF Collections, Change Discovery, RDF-dump en annotatie-aggregaties laden volledige resultaatsets; alleen `Media.status` is geïndexeerd. **[uit code]** | `api/app/routers/opendata.py:45-52,113-136`, `moderatie.py:38-49`, `models.py:147-163` | Migratie met samengestelde indexen op `media(projectId,status)` en `media(organisatieId,status)`; paginering zoals `project_publiek` die al heeft |
| 5 | **De seed zet bij elke start platformbeheerder-rollen terug** op een hardgecodeerd e-mailadres, ook in de "bestaat al"-tak. Een via de beheer-UI ingetrokken rol komt bij de volgende herstart terug. **[geverifieerd in code:** `seed.py:40` roept `zet_beheerder_klaar` onvoorwaardelijk aan**]** | `api/app/seed.py:11-32,40`, `deploy/docker-compose.yml:259` | Adres naar een instelling, seed alleen bij een lege organisatietabel en alleen in dev |
| 6 | **De sterke-factor-eis wordt inconsistent afgedwongen.** Alleen `eis_rol` toetst `amr`; projectbeheer, de dataset-flow, uitnodigingen en rolintrekking gebruiken een handmatige `heeft_rol`-check zonder die toets. **[uit code]** | `api/app/auth.py:135-143`, `routers/projectbeheer.py:32-34`, `routers/dataset.py:142` | Gedeelde `eis_sterke_factor`-helper in elke handmatige tak |
| 7 | **Alle 59 handlers zijn `async def` maar doen blokkerende I/O** (SQLAlchemy, boto3, smtplib, synchrone httpx). De Herkenbaar-check leest het volledige S3-object in het geheugen met 60 s timeout binnen `POST /jottem`. Eén trage upload bevriest de event loop. **[uit code]** | `api/app/routers/upload.py:73-114`, `herkenbaar.py:16-34` | Blokkerende handlers als `def` (threadpool) en de Herkenbaar-check naar de worker |
| 8 | **Hardgecodeerde omgeving blokkeert promotie voorbij dev.** Dev-identiteiten in de frontend, één vaste tenant in het moderatiescherm, `dev.iotm.nl` 32 keer in compose, en de webbuild krijgt `NEXT_PUBLIC_OIDC_ISSUER` niet mee. **[uit code]** | `web/app/moderatie/page.tsx:19`, `web/lib/api.ts:10-23`, `web/Dockerfile:8-11` | `${BASISDOMEIN}`-variabele, tenant uit `/mijn/profiel.rollen` |
| 9 | **Geen tests, geen linting, geen CI, en een niet-reproduceerbare frontendbuild.** `tests/` is leeg terwijl de README contract- en e2e-tests aankondigt; vijf bestanden onderdrukken een ESLint-regel terwijl ESLint niet geïnstalleerd is; het webimage draait `npm install` zonder de gecommitte lockfile. **[geverifieerd:** `tests/` bevat 0 bestanden**]** | `tests/`, `README.md:15`, `web/Dockerfile:5-6` | `npm ci` met lockfile, pytest en eslint toevoegen, beginnen bij de moderatie-statemachine |
| 10 | **God-component, duplicatie en dode code.** `interactief.tsx` is 720 regels met viewer, annotatielijst, termzoek, zeven dialoogvarianten en alle mutaties, en parseert dezelfde GeoJSON tweemaal. `_organisatie(db, slug)` staat in vier routers. `Favoriet` en `Verwijderverzoek` worden nooit gelezen of geschreven, en `MediaStatus.gedepubliceerd` wordt nergens toegekend, waardoor de 410-tombstone en de `Delete`-tak van de Change Discovery onbereikbaar zijn. **[geverifieerd:** alleen `nieuw`/`goedgekeurd`/`afgekeurd` worden geschreven, in `moderatie.py:71,83,118`**]** | `web/app/jottem/[id]/interactief.tsx`, `api/app/models.py:187-208`, `routers/jottem.py:115` | Component opsplitsen, gedeelde helpers, depubliceren implementeren of de dode modellen schrappen |

## Securitybevindingen

Volledige lijst met 22 items in de auditbijlage hieronder samengevat; ik heb de zwaarste
zelf nagemeten. **Geen enkel echt geheim staat in git**: `.env*` is gitignored en
`deploy/.env.example` bevat alleen `wijzig-mij`-placeholders.

| Sev | CWE | Locatie | Bevinding | Status |
|---|---|---|---|---|
| Hoog | CWE-306 | `deploy/docker-compose.yml:338-347` | Mailpit is publiek gerouteerd met `MP_UI_AUTH: ${MAILPIT_UI_AUTH:-}`, dus **zonder waarde valt hij open** terwijl Authentik er wachtwoordherstelmails naartoe stuurt | **[geverifieerd: op dev staat de basic-auth wél ingevuld, `mail.dev.iotm.nl` geeft 401]** - het risico is de lege default, niet de huidige stand |
| Hoog | CWE-639 / CWE-200 | `api/app/routers/jottem.py:231-237` | `GET /jottem/{id}/detail` kent geen authenticatie en geen statusfilter, en levert een presigned S3-URL naar het origineel - ook voor `nieuw`, `afgekeurd` en `gedepubliceerd`. Gedepubliceerde id's staan publiek in de Change Discovery-stream | **[geverifieerd in code: geen `Depends(principal)`, geen statuscheck]** |
| Hoog | CWE-918 | `api/app/bronnen.py:48-63,111,146,177` | De private-IP-check resolvet één keer en daarna wordt met `follow_redirects=True` gefetcht: een redirect naar `http://minio:9000/` of een metadata-IP omzeilt de check volledig, en de uit het manifest gelezen service-URL wordt helemaal niet gevalideerd | **[uit code]** |
| Hoog | CWE-489 | `api/app/auth.py:112-114`, `seed.py:42-83` | Met `JOTTEM_DEV_AUTH=1` maakt de header `X-Dev-Sub: dev-piet` je platformbeheerder, inclusief een gefabriceerde `amr=["totp"]` die de sterke-factor-poort passeert; de dev-accounts worden bij elke start geseed | **[uit code; DEV_AUTH staat nu op 0]** |
| Hoog | CWE-287 / CWE-290 | `api/app/auth.py:87-99` | Koppeling van een OIDC-identiteit aan een klaargezette rol gebeurt op e-mailadres zonder `email_verified`-controle, terwijl social login op `email_link` matcht | **[uit code]** |
| Middel | CWE-434 / CWE-770 | `api/app/s3.py:28-41`, `routers/upload.py:33-44` | De presigned PUT begrenst alleen bucket, sleutel en content-type: de gevalideerde `grootte` wordt nergens afgedwongen en de bytes worden niet tegen het MIME-type gecontroleerd voordat pyvips ze parseert | **[uit code]** |
| Middel | CWE-22 | `api/app/routers/upload.py:38` en drie andere routers | De objectsleutel wordt uit de door de client aangeleverde bestandsnaam gebouwd zonder allowlist, zodat een `../`-extensie buiten het bedoelde prefix in de gedeelde thumbs-bucket schrijft | **[uit code]** |
| Middel | CWE-20 | `api/app/schemas.py:35`, `rdf.py:89-94` | Vrije metadata is onbegrensd en ongevalideerd; `lat: "abc"` laat `float()` klappen in de RDF-opbouw, wat de dump, de datasetbeschrijving en de nachtelijke Fuseki-sync van het hele project meeneemt | **[uit code]** |
| Middel | CWE-91 | `api/app/routers/opendata.py:219,232` | `xml.sax.saxutils.escape` escapet geen aanhalingstekens, terwijl de waarde in een `url="..."`-attribuut van de RSS-enclosure staat en uit een externe, door de gebruiker aangeleverde foto-URL kan komen | **[uit code]** |
| Middel | CWE-1021 / CWE-522 | `web/next.config.ts:5-14` | Geen CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` of HSTS, terwijl OIDC-tokens in `sessionStorage` staan en de pagina drie externe viewerbundels laadt | **[geverifieerd: 0 van deze headers in het antwoord van dev.iotm.nl]** |
| Middel | CWE-918 / CWE-1188 | `deploy/docker-compose.yml:185-199`, `deploy/datapagina/default.conf` | Het publieke `/sparql` accepteert willekeurige queries; SPARQL `SERVICE` maakt daar federatieve SSRF naar het Dockernetwerk van, en Fuseki start met een leeg admin-wachtwoord als de variabele ontbreekt | **[uit code]** |
| Middel | CWE-807 | `api/app/routers/annotaties.py:312-322` | De enige rate limit sleutelt op de door de client meegestuurde `X-Forwarded-For`; upload, externe-bron-resolver en Termennetwerk-proxy kennen helemaal geen limiet | **[uit code]** |
| Middel | CWE-1395 | `web/package.json:15`, `api/requirements.txt` | `npm audit`: 1 kritiek en 2 hoog op de vastgezette Next-versie (waaronder RCE in het React-flightprotocol) plus libvips-CVE's in `sharp`; alle Python-pins zijn wildcards, dus de gedraaide versie is niet reproduceerbaar | **[geverifieerd via npm audit / pip list --outdated]** |
| Laag | CWE-250 | beide Dockerfiles, `deploy/docker-compose.yml:69,265` | Containers draaien als root, er is geen `.dockerignore`, de MinIO-metrics zijn anoniem leesbaar op de publieke S3-host en de API tekent met de MinIO-**root**-credentials | **[geverifieerd: `s3.dev.iotm.nl/minio/v2/metrics/cluster` geeft 200]** |
| Laag | CWE-209 / CWE-248 | `api/app/main.py:82-102`, `routers/moderatie.py:40` | `/healthz` echoot ruwe verbindingsfouten met interne hostnamen; ongevalideerde querywaarden worden rechtstreeks in enums gecast, wat een 500 met stacktrace geeft | **[uit code]** |
| Laag | CWE-639 | `api/app/routers/mijn.py:71-72` | `PUT /mijn/profiel` accepteert elke string als `afbeelding` en tekent daar vervolgens een presigned GET voor, dus elke sleutel in de thumbs-bucket is te lezen | **[uit code]** |

Wat aantoonbaar goed zit: geen SQL-injectie (SQLAlchemy parametriseert overal),
autoescaping in de mailsjablonen, OIDC met PKCE en state-validatie, de open-data-CORS
beperkt de wildcard tot veilige methodes en strippt `Allow-Credentials`, en rolchecks
worden per organisatie herhaald.

Credentialinventaris: `SECRETS.local.md` in deze map (gitignored, niet delen).

## Documentatiehiaten

De README is 56 regels en beschrijft structuur, dev-omgeving en ontwerplinks. 88% van de
Python-modules heeft een docstring-kop, 71% van de frontendbestanden een toelichting.
Wat een nieuwe ontwikkelaar mist:

1. **De outbox-worker als spil.** Dat elke mutatie via `Gebeurtenislog` loopt en de
   worker daaruit derivaten, mail, AnnoRepo-sync en RDF-hersync afleidt, staat nergens;
   het beat-schema (10 s / 18:00 / 4:30) al helemaal niet.
2. **De open-datapijplijn.** Hoe RDF, Fuseki-grafen, dump-caching, Change Discovery en
   de NDE-registerflow samenhangen, en waarom `rights` in IIIF http is en in RDF https.
3. **Het uploadmodel.** Vier uploadwijzen, per project instelbaar, met het
   Herkenbaar-signaal en de toestemmingsvlag - en dat de docstring in
   `routers/upload.py:5-6` verouderd is (hij belooft de check "in een volgende iteratie",
   terwijl die synchroon draait).
4. **De huisstijllaag.** De CSS-variabelen die organisatiekleuren over de basislaag
   leggen (`web/lib/kleuren.ts`), inclusief de contrastregels, zijn nieuw en ongedocumenteerd.
5. **De dev-bypass en de seed.** Wat `DEV_AUTH=1` precies openzet en welke accounts de
   seed aanmaakt, is operationeel kritisch en staat alleen impliciet in de code.

Verder: `tests/` wordt in de README aangekondigd als contract- en end-to-end-tests maar
is leeg, en vijf van de elf mailsjablonen hebben geen enkele afzender in de code.

## Relatieve omvang

COCOMO-II basisformule met nominale schaalfactoren: 2,94 × (10,748 KSLOC)^1,10 ≈ **40**.

Dit is uitsluitend een **relatieve omvang- en complexiteitsindex** om dit systeem tegen
andere te kunnen rangschikken. Het is **geen doorlooptijd, geen planning en geen
kostenraming**: de formule veronderstelt de productiviteitscurve van een klassiek
mensenteam, en agentische ontwikkeling volgt die curve niet. De cijfers over kosten en
maanden die `scc` zelf afdrukt zijn om dezelfde reden bewust weggelaten.

Ter context: 10,7 KSLOC is klein, en 33 samenwerkende services maken de
*operationele* complexiteit aanzienlijk groter dan de codeomvang suggereert. De
zwaartepunten liggen bij de frontend (4,2 KSLOC, waarvan 15% in één bestand) en de
compose-stack (1,1 KSLOC YAML).

## Aanbevolen moderniseringspatroon

**Refactor-in-place met versie-uplift** → `/modernize-uplift`.

Herbouwen of herarchitecteren is hier niet aan de orde: de domeinindeling is helder, de
standaarden aan de buitenkant zijn correct geïmplementeerd en de code is jong en
leesbaar. Wat ontbreekt is niet structuur maar *hardening en houdbaarheid*. De volgorde
die ik zou aanhouden:

1. **Blokkerend voor livegang.** Migratie 0001 bevriezen zodat een verse installatie
   werkt; `/jottem/{id}/detail` achter authenticatie; de SSRF-resolver herschrijven met
   validatie per redirect-hop; de lege default van `MAILPIT_UI_AUTH` laten falen in
   plaats van openvallen; `DEV_AUTH` weigeren buiten dev.
2. **Uplift.** Next naar een gepatchte 15.5.x (of 16 in één keer), FastAPI, redis, pyvips
   en alembic bijwerken, Python-pins vastzetten met hashes, `npm ci` met lockfile,
   `:latest`-images vastpinnen, en `npm audit` plus `pip-audit` in CI.
3. **Houdbaarheid.** Een testlaag beginnen bij de moderatie-statemachine en de
   annotatiebouwer, de outbox per rij afvangen met dead-letter, indexen en paginering
   toevoegen, applicatiemetrics aan Prometheus hangen, en `interactief.tsx` opsplitsen.
4. **Opruimen.** Depubliceren implementeren of de onbereikbare tombstone en de dode
   tabellen (`Favoriet`, `Verwijderverzoek`) schrappen.
