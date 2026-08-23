"""De eigen naamsruimte van het platform: waar hij woont en hoe hij per omgeving heet.

De termen `jottem:verrijking` en `jottem:aard` staan in gepubliceerde annotaties en
blijven daar staan zolang die data bestaat. Zo'n vocabulaire-URI hoort dus net zo stabiel
te zijn als de data zelf, en dat is de reden dat hij op de datahost woont en niet op de
publiekssite: die laatste is een applicatie die vervangen kan worden, de eerste is het
open-datadomein waar de datasets, de dump en het SPARQL-endpoint al staan.

De bestanden onder `ld/` dragen de canonieke productie-IRI. Bij het uitleveren wordt die
vervangen door de host van de draaiende omgeving, zodat het designbestand en het
uitgeleverde document identiek zijn op precies één IRI na.
"""
from .config import settings

NS_CANONIEK = "https://data.iotm.nl"


def basis() -> str:
    """De datahost van deze omgeving, zonder afsluitende slash."""
    return settings().data_basis_url.rstrip("/")


def document_url() -> str:
    return f"{basis()}/ns/jottem.jsonld"


def prefix() -> str:
    """De waarde van de `jottem:`-prefix in een JSON-LD-context."""
    return f"{document_url()}#"


def frame_url(naam: str) -> str:
    return f"{basis()}/ns/frames/{naam}.frame.jsonld"


def omgevingsvorm(tekst: str) -> str:
    """Zet de canonieke naamsruimte om naar die van deze omgeving.

    In productie is dat een lege bewerking; op dev en lokaal verschuift alles mee naar
    data.dev.iotm.nl respectievelijk het lokale adres.
    """
    return tekst if basis() == NS_CANONIEK else tekst.replace(NS_CANONIEK, basis())
