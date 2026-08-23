"""Open data: IIIF, W3C-annotaties, RDF, RSS, Change Discovery en de datasetbeschrijving.

Dit is de kant die harvesters en viewers zien; hier mag een uplift niets aan veranderen.
"""
import gzip

import httpx
import pytest


def test_iiif_manifest(api: httpx.Client, jottem_id: str):
    antwoord = api.get(f"/jottem/{jottem_id}/iiif/manifest")
    assert antwoord.status_code == 200
    manifest = antwoord.json()
    assert manifest["type"] == "Manifest"
    assert manifest["@context"] == "http://iiif.io/api/presentation/3/context.json"
    assert manifest["items"][0]["type"] == "Canvas"
    # IIIF eist de canonieke http-vorm van CC- en RightsStatements-URI's
    if manifest.get("rights", "").startswith(("http://creativecommons.org",
                                              "http://rightsstatements.org")):
        assert not manifest["rights"].startswith("https://")


def test_iiif_collection_project(api: httpx.Client, project: dict):
    antwoord = api.get(f"/project/{project['projectId']}/iiif/collection")
    assert antwoord.status_code == 200
    collectie = antwoord.json()
    assert collectie["type"] == "Collection"
    assert isinstance(collectie["items"], list)


def test_iiif_collection_organisatie(api: httpx.Client, organisatie: dict):
    antwoord = api.get(f"/organisatie/{organisatie['slug']}/jottems/iiif/collection")
    assert antwoord.status_code == 200
    assert antwoord.json()["type"] == "Collection"


def test_cors_op_open_data(api: httpx.Client, jottem_id: str):
    """Externe viewers (Universal Viewer, Mirador) fetchen cross-origin."""
    antwoord = api.get(f"/jottem/{jottem_id}/iiif/manifest",
                       headers={"Origin": "https://uv-v4.netlify.app"})
    assert antwoord.headers.get("access-control-allow-origin") == "*"
    # een wildcard-origin mag niet samen met allow-credentials
    assert "access-control-allow-credentials" not in antwoord.headers


def test_cors_preflight_beheeractie_blijft_dicht(api: httpx.Client, jottem_id: str):
    """Preflight voor een beheeractie hoort bij de gewone CORS-laag, niet bij open data."""
    antwoord = api.request(
        "OPTIONS", f"/jottem/{jottem_id}/status",
        headers={"Origin": "https://kwaadaardig.example",
                 "Access-Control-Request-Method": "PUT"},
    )
    assert antwoord.headers.get("access-control-allow-origin") != "*"


def test_content_negotiation(api: httpx.Client, jottem_id: str):
    html = api.get(f"/jottem/{jottem_id}", headers={"Accept": "text/html"})
    assert html.status_code == 303

    jsonld = api.get(f"/jottem/{jottem_id}", headers={"Accept": "application/ld+json"})
    assert jsonld.status_code == 200
    doc = jsonld.json()
    assert doc["@type"] == "ImageObject"
    # de namespace is gepind op https, gelijk aan Turtle, de dump en de triplestore;
    # de externe context https://schema.org/ zou naar http://schema.org/ mappen. Naast
    # @vocab staan hier de prefixen die de mapping gebruikt (dcterms voor koppelingen).
    assert doc["@context"]["@vocab"] == "https://schema.org/"
    assert doc["@context"].get("dcterms") == "http://purl.org/dc/terms/"
    assert {"name", "isPartOf", "mainEntityOfPage"} <= set(doc)

    turtle = api.get(f"/jottem/{jottem_id}", headers={"Accept": "text/turtle"})
    assert turtle.status_code == 200
    assert turtle.headers["content-type"].startswith("text/turtle")

    rdfxml = api.get(f"/jottem/{jottem_id}", headers={"Accept": "application/rdf+xml"})
    assert rdfxml.status_code == 200
    assert rdfxml.text.lstrip().startswith("<?xml")


def test_annotatiecontainer(api: httpx.Client, jottem_id: str):
    antwoord = api.get(f"/jottem/{jottem_id}/annotations")
    assert antwoord.status_code in (200, 303)


