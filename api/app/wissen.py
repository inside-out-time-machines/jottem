"""Een jottem wissen (MO-5, uitkomst "wissen" van een verwijderverzoek).

Wissen is meer dan depubliceren. Naast de schoning van alle uitgangen (die het
depubliceren al doet) verdwijnen het origineel, de metadata, de annotaties en de volledige
payloads in het Gebeurtenislog. Over blijven de tombstone op de duurzame URL, een kale
logregel (wie, wanneer, welk besluit) en een regel op de wislijst.

Het werk is in twee helften gesplitst. `wis_database` draait in het verzoek zelf, in
dezelfde transactie als het besluit. `wis_opslag` (objectopslag en annotatieserver) draait
in de worker via de outbox-regel "jottem.gewist", zodat een tijdelijk onbereikbare dienst
het besluit niet laat mislukken en de poging wordt herhaald. Beide zijn idempotent, want
de wislijst speelt ze na een restore opnieuw af.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import (Gebeurtenislog, Media, MediaMetadata, MediaRelatie, MediaStatus,
                     WachtendeAnnotatie, Wislijst)

GEWIST_TITEL = "[gewist]"


def kale_payload(payload: dict | None) -> dict:
    """Wat er van een logregel overblijft: alleen verwijzingen, geen inhoud."""
    payload = payload or {}
    return {k: payload[k] for k in ("mediaId", "verzoekId", "wachtendeAnnotatieId")
            if k in payload} | {"ingekort": True}


def schoon_logpayloads(db: Session, media_id: uuid.UUID, behalve: int | None = None) -> int:
    """Kort de payloads in van alle verwerkte logregels over deze jottem.

    Onverwerkte regels blijven staan: daar wacht nog een mail of een opslagstap op.
    Die worden ingekort zodra de worker de regel "jottem.gewist" verwerkt.
    """
    regels = db.scalars(
        select(Gebeurtenislog).where(
            Gebeurtenislog.payload["mediaId"].as_string() == str(media_id),
            Gebeurtenislog.verwerktOp.is_not(None),
        )
    ).all()
    for regel in regels:
        if regel.logId != behalve and not (regel.payload or {}).get("ingekort"):
            regel.payload = kale_payload(regel.payload)
    return len(regels)


def wis_database(db: Session, media: Media) -> None:
    """De databasekant van het wissen; de aanroeper commit."""
    db.execute(delete(MediaMetadata).where(MediaMetadata.mediaId == media.mediaId))
    db.execute(delete(WachtendeAnnotatie).where(WachtendeAnnotatie.mediaId == media.mediaId))
    # koppelingen (V-9) aan beide kanten; de worker trekt bij "jottem.gedepubliceerd" de
    # linking-annotaties van de partner gelijk met wat er dan nog in de database staat
    db.execute(delete(MediaRelatie).where(
        (MediaRelatie.bronMediaId == media.mediaId) | (MediaRelatie.doelMediaId == media.mediaId)))
    # bij het afspelen van de wislijst na een restore kan de jottem in de oude back-up nog
    # gepubliceerd staan; in het verzoek zelf heeft depubliceer() dit al gedaan
    if media.status != MediaStatus.gedepubliceerd:
        media.status = MediaStatus.gedepubliceerd
    media.titel = GEWIST_TITEL
    media.beschrijving = None
    media.genre = None
    media.bronUrl = None
    media.externeIiifService = None
    media.objectKey = None
    media.herkenbaarScore = None
    schoon_logpayloads(db, media.mediaId)
    if not db.get(Wislijst, media.mediaId):
        db.add(Wislijst(mediaId=media.mediaId, gewistOp=datetime.now(timezone.utc)))


def wis_opslag(media_id: uuid.UUID) -> dict:
    """Origineel en derivaat uit de objectopslag, annotaties uit de annotatieserver."""
    from . import anno
    from .beeldcache import schoon_beeldketen
    from .config import settings
    from .s3 import intern

    cfg = settings()
    client = intern()
    originelen = 0
    # het origineel staat onder {mediaId}/; op prefix wissen werkt ook na een restore,
    # wanneer de databaseregel al geen objectKey meer heeft
    antwoord = client.list_objects_v2(Bucket=cfg.s3_bucket_originals, Prefix=f"{media_id}/")
    for obj in antwoord.get("Contents", []) or []:
        client.delete_object(Bucket=cfg.s3_bucket_originals, Key=obj["Key"])
        originelen += 1
    keten = schoon_beeldketen(media_id)
    annotaties = 0
    for kort in anno.alle_annotaties(str(media_id)):
        if kort.get("id"):
            anno.verwijder_annotatie(kort["id"])
            annotaties += 1
    return {"originelen": originelen, "annotaties": annotaties, **keten}
