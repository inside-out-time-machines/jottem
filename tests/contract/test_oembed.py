"""oEmbed-endpoint (hoofdstuk Deelbaarheid, D-7): projectpagina's als rich-embed,
jottems als photo, discovery-links in de paginakop. Vorm-asserties, geen inhoud.
"""
import httpx

from conftest import SITE


def _oembed(site: httpx.Client, doel: str, **extra) -> httpx.Response:
    return site.get("/oembed", params={"url": doel, **extra})


def test_project_oembed(site: httpx.Client, organisatie: dict, project: dict):
    doel = f"{SITE}/organisatie/{organisatie['slug']}/{project['slug']}"
    antwoord = _oembed(site, doel)
    assert antwoord.status_code == 200
    assert antwoord.headers["content-type"].startswith("application/json")
    body = antwoord.json()
    assert {"version", "type", "title", "html", "width", "height",
            "provider_name", "provider_url"} <= set(body)
    assert body["version"] == "1.0"
    assert body["type"] == "rich"
    assert "/widget/" in body["html"]


def test_project_oembed_maxwidth(site: httpx.Client, organisatie: dict, project: dict):
    doel = f"{SITE}/organisatie/{organisatie['slug']}/{project['slug']}"
    body = _oembed(site, doel, maxwidth=300).json()
    assert body["width"] <= 300


def test_jottem_oembed(site: httpx.Client, jottem_id: str):
    antwoord = _oembed(site, f"{SITE}/jottem/{jottem_id}")
    if antwoord.status_code == 404:
        # jottem zonder duurzame beeld-URL (bron zonder IIIF); vorm is dan niet toetsbaar
        return
    assert antwoord.status_code == 200
    body = antwoord.json()
    assert body["type"] == "photo"
    assert {"version", "url", "title", "provider_name"} <= set(body)


def test_oembed_weigert_vreemde_url(site: httpx.Client):
    assert _oembed(site, "https://voorbeeld.nl/organisatie/x/y").status_code == 404
    assert _oembed(site, f"{SITE}/upload").status_code == 404
    assert site.get("/oembed").status_code == 404


def test_oembed_xml_niet_ondersteund(site: httpx.Client, organisatie: dict, project: dict):
    doel = f"{SITE}/organisatie/{organisatie['slug']}/{project['slug']}"
    assert _oembed(site, doel, format="xml").status_code == 501


def test_discovery_links(site: httpx.Client, organisatie: dict, project: dict, jottem_id: str):
    projectpagina = site.get(f"/organisatie/{organisatie['slug']}/{project['slug']}")
    assert "application/json+oembed" in projectpagina.text
    jottempagina = site.get(f"/jottem/{jottem_id}")
    assert "application/json+oembed" in jottempagina.text