def test_annotatie_aggregaties(api: httpx.Client, organisatie: dict, project: dict):
    for pad in (f"/project/{project['projectId']}/annotations",
                f"/organisatie/{organisatie['slug']}/annotations"):
        antwoord = api.get(pad)
        assert antwoord.status_code == 200
        collectie = antwoord.json()
        assert collectie["type"] == "AnnotationCollection"
        # anno-context plus de jottem-prefix: zonder die prefix zijn jottem:verrijking
        # en jottem:aard in deze representatie geen resolvebare termen
        context = collectie["@context"]
        assert context[0] == "http://www.w3.org/ns/anno.jsonld"
        assert context[1]["jottem"].endswith("/ns/jottem.jsonld#")
        assert "total" in collectie


def test_annotatie_op_eigen_iri_heeft_context(api: httpx.Client, project: dict):
    """Elke annotatie moet op haar eigen IRI zelfbeschrijvend zijn.

    De annotatieserver haalt @context weg uit de items van een containerlijst; die erven
    de context van de pagina. Wie zo'n item terugschrijft (de naamsync deed dat), maakt de
    gestripte vorm tot de opgeslagen vorm, en dan is op de canonieke IRI niets meer op te
    lossen: niet alleen jottem:verrijking, ook type, body en target niet.
    """
    collectie = api.get(f"/project/{project['projectId']}/annotations").json()
    items = collectie.get("first", {}).get("items", [])
    if not items:
        pytest.skip("geen annotaties in dit project")
    for item in items[:5]:
        annotatie = httpx.get(item["id"], timeout=20).json()
        context = annotatie.get("@context")
        assert context, f"annotatie zonder context: {item['id']}"
        assert "http://www.w3.org/ns/anno.jsonld" in context
        if any(sleutel.startswith("jottem:") for sleutel in annotatie):
            assert any(isinstance(deel, dict) and "jottem" in deel for deel in context), (
                f"jottem-prefix ontbreekt terwijl de annotatie hem gebruikt: {item['id']}")


def test_rss_feeds(api: httpx.Client, organisatie: dict, project: dict):
    for pad in ("/rss", f"/organisatie/{organisatie['slug']}/rss",
                f"/project/{project['projectId']}/rss"):
        antwoord = api.get(pad)
        assert antwoord.status_code == 200
        assert "xml" in antwoord.headers["content-type"]
        assert antwoord.text.lstrip().startswith("<?xml")
        assert "<channel>" in antwoord.text


def test_change_discovery(api: httpx.Client, organisatie: dict, project: dict):
    for pad in (f"/organisatie/{organisatie['slug']}/activity-stream",
                f"/project/{project['projectId']}/activity-stream"):
        antwoord = api.get(pad)
        assert antwoord.status_code == 200
        stroom = antwoord.json()
        assert stroom["type"] in ("OrderedCollection", "OrderedCollectionPage")
        assert "http://iiif.io/api/discovery/1/context.json" in str(stroom["@context"])


def test_datacatalog(api: httpx.Client):
    antwoord = api.get("/datacatalog")
    assert antwoord.status_code == 200
    catalogus = antwoord.json()
    assert catalogus["@type"] == "DataCatalog"
    assert isinstance(catalogus["dataset"], list)


def test_datasetbeschrijving(data: httpx.Client, project: dict):
    antwoord = data.get(f"/project/{project['projectId']}/dataset")
    assert antwoord.status_code == 200
    beschrijving = antwoord.json()
    assert beschrijving["@type"] == "Dataset"
    assert {"name", "description", "publisher", "creator", "license", "distribution",
            "dateCreated", "datePublished", "dateModified"} <= set(beschrijving)
    # namen en beschrijvingen dragen een taaltag
    assert beschrijving["name"]["@language"] == "nl"
    # de publisher heeft een contactadres (NDE-eis)
    assert "contactPoint" in beschrijving["publisher"] or "email" in beschrijving["publisher"]


