"""JSON-LD-framing: het gedocumenteerde frame als uitvoerbaar contract.

De data-architectuur beschrijft per entiteit een frame en belooft dat de duurzame URL's
`Accept: application/ld+json;profile="…#framed"` ondersteunen. Deze module maakt die
belofte waar met dezelfde bestanden die in het designdocument staan; een contracttest
bewaakt dat beide kopieën gelijk blijven.

Twee dingen zijn hier bewust dichtgezet. Het frame komt van de server en niet van de
client: een open framing-service is een rekenkrachtoppervlak dat niemand nodig heeft. En
de JSON-LD-verwerker mag het net niet op: pyld zou anders bij elk geframed verzoek de
W3C-annotatiecontext ophalen, midden in het requestpad. Die context ligt lokaal.
"""
import json
from functools import lru_cache
from pathlib import Path

from fastapi.responses import JSONResponse
from pyld import jsonld

from . import ns

LD_MAP = Path(__file__).resolve().parent / "ld"
JSONLD = "application/ld+json"

# De contexten die een document van ons mag dereferencen, met hun lokale kopie. Alles
# daarbuiten wordt geweigerd: liever een duidelijke fout dan een stille uitgaande call.
LOKALE_CONTEXTEN = {
    "http://www.w3.org/ns/anno.jsonld": "contexts/anno.jsonld",
    "https://www.w3.org/ns/anno.jsonld": "contexts/anno.jsonld",
}


def _loader(url: str, options: dict | None = None) -> dict:
    pad = LOKALE_CONTEXTEN.get(url)
    if not pad:
        raise jsonld.JsonLdError(
            "Deze context wordt niet lokaal meegeleverd; framing haalt niets op",
            "jsonld.LoadDocumentError", {"url": url}, code="loading remote context failed")
    return {"contextUrl": None, "documentUrl": url,
            "document": json.loads((LD_MAP / pad).read_text(encoding="utf-8"))}


jsonld.set_document_loader(_loader)


@lru_cache(maxsize=16)
def laad(naam: str) -> str:
    """Het frame als tekst, met de naamsruimte van deze omgeving erin."""
    return ns.omgevingsvorm(
        (LD_MAP / "frames" / f"{naam}.frame.jsonld").read_text(encoding="utf-8"))


def frame(document: dict, naam: str) -> dict:
    """Pas het gedocumenteerde frame toe; de tripels blijven gelijk, alleen de vorm niet."""
    return jsonld.frame(document, json.loads(laad(naam)))


def content_type(naam: str, extra_profielen: tuple[str, ...] = ()) -> str:
    profielen = (*extra_profielen, "http://www.w3.org/ns/json-ld#framed", ns.frame_url(naam))
    return f'{JSONLD};profile="{" ".join(profielen)}"'


def antwoord(document: dict, naam: str,
             extra_profielen: tuple[str, ...] = ()) -> JSONResponse:
    """Het geframede document, met het gebruikte frame in de headers.

    Het profiel noemt twee URI's: dat het geframed is, en waarmee. De Link-header zegt
    hetzelfde nog eens voor clients die de parameter niet ontleden.
    """
    return JSONResponse(
        frame(document, naam),
        media_type=content_type(naam, extra_profielen),
        headers={
            "Link": f'<{ns.frame_url(naam)}>; rel="describedby"; type="{JSONLD}"',
            "Vary": "Accept",
        },
    )
