"""Het framed profiel: het gedocumenteerde frame als afdwingbaar contract.

Twee dingen worden hier bewaakt. Ten eerste dat framing de vórm verandert en niets anders:
de geframede en de gewone representatie moeten dezelfde tripels opleveren. Ten tweede dat
het frame dat de API toepast hetzelfde bestand is als het frame in het designdocument;
lopen die uit elkaar, dan is de documentatie een belofte zonder dekking.
"""
import json

import httpx
import pytest
from rdflib import Graph

from tests.conftest import API, DATA

FRAMED = 'application/ld+json;profile="http://www.w3.org/ns/json-ld#framed"'
DESIGN = "https://design.iotm.nl/data-architectuur/frames"
FRAMES = ["jottem", "dataset", "datacatalog", "annotatie", "annotatiecollectie"]


def _graaf(tekst: str, basis: str) -> Graph:
    graaf = Graph()
    graaf.parse(data=tekst, format="json-ld", base=basis)
    return graaf


def _routes(jottem_id: str, project: dict, organisatie: dict) -> list[tuple[str, str]]:
    return [
        (f"{API}/jottem/{jottem_id}", "jottem"),
        (f"{DATA}/project/{project['projectId']}/dataset", "dataset"),
        (f"{DATA}/datacatalog", "datacatalog"),
        (f"{API}/project/{project['projectId']}/annotations", "annotatiecollectie"),
        (f"{API}/organisatie/{organisatie['slug']}/annotations", "annotatiecollectie"),
    ]


def test_frames_zijn_publiek(data: httpx.Client):
    """Een afnemer moet het frame zelf kunnen toepassen, dus het hoort opgehaald te
    kunnen worden op een vaste URL."""
    for naam in FRAMES:
        antwoord = data.get(f"/ns/frames/{naam}.frame.jsonld")
        assert antwoord.status_code == 200, naam
        assert antwoord.headers["content-type"].startswith("application/ld+json")
        assert "@context" in antwoord.json()


def test_api_en_design_gebruiken_hetzelfde_frame(data: httpx.Client):
    """De kopie in de API en die in het designdocument mogen niet uit elkaar lopen."""
    for naam in FRAMES:
        uit_api = data.get(f"/ns/frames/{naam}.frame.jsonld").json()
        uit_design = httpx.get(f"{DESIGN}/{naam}.frame.jsonld", timeout=20).json()
        # het designbestand draagt de canonieke naamsruimte, de API die van deze omgeving
        gelijkgetrokken = json.loads(
            json.dumps(uit_design).replace("https://data.iotm.nl", DATA))
        assert uit_api == gelijkgetrokken, f"{naam}: API en design lopen uit elkaar"


@pytest.mark.parametrize("index", range(5))
def test_framen_verandert_de_tripels_niet(index: int, jottem_id: str, project: dict,
                                          organisatie: dict):
    """Het hart van de belofte: een frame hoort de vorm te bepalen, niet de inhoud."""
    url, naam = _routes(jottem_id, project, organisatie)[index]
    gewoon = httpx.get(url, headers={"Accept": "application/ld+json"}, timeout=30)
    geframed = httpx.get(url, headers={"Accept": FRAMED}, timeout=30)
    assert gewoon.status_code == 200 and geframed.status_code == 200

    assert "json-ld#framed" in geframed.headers["content-type"]
    assert f"/ns/frames/{naam}.frame.jsonld" in geframed.headers["content-type"]
    assert "describedby" in geframed.headers.get("link", "")
    assert geframed.headers.get("vary") == "Accept"

    assert _graaf(gewoon.text, url).isomorphic(_graaf(geframed.text, url)), (
        f"{url}: framen veranderde de graaf")


def test_onderhandeling_blijft_overeind(api: httpx.Client, jottem_id: str):
    """De varianten op de duurzame URL, inclusief de valkuilen die er ooit in zaten."""
    # zonder Accept en met een browserheader hoort een mens op de publiekspagina te komen
    for kop in ({}, {"Accept": "*/*"},
                {"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}):
        assert api.get(f"/jottem/{jottem_id}", headers=kop).status_code == 303

    # q-waarden tellen mee: hier wil de client nadrukkelijk geen turtle
    antwoord = api.get(f"/jottem/{jottem_id}",
                       headers={"Accept": "text/turtle;q=0.1, application/ld+json"})
    assert antwoord.headers["content-type"].startswith("application/ld+json")

    # zonder profiel blijft het antwoord ongeframed, en elke variant draagt Vary
    for kop, verwacht in (({"Accept": "application/ld+json"}, "application/ld+json"),
                          ({"Accept": "text/turtle"}, "text/turtle"),
                          ({"Accept": "application/rdf+xml"}, "application/rdf+xml")):
        antwoord = api.get(f"/jottem/{jottem_id}", headers=kop)
        assert antwoord.headers["content-type"].startswith(verwacht)
        assert "json-ld#framed" not in antwoord.headers["content-type"]
        assert antwoord.headers.get("vary") == "Accept"