def test_datadump(data: httpx.Client, project: dict, organisatie: dict):
    slug = next(p["slug"] for p in organisatie["projecten"]
                if p["projectId"] == project["projectId"])
    antwoord = data.get(f"/project/{project['projectId']}/dump-{slug}.nt.gz")
    assert antwoord.status_code == 200
    assert antwoord.headers["content-type"] in ("application/gzip", "application/x-gzip")
    regels = gzip.decompress(antwoord.content).decode().strip().splitlines()
    assert regels and regels[0].endswith(" .")

    # de oude naam zonder slug blijft permanent doorverwijzen
    oud = data.get(f"/project/{project['projectId']}/dump.nt.gz")
    assert oud.status_code == 301


def test_termennetwerk(api: httpx.Client):
    bronnen = api.get("/termennetwerk/bronnen")
    assert bronnen.status_code == 200
    assert {"uri", "naam"} <= set(bronnen.json()[0])

    zoek = api.get("/termennetwerk/zoek", params={"bron": "geonames", "query": "Gouda"})
    assert zoek.status_code == 200
    if zoek.json():
        assert {"uri", "label", "bron"} <= set(zoek.json()[0])


def test_koppeling_tussen_jottems(api: httpx.Client, organisatie: dict, project: dict):
    """Een koppeling "zelfde object" is bij beide jottems zichtbaar en staat in de RDF.

    De koppeling leeft in de database; de linking-annotatie en dcterms:relation zijn
    afgeleid (V-9). Deze toets slaat over als er in dit project nog geen koppeling is.
    """
    tegels = api.get(
        f"/organisatie/{organisatie['slug']}/project/{project['slug']}/publiek"
    ).json()["jottems"]
    met_relatie = None
    for tegel in tegels:
        detail = api.get(f"/jottem/{tegel['mediaId']}/detail").json()
        if detail.get("gerelateerd"):
            met_relatie = detail
            break
    if not met_relatie:
        pytest.skip("nog geen gekoppelde jottems in dit project")

    partner = met_relatie["gerelateerd"][0]
    assert {"mediaId", "titel", "url"} <= set(partner)
    assert partner["url"].endswith(partner["mediaId"])

    # de koppeling is wederkerig
    terug = api.get(f"/jottem/{partner['mediaId']}/detail").json()
    assert met_relatie["mediaId"] in [g["mediaId"] for g in terug["gerelateerd"]]

    # en staat in de RDF van allebei
    for media_id in (met_relatie["mediaId"], partner["mediaId"]):
        doc = api.get(f"/jottem/{media_id}",
                      headers={"Accept": "application/ld+json"}).json()
        assert doc["@context"]["dcterms"] == "http://purl.org/dc/terms/"
        assert doc["dcterms:relation"], "koppeling ontbreekt in de RDF"


def test_meerdere_steekwoorden(api: httpx.Client, organisatie: dict, project: dict):
    """Alle steekwoorden van een jottem komen in schema:keywords, niet alleen de laatste.

    De metadatarijen staan allemaal onder dezelfde veldnaam; wie ze tot een dict platslaat
    houdt er één over. Deze toets bewaakt dat, want het is stil kapot: de upload slaagt,
    de jottem verschijnt, en pas in de open data mist het grootste deel.
    """
    tegels = api.get(
        f"/organisatie/{organisatie['slug']}/project/{project['slug']}/publiek"
    ).json()["jottems"]
    for tegel in tegels:
        doc = api.get(f"/jottem/{tegel['mediaId']}",
                      headers={"Accept": "application/ld+json"}).json()
        woorden = doc.get("keywords")
        if isinstance(woorden, list) and len(woorden) > 1:
            assert len(woorden) == len(set(woorden)), "steekwoorden komen dubbel voor"
            turtle = api.get(f"/jottem/{tegel['mediaId']}",
                             headers={"Accept": "text/turtle"}).text
            for woord in woorden:
                assert f'"{woord}"' in turtle, f"{woord} ontbreekt in de Turtle"
            return
    pytest.skip("geen jottem met meer dan één steekwoord in dit project")
