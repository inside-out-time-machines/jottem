# Playbook: een fase van dit traject uitvoeren

*Geschreven voor iemand die deze sessie niet heeft meegemaakt. Bewezen op fase 1 tot en
met 3 (Next 15.5, de Python-stack, Next 16). Bijwerken zodra een fase iets nieuws leert.*

## Omgevingsfeiten die je moet weten

| Feit | Waarde |
|---|---|
| Werkkopie | `/home/http/iotm.nl/jottem`, branch `uplift` (alles op één branch, commit per fase) |
| Dev-omgeving | `ssh idx@coretidx-de`, stack in `~/jottem/deploy`, staat óók op branch `uplift` |
| Deploy | `git pull` op de server, dan `docker compose up -d --build <service>` |
| Services | `api` en `worker` delen hetzelfde image en dezelfde code: bouw ze altijd samen |
| Testgereedschap lokaal | pytest 8.3.5, httpx 0.28.1, node 22, puppeteer via `/home/http/queue/node_modules/puppeteer` |
| Python in de container | code onder `/srv/api`, dus `docker compose exec api sh -c "cd /srv/api && PYTHONPATH=/srv/api python ..."` |
| S3-helper | `app.s3._client(settings().s3_endpoint)`; buckets heten `s3_bucket_originals`, `_derivaten`, `_thumbs` (niet `s3_bucket`) |
| DEV_AUTH | staat op 0 in `deploy/.env`; alleen tijdelijk op 1 zetten en altijd terugzetten met een 401-controle |

## De vaste volgorde per fase

1. **Nulmeting draaien vóór je iets aanraakt** (moet gelijk zijn aan
   `analysis/jottem/BASELINE.md`):
   ```sh
   cd /home/http/iotm.nl/jottem && python3 -m pytest && node tests/e2e/smoke.mjs
   ```
2. **Wijzigen**, zo klein mogelijk. Frontend: `web/package.json` plus lockfile. Backend:
   `api/requirements.txt`. Platform: `deploy/`.
3. **Lokaal bewijzen** (frontend): `cd web && npx tsc --noEmit && npm run build`.
4. **Committen met het voorvoegsel van de fase** (`uplift next:`, `uplift python:`,
   `security:`, `schuld:`) en pushen.
5. **Uitrollen**: `ssh idx@coretidx-de 'cd ~/jottem && git pull -q && cd deploy && docker
   compose up -d --build web'` (of `api worker`). Wacht 15 seconden voordat je test.
6. **Nulmeting opnieuw draaien.** Elke afwijking van `BASELINE.md` is een bevinding: los
   hem op of verantwoord hem in de commitboodschap.
7. **Aantekening bijwerken** in de commitboodschap en, bij een nieuw inzicht, hier.

## Buildcommando's die bewijzen dat een eenheid klaar is

| Eenheid | Commando |
|---|---|
| web | `cd web && npx tsc --noEmit && npm run build` |
| api en worker | `ssh idx@coretidx-de 'cd ~/jottem/deploy && docker compose build api'` |
| migraties | de migratieproef hieronder |

## Migratieproef op een verse database (verplicht bij elke wijziging in `api/alembic/`)

```sh
ssh idx@coretidx-de 'cd ~/jottem/deploy
  docker compose exec -T postgres psql -U jottem -d postgres -c "CREATE DATABASE versproef;"
  url=$(docker compose exec -T api python -c "from app.config import settings;print(settings().database_url)" | tr -d "\r")
  docker compose run --rm -T -e JOTTEM_DATABASE_URL="${url%/jottem}/versproef" --entrypoint alembic api upgrade head'
```

Vergelijk daarna het resultaat met de gegroeide database op kolommen, indexen én
constraints, en **sorteer beide kanten** voordat je diff draait: `pg_constraint` komt in
OID-volgorde terug en die verschilt per database, wat verschillen suggereert die er niet
zijn. Ruim de wegwerpdatabase daarna op met `DROP DATABASE versproef;`.

## Gestuite fouten en wat hielp

| Fout | Oorzaak | Oplossing |
|---|---|---|
| `DuplicateColumn: column "datasetAangemeld" ... already exists` | `0001_init` deed `Base.metadata.create_all()` tegen de huidige modellen | 0001 vervangen door een bevroren momentopname met expliciete `op.create_table` |
| Verse database had drie constraints te veel | generator zette `unique=True` op kolommen die al een unieke index kregen | kolom-`unique` weghalen waar `create_index(..., unique=True)` staat |
| `ModuleNotFoundError: No module named 'app'` in de container | de code staat in `/srv/api`, niet in de werkmap | `cd /srv/api && PYTHONPATH=/srv/api python ...` |
| `AttributeError: 'Settings' object has no attribute 's3_bucket'` | bucketinstellingen heten anders | `s3_bucket_originals` / `_derivaten` / `_thumbs` |
| Rooktest faalde op "annotaties zichtbaar" | de eerste jottem van het project heeft er geen | test kiest nu een jottem mét annotaties |
| `docker compose run` toonde geen alembic-uitvoer | compose mengt containermeldingen door de uitvoer | uitvoer naar een logbestand schrijven en daarna lezen |

## Wat je niet moet doen

- Geen "omdat we er toch zijn"-opschoning in een upliftcommit: die diff moet klein en
  reviewbaar blijven. Opruimen hoort bij de schuldfasen (6 en 7).
- Geen `docker compose up -d` zonder `--build` na een codewijziging: een gewijzigde
  bind-mounted configuratie of nieuwe requirements komen er anders niet in.
- Geen wegwerpdatabase laten staan.
