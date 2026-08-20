"""Koppelingen tussen twee jottems die hetzelfde object tonen (V-9, verrijkingen).

De rij in `media_relatie` is de bron van waarheid. Daaruit worden twee dingen afgeleid,
allebei pas zodra beide jottems gepubliceerd zijn: een `linking`-annotatie in de container
van elk van de twee jottems (zodat de koppeling in de W3C-uitgangen zit) en
`dcterms:relation` in de RDF (zie rdf.py). Verdwijnt een van de twee uit publicatie, dan
verdwijnen de annotaties weer; de rij blijft staan, zodat herpublicatie de koppeling
terugbrengt.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import anno
from .config import settings
from .models import Media, MediaRelatie, MediaStatus

AARD = "zelfde-object"


def jottem_uri(media_id: uuid.UUID | str) -> str:
    return f"{settings().publieke_basis_url}/jottem/{media_id}"


def partner_ids(db: Session, media_id: uuid.UUID) -> list[uuid.UUID]:
    """De jottems aan de andere kant van een koppeling, ongeacht de richting."""
    rijen = db.scalars(
        select(MediaRelatie).where(
            or_(MediaRelatie.bronMediaId == media_id, MediaRelatie.doelMediaId == media_id)
        )
    ).all()
    return [r.doelMediaId if r.bronMediaId == media_id else r.bronMediaId for r in rijen]


def gepubliceerde_partners(db: Session, media_id: uuid.UUID) -> list[Media]:
    """Idem, maar alleen de jottems die publiek zichtbaar zijn."""
    ids = partner_ids(db, media_id)
    if not ids:
        return []
    return list(db.scalars(
        select(Media).where(Media.mediaId.in_(ids), Media.status == MediaStatus.goedgekeurd)
        .order_by(Media.publicatieDatum)
    ).all())


def partners_per_jottem(db: Session, media_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Alle koppelingen van een reeks jottems in één query (voor dump en projectgraaf)."""
    if not media_ids:
        return {}
    rijen = db.scalars(
        select(MediaRelatie).where(
            or_(MediaRelatie.bronMediaId.in_(media_ids), MediaRelatie.doelMediaId.in_(media_ids))
        )
    ).all()
    per: dict[uuid.UUID, list[uuid.UUID]] = {}
    for r in rijen:
        per.setdefault(r.bronMediaId, []).append(r.doelMediaId)
        per.setdefault(r.doelMediaId, []).append(r.bronMediaId)
    return per


def _relatie_annotatie(media_id: uuid.UUID, partner_id: uuid.UUID) -> dict:
    """De afgeleide linking-annotatie, in de vorm uit het verrijkingenhoofdstuk."""
    return {
        "@context": ["http://www.w3.org/ns/anno.jsonld",
                     {"jottem": f"{settings().publieke_basis_url}/ns/jottem.jsonld#"}],
        "type": "Annotation",
        "motivation": "linking",
        "target": jottem_uri(media_id),
        "body": {"type": "SpecificResource", "purpose": "linking",
                 "source": jottem_uri(partner_id)},
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": {"id": settings().publieke_basis_url, "type": "Software", "name": "Jottem"},
        "jottem:verrijking": AARD,
    }


def _bestaande_relatie_annotaties(container: str) -> dict[str, str]:
    """De afgeleide annotaties van een container: partner-URI -> annotatie-IRI."""
    gevonden: dict[str, str] = {}
    for annotatie in anno.alle_annotaties(container):
        if annotatie.get("jottem:verrijking") != AARD:
            continue
        body = annotatie.get("body")
        bron = body.get("source") if isinstance(body, dict) else None
        if bron:
            gevonden[bron] = annotatie["id"]
    return gevonden


def sync_annotaties(db: Session, media_id: uuid.UUID) -> None:
    """Trek de afgeleide annotaties van één jottem gelijk met de database.

    Best effort: de database blijft leidend, dus een storing bij de annotatieserver mag
    het publiceren niet blokkeren. De nachtelijke hersync haalt achterstand in.
    """
    media = db.get(Media, media_id)
    if not media:
        return
    gewenst = (
        {jottem_uri(p.mediaId) for p in gepubliceerde_partners(db, media_id)}
        if media.status == MediaStatus.goedgekeurd else set()
    )
    try:
        bestaand = _bestaande_relatie_annotaties(str(media_id))
        for partner_uri in gewenst - set(bestaand):
            partner_id = uuid.UUID(partner_uri.rsplit("/", 1)[1])
            anno.maak_annotatie(str(media_id), media.titel,
                                _relatie_annotatie(media_id, partner_id))
        for partner_uri in set(bestaand) - gewenst:
            anno.verwijder_annotatie(bestaand[partner_uri])
    except Exception:  # noqa: BLE001 - annotatieserver even weg; hersync repareert
        return


def sync_beide_kanten(db: Session, media_id: uuid.UUID) -> None:
    """Na een statuswijziging: deze jottem en al zijn partners gelijktrekken."""
    sync_annotaties(db, media_id)
    for partner_id in partner_ids(db, media_id):
        sync_annotaties(db, partner_id)
