"""Namen bij annotaties pas bij het lezen invullen (late binding, data-architectuur).

Een annotatie in AnnoRepo draagt alleen de stabiele creator-IRI (urn:uuid:{publiekeId}).
De naam staat in PostgreSQL en verschijnt pas bij het uitleveren: in de verzamelroutes,
in de moderatieomgeving en (via /deelnemers) op de publiekspagina. Zo werkt een
naamswijziging of het uitzetten van naamPubliek direct door, zonder dat er annotaties
herschreven worden, en staan er geen persoonsnamen in de annotatieserver.
"""
import copy
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Gebruiker

ANONIEM = "Een deelnemer"


def _publieke_id(annotatie: dict) -> uuid.UUID | None:
    creator = annotatie.get("creator")
    iri = creator.get("id", "") if isinstance(creator, dict) else ""
    if not iri.startswith("urn:uuid:"):
        return None
    try:
        return uuid.UUID(iri.removeprefix("urn:uuid:"))
    except ValueError:
        return None


def vul_namen_in(db: Session, annotaties: list[dict]) -> list[dict]:
    """Kopieën van de annotaties met creator.name ingevuld (publieke naam of anoniem)."""
    ids = {i for i in (_publieke_id(a) for a in annotaties) if i}
    namen: dict[uuid.UUID, str] = {}
    if ids:
        for g in db.scalars(select(Gebruiker).where(Gebruiker.publiekeId.in_(ids))):
            namen[g.publiekeId] = g.naam if g.naamPubliek and g.naam else ANONIEM
    uit = []
    for annotatie in annotaties:
        kopie = copy.deepcopy(annotatie)
        pid = _publieke_id(kopie)
        if pid:
            kopie["creator"]["name"] = namen.get(pid, ANONIEM)
        uit.append(kopie)
    return uit


def vul_naam_in(db: Session, annotatie: dict | None) -> dict | None:
    return vul_namen_in(db, [annotatie])[0] if annotatie else annotatie
