"""Publieke pagina-endpoints: de vorm van het antwoord, niet de inhoud.

We toetsen statuscode, content-type en welke sleutels aanwezig zijn. Waarden zoals
aantallen en titels veranderen bij elke nieuwe jottem en horen dus niet in een
contracttest.
"""
import httpx


def test_organisaties_lijst(api: httpx.Client):
    antwoord = api.get("/organisaties")
    assert antwoord.status_code == 200
    assert antwoord.headers["content-type"].startswith("application/json")
    org = antwoord.json()[0]
    assert {"slug", "naam", "beschrijving", "kleurPrimair", "kleurSecundair",
            "spatialLat", "spatialLon", "logoUrl", "faviconUrl", "projecten"} <= set(org)
    project = org["projecten"][0]
    assert {"projectId", "naam", "slug", "oproep", "datasetLicentie", "uploadWijzen",
            "aantalJottems", "aantalAnnotaties"} <= set(project)


def test_organisatie_publiek(api: httpx.Client, organisatie: dict):
    antwoord = api.get(f"/organisatie/{organisatie['slug']}/publiek")
    assert antwoord.status_code == 200
    body = antwoord.json()
    assert {"naam", "slug", "beschrijving", "website", "kleurPrimair", "kleurSecundair",
            "kleurAchtergrond", "logoUrl", "projecten"} <= set(body)


def test_organisatie_onbekend_geeft_404(api: httpx.Client):
    assert api.get("/organisatie/bestaat-niet-xyz/publiek").status_code == 404


def test_project_publiek(api: httpx.Client, organisatie: dict, project: dict):
    antwoord = api.get(f"/organisatie/{organisatie['slug']}/project/{project['slug']}/publiek")
    assert antwoord.status_code == 200
    body = antwoord.json()
    assert {"projectId", "naam", "slug", "organisatieSlug", "organisatieNaam",
            "kleurPrimair", "kleurSecundair", "logoUrl", "beschrijving", "oproep",
            "periode", "datasetLicentie", "afbeeldingUrl", "aantalJottems", "jottems",
            "pagina", "paginas"} <= set(body)
    if body["jottems"]:
        assert {"mediaId", "titel", "thumbnailUrl", "publicatieDatum"} <= set(body["jottems"][0])


def test_project_paginering(api: httpx.Client, organisatie: dict, project: dict):
    pad = f"/organisatie/{organisatie['slug']}/project/{project['slug']}/publiek"
    assert api.get(pad, params={"pagina": 1}).json()["pagina"] == 1
    assert api.get(pad, params={"pagina": 0}).status_code == 422


def test_jottem_detail(api: httpx.Client, jottem_id: str):
    antwoord = api.get(f"/jottem/{jottem_id}/detail")
    assert antwoord.status_code == 200
    body = antwoord.json()
    assert {"mediaId", "titel", "status", "organisatie", "organisatieSlug",
            "organisatieLogoUrl", "organisatieLat", "organisatieLon",
            "organisatieKleurPrimair", "organisatieKleurSecundair", "project",
            "projectSlug", "projectId", "metadata", "afbeeldingUrl", "breedte", "hoogte",
            "bron", "iiifService", "iiifManifest", "publicatieDatum", "wijzigingsDatum",
            "annotatiesUrl", "canvas", "verrijkingen", "uploaderNaam",
            "uploaderAfbeeldingUrl"} <= set(body)
    assert body["status"] == "goedgekeurd"


def test_verrijkingencatalogus(api: httpx.Client):
    antwoord = api.get("/verrijkingen")
    assert antwoord.status_code == 200
    assert {"sleutel", "label", "cta", "motivation", "doel"} <= set(antwoord.json()[0])


def test_healthz(api: httpx.Client):
    antwoord = api.get("/healthz")
    assert antwoord.status_code == 200
    assert "status" in antwoord.json()
