# Nulmeting Jottem

*Vastgelegd 19 augustus 2026 op commit `4a3a051` (branch `uplift`, fase 0), gemeten tegen
de dev-omgeving: `https://api.dev.iotm.nl`, `https://dev.iotm.nl`, `https://data.dev.iotm.nl`.
Dit is de oracle voor elke volgende fase: na een versiewissel of een fix moet elke regel
hieronder dezelfde uitkomst geven. Een verschil is een regressie of een bewust
gedragsverschil, en wordt in `UPLIFT_NOTES.md` verantwoord.*

**Vorm van het bewijs:** dit is géén dual-run van een bestaande suite (die bestond niet).
De suite is hier gebouwd en pint het gedrag van de huidige versies vast; latere fasen
draaien exact dezelfde suite. De tests zijn zwart-doos over https, dus ze meten het
volledige pad inclusief Traefik, CORS en caching.

## Draaien

```sh
cd /home/http/iotm.nl/jottem
python3 -m pytest          # contracttests (31)
node tests/e2e/smoke.mjs   # rooktest in de browser (27 controles)
```

Andere omgeving: `JOTTEM_API_URL`, `JOTTEM_SITE_URL`, `JOTTEM_DATA_URL`,
`JOTTEM_ANNO_URL`.

## Contracttests: 31 van 31 geslaagd

| Test | Uitkomst |
|---|---|
| `test_publiek.py::test_organisaties_lijst` | geslaagd |
| `test_publiek.py::test_organisatie_publiek` | geslaagd |
| `test_publiek.py::test_organisatie_onbekend_geeft_404` | geslaagd |
| `test_publiek.py::test_project_publiek` | geslaagd |
| `test_publiek.py::test_project_paginering` | geslaagd |
| `test_publiek.py::test_jottem_detail` | geslaagd |
| `test_publiek.py::test_verrijkingencatalogus` | geslaagd |
| `test_publiek.py::test_healthz` | geslaagd |
| `test_opendata.py::test_iiif_manifest` | geslaagd |
| `test_opendata.py::test_iiif_collection_project` | geslaagd |
| `test_opendata.py::test_iiif_collection_organisatie` | geslaagd |
| `test_opendata.py::test_cors_op_open_data` | geslaagd |
| `test_opendata.py::test_cors_preflight_beheeractie_blijft_dicht` | geslaagd |
| `test_opendata.py::test_content_negotiation` | geslaagd |
| `test_opendata.py::test_annotatiecontainer` | geslaagd |
| `test_opendata.py::test_annotatie_aggregaties` | geslaagd |
| `test_opendata.py::test_rss_feeds` | geslaagd |
| `test_opendata.py::test_change_discovery` | geslaagd |
| `test_opendata.py::test_datacatalog` | geslaagd |
| `test_opendata.py::test_datasetbeschrijving` | geslaagd |
| `test_opendata.py::test_datadump` | geslaagd |
| `test_opendata.py::test_termennetwerk` | geslaagd |
| `test_afscherming.py::test_beheer_get_zonder_token` (3 varianten) | geslaagd |
| `test_afscherming.py::test_dev_bypass_staat_uit` (3 varianten) | geslaagd |
| `test_afscherming.py::test_organisatiebeheer_zonder_token` | geslaagd |
| `test_afscherming.py::test_schrijfacties_zonder_token` | geslaagd |
| `test_afscherming.py::test_onbekende_jottem` | geslaagd |

## Rooktest in de browser: 27 van 27 geslaagd

| Pagina | Controle | Gemeten waarde |
|---|---|---|
| home | status, consolefouten, projectkaarten, `og:title`, canonical, geen twitter-tags | 200, 0 fouten, 2 kaarten, "Jottem", `https://dev.iotm.nl/`, 0 |
| organisatie | header in primaire kleur, footer in secundaire kleur, knop in secundaire kleur | `rgb(0, 130, 100)`, `rgb(0, 204, 254)`, `rgb(0, 204, 254)` |
| project | jottemtegels, RSS-alternate, open-datalinks | 6 tegels, RSS aanwezig, 3 links |
| jottem | viewer, CTA-knoppen, annotaties, herkomstregel, `og:image` met afmetingen, geen deelknop zonder Share API | canvas geladen, 6 CTA's, 2 annotaties, 4 herkomstregels, breedte 640, 0 deelknoppen |
| upload | status, consolefouten, vraagt om inloggen | 200, 0 fouten, inlogknop aanwezig |

## Wat de nulmeting bewust niet dekt

- **Ingelogde stromen** (uploaden, modereren, annoteren, beheer). Die vereisen `DEV_AUTH=1`
  of een echte OIDC-sessie; de suite draait juist zonder, zodat hij ook tegen productie kan.
  Voor die stromen blijft de handmatige controle uit de plandocumenten gelden.
- **Verse installatie.** Migratie 0001 laat geen lege database toe (`DuplicateColumn` op
  0002, geverifieerd op 19 augustus 2026). Zodra fase 2 dat herstelt, komt hier een test bij
  die `alembic upgrade head` op een wegwerpdatabase draait.
- **Prestaties.** De suite meet gedrag, geen doorlooptijd; daarvoor is Grafana de bron.
