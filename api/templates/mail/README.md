# Notificatiemail-templates

Template-gebaseerde notificatiemails voor het Jottem-platform, conform het
[notificatie-overzicht](https://design.iotm.nl/#notificaties) in het ontwerpdocument.

## Werking

Per notificatie drie sjablonen in `nl/`:

| Bestand | Rol |
|---|---|
| `<slug>.mjml` | HTML-mail in [MJML](https://mjml.io/); `./build.sh` compileert naar `dist/nl/<slug>.html.j2` (vereist Node/npx; `dist/` staat niet in git) |
| `<slug>.subject.j2` | onderwerpregel |
| `<slug>.txt.j2` | platte-tekstversie |

De mailworker rendert de drie sjablonen met **Jinja2** en verstuurt de mail als
`multipart/alternative` (HTML + tekst). MJML laat de Jinja-placeholders (`{{ … }}`,
`{% … %}`) ongemoeid, dus de volgorde is: eenmalig MJML-compileren (buildstap), per mail
Jinja-renderen (runtime).

Gedeelde partials: `partials/header.mjml` (logo en kleur van de organisatiejottem) en
`partials/footer.mjml` (afzenderregel; toont automatisch een uitschakellink wanneer
`uitschakelUrl` is meegegeven). De mapstructuur is per taal (`nl/`) zodat meertaligheid
later zonder verbouwing kan.

## Variabelen

Altijd beschikbaar: `organisatie.naam`, `organisatie.logoUrl`, `organisatie.kleurPrimair`,
`ontvangerNaam`, `platformUrl`. Links eindigen op `…Url`.

| Template | Extra variabelen |
|---|---|
| `uitnodiging-organisatiebeheerder` | `uitnodigerNaam`, `bevestigingsUrl`, `spelregelsUrl` |
| `uitnodiging-moderator` | `uitnodigerNaam`, `bevestigingsUrl`, `spelregelsUrl`, `handreikingUrl` |
| `uitnodiging-projectlid` | `uitnodigerNaam`, `projectNaam`, `projectUrl`, `wachtwoordUrl`, `alBekend` (true = al eens ingelogd: "log in" in plaats van de wachtwoordlink) |
| `jottem-goedgekeurd` | `jottemTitel`, `jottemUrl`, `projectNaam` |
| `jottem-afgekeurd` | `jottemTitel`, `afkeurReden`, `herindienUrl` |
| `moderatie-digest` | `aantalWachtend`, `wachtrij[]` (`titel`, `projectNaam`, `ingediendOp`), `aantalMeldingen`, `aantalVerzoeken`, `aantalVlakken`, `oudsteVerzoekDagen`, `escalatie`, `wachtrijUrl` |
| `verwijderverzoek-bevestiging` | `jottemTitel`, `verzoekNummer`, `termijnDagen` |
| `verwijderverzoek-melding` | `jottemTitel`, `verzoekNummer`, `reden`, `termijnDagen`, `afhandelUrl` |
| `verwijderverzoek-uitkomst` | `jottemTitel`, `verzoekNummer`, `uitkomst` (gehonoreerd/afgewezen), `toelichting` |
| `export-gereed` | `projectNaam`, `downloadUrl`, `bewaartermijnDagen` |
| `attendering-jottem` | `jottemTitel`, `jottemUrl`, `aantalNieuw`, `uitschakelUrl` |
| `attendering-annotatie` | `jottemTitel`, `annotatieUrl`, `aantalNieuw`, `uitschakelUrl` |

## Welke sjablonen worden al verstuurd?

Eén sjabloon staat klaar voor een functie die nog niet gebouwd is en heeft dus (nog)
geen afzender in de code: `export-gereed` (e-depot-export, fase 2). Het is bewust bewaard: het realisatieplan plant die functie, en de tekst is al op
B1-niveau geredigeerd. Wie op zoek is naar dode code: dit is grondwerk, geen restant.

De rest wordt wél verstuurd (`moderatie-digest` dagelijks om 08:00 door de worker), vanuit `api/app/routers/moderatie.py`,
`api/app/routers/organisatiebeheer.py`, `api/app/routers/verwijderverzoeken.py` (mails 6-8)
en `api/app/worker.py`. Bij `verwijderverzoek-uitkomst` is `uitkomst` "gehonoreerd" voor
zowel depubliceren als wissen.

## Regels

- Transactionele mails (uitnodigingen, moderatie-uitkomsten, verwijderverzoeken, export) zijn
  niet uitschakelbaar; de twee attenderingen wel (uitschakellink in de voet, instelbaar in
  het profiel) en worden gebundeld tot maximaal één mail per dag.
- Zo min mogelijk persoonsgegevens in de mail (AVG): links naar de pagina, geen inhoudelijke
  kopie van bijdragen.
- Elke verzending wordt (zonder inhoud) als type geregistreerd in het Gebeurtenislog.
