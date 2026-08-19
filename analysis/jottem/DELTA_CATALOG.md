# Deltacatalogus uplift Jottem

*Welke brekende en stille verschillen tussen de oude en de nieuwe versies deze code echt
raken. Opgesteld per fase en achteraf getoetst tegen de uitgevoerde uplift, dus wat
hieronder als "geen effect" staat, is geen inschatting maar een waarneming.*

Aard: **mechanisch** = een versiebump of codemod handelt het af; **oordeel** = iemand moet
een keuze maken.

## Fase 1 - Next 15.1.6 → 15.5.23

| # | Delta | Aard | Impact | Uitkomst |
|---|---|---|---|---|
| 1.1 | Beveiligingsadvisories in Next ≤15.5.22 (RCE React-flightprotocol, cache-poisoning-DoS, SSRF) | mechanisch | hele frontend | Opgelost door de bump; `npm audit` ging van 1 kritiek + 2 hoog naar 3 hoog (alleen nog `sharp`) |
| 1.2 | `npm install` in het image negeerde de gecommitte lockfile | oordeel | reproduceerbaarheid | `COPY package.json package-lock.json` + `npm ci` |
| 1.3 | React 19.0 → 19.2 (hoisting van `<meta>`, `<style precedence>`) | mechanisch | Open Graph-tags, huisstijl-CSS in de head | Geen codewijziging nodig; tags en kleuren identiek |

Binnen 15.x zijn er geen API-breuken die deze code raakt: geen middleware, geen
route-segmentconfig, één `fetch(..., { cache: "no-store" })`.

## Fase 2 - Python-stack

| # | Delta | Aard | Impact | Uitkomst |
|---|---|---|---|---|
| 2.1 | **celery pint `redis<6.0.0`** (in de container geverifieerd), dus redis 8 kan niet los | oordeel | worker, alle Valkey-caches | celery 5.4 → 5.6.3 samen met redis 5.2 → 8.1.0; `redis.Redis.from_url`, `get`, `setex` ongewijzigd |
| 2.2 | pyvips 2 → 3 (libvips-CVE's) | mechanisch | derivatenpijplijn | `Image.new_from_buffer` ongewijzigd; getoetst op een bestaand origineel (1849×1200 → 400 px) |
| 2.3 | fastapi 0.115 → 0.141 met starlette mee | mechanisch | alle 59 endpoints | Geen codewijziging; contracttests reproduceren de nulmeting |
| 2.4 | pydantic-settings 2.6 → 2.15 | mechanisch | `app/config.py` | Geen wijziging nodig; instellingen laden identiek |
| 2.5 | rdflib 7.1 → 7.6 (serialisatievolgorde is niet gegarandeerd) | stil gedrag | Turtle, RDF/XML, N-Triples-dump | Getoetst: content negotiation en dump ongewijzigd van vorm |
| 2.6 | alembic 1.14 → 1.19 | mechanisch | migraties | Geen wijziging; `upgrade head` draait door |
| 2.7 | Wildcard-pins: de gedraaide versie was niet reproduceerbaar | oordeel | build | `api/requirements.txt` volledig op exacte versies |
| 2.8 | **Niet uit de versiewissel maar eruit voortkomend:** `0001_init` deed `create_all()`, waardoor een verse database bij 0002 omviel | oordeel | installatie en herstel | 0001 bevroren; verse database komt tot 0009 met een identiek schema |

**Wat de catalogus vooraf niet had:** (a) de bevroren 0001 kreeg per abuis zowel een
kolom-`unique` als een unieke index, wat op een verse database drie extra constraints gaf;
(b) een schemavergelijking tussen twee databases sorteert op OID, wat verschillen
suggereert die er niet zijn.

## Fase 3 - Next 15.5.23 → 16.3.1 en TypeScript 5.9 → 7.0.2

| # | Delta | Aard | Impact | Uitkomst |
|---|---|---|---|---|
| 3.1 | Laatste hoge advisories (`sharp <0.35.0`, libvips) zaten vast aan Next 15 | mechanisch | build en beeldverwerking | Weg met Next 16: `npm audit` meldt **0 kwetsbaarheden** |
| 3.2 | Async request-API's (`params`, `searchParams`) | mechanisch | alle dynamische routes | Al async sinds de bouw; geen wijziging |
| 3.3 | Caching-standaarden herzien | stil gedrag | `web/lib/api.ts` | Wij zetten expliciet `cache: "no-store"`; geen wijziging |
| 3.4 | `next.config.ts`-opties (`output: "standalone"`, `headers()`) | mechanisch | build en fonts-CORS | Onveranderd geldig |
| 3.5 | Geen middleware, geen `instrumentation.ts`, geen route-segmentconfig, geen `next/font`, geen `next/image` | - | - | De hele klasse Next 16-breuken raakt deze code niet |
| 3.6 | TypeScript 5.9 → 7.0.2 (native compiler) | mechanisch | typecheck | `tsc --noEmit` schoon, `next build` schoon met dezelfde `tsconfig.json` |

**Signaal uplift versus herschrijven:** de blast radius bleef in alle drie de fasen klein
(twee bestanden in fase 1, één requirements-bestand plus één migratie in fase 2, één
package-bestand in fase 3). Dit was terecht een uplift, geen herschrijving.
