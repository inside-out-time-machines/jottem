# Tests

Twee suites, allebei zwart-doos tegen een draaiende omgeving. Ze bewijzen niet dat de
code mooi is, maar dat het naar buiten zichtbare gedrag niet verandert: dat is precies
wat je nodig hebt rond een versie-uplift of een hardening-ronde.

```sh
python3 -m pytest          # contracttests op de API en de open data
node tests/e2e/smoke.mjs   # rooktest in een echte browser
```

Beide draaien standaard tegen dev. Andere omgeving:

| Variabele | Standaard |
|---|---|
| `JOTTEM_API_URL` | `https://api.dev.iotm.nl` |
| `JOTTEM_SITE_URL` | `https://dev.iotm.nl` |
| `JOTTEM_DATA_URL` | `https://data.dev.iotm.nl` |
| `JOTTEM_ANNO_URL` | `https://anno.dev.iotm.nl` |
| `PUPPETEER_PAD` | `/home/http/queue/node_modules/puppeteer` (alleen voor de rooktest) |

## contract/

- `test_publiek.py` - organisaties, organisatie- en projectweergave, jottem-detail,
  paginering, verrijkingencatalogus, health.
- `test_opendata.py` - IIIF-manifest en -collections, CORS voor externe viewers, content
  negotiation (JSON-LD, Turtle, RDF/XML), W3C-annotatiecollecties, RSS, Change Discovery,
  datacatalogus, datasetbeschrijving en de gzip-datadump, Termennetwerk-proxy.
- `test_afscherming.py` - elke beheerroute geeft 401 zonder token, en de dev-bypass
  (`X-Dev-Sub`) werkt niet. Deze tests vallen om zodra `DEV_AUTH=1` blijft staan na een
  handmatige test: dat is opzet.

De tests toetsen statuscode, content-type en de vorm van het antwoord (welke sleutels er
zijn), niet de waarden. Een nieuwe jottem of een gewijzigde titel mag de suite nooit
breken; een gewijzigd contract wel.

## e2e/

`smoke.mjs` laadt vijf publiekspagina's in Chromium en controleert statuscode,
consolefouten en de kernelementen: viewer, annotatielijst, CTA-knoppen, herkomstregel,
huisstijlkleuren in header, footer en knoppen, Open Graph-tags en de afwezigheid van
twitter-tags. De te bezoeken jottem wordt uit de API gehaald (bij voorkeur eentje mét
annotaties), dus er staan geen vaste id's in de test.

## Nulmeting

`analysis/jottem/BASELINE.md` bevat de vastgelegde uitkomst van beide suites op de
versies van vóór de uplift. Dat is de vergelijkingsmaat: na elke fase moet dezelfde
uitkomst eruit komen.
