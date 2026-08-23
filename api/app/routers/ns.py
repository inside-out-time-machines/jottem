"""De naamsruimte en de frames: de zelfbeschrijving van de open data.

Beide leven op de datahost (`data.iotm.nl/ns/...`) en niet op de publiekssite. Een
vocabulaire-URI staat in gepubliceerde tripels en moet die overleven; de frontend is een
applicatie die vervangen kan worden, het open-datadomein is dat niet.

De bestanden komen uit `app/ld/` en dragen de canonieke productie-IRI; `ns.omgevingsvorm()`
zet die om naar de host van deze omgeving. Ze zijn identiek aan de kopieën in het
designdocument, en een contracttest bewaakt dat.
"""
import hashlib
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

from .. import ns

router = APIRouter(tags=["Naamsruimte"])

LD_MAP = Path(__file__).resolve().parent.parent / "ld"
JSONLD = "application/ld+json"
# een dag; het document verandert alleen bij een uitrol, en een JSON-LD-verwerker haalt
# het per verwerkte annotatie opnieuw op
CACHE = "public, max-age=86400"
NAAM = re.compile(r"^[a-z][a-z0-9-]{0,40}$")


@lru_cache(maxsize=16)
def _inhoud(pad: str) -> tuple[str, str]:
    """De tekst van een LD-bestand voor deze omgeving, met zijn ETag."""
    tekst = ns.omgevingsvorm((LD_MAP / pad).read_text(encoding="utf-8"))
    return tekst, '"' + hashlib.sha256(tekst.encode()).hexdigest()[:32] + '"'


def _antwoord(request: Request, pad: str) -> Response:
    try:
        tekst, etag = _inhoud(pad)
    except FileNotFoundError:
        raise HTTPException(404, "Onbekend document in de naamsruimte") from None
    koppen = {"ETag": etag, "Cache-Control": CACHE}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=koppen)
    return Response(tekst, media_type=JSONLD, headers=koppen)


@router.get("/ns/jottem.jsonld")
def naamsruimte(request: Request):
    """Het vocabulaire achter de `jottem:`-prefix: context én termdefinities."""
    return _antwoord(request, "jottem.jsonld")


@router.get("/ns/frames/{naam}.frame.jsonld")
def frame(naam: str, request: Request):
    """Een JSON-LD-frame, hetzelfde dat de API zelf toepast bij het framed profiel."""
    if not NAAM.match(naam):
        raise HTTPException(404, "Onbekend frame")
    return _antwoord(request, f"frames/{naam}.frame.jsonld")
