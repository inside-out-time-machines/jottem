"""Het beeld van een gedepubliceerde jottem uit de hele keten halen (MO-5).

Tussen de bezoeker en het bestand liggen drie lagen: het derivaat in de objectopslag,
de geheugencache van Cantaloupe en Varnish met een TTL van zeven dagen. Alleen de
status omzetten raakt geen van drieën, waardoor het beeld na een gehonoreerd
verwijderverzoek gewoon zichtbaar bleef voor wie de URL kende.

Het derivaat weghalen is de kern: zonder bronbestand kan Cantaloupe niets meer
renderen, en de instellingen `resolve_first` en `purge_missing` zorgen dat hij zijn
eigen info-cache dan weggooit. Blijft over de kopie in Varnish, en die bant deze
module. Het origineel blijft staan: dat is het archiefexemplaar, alleen bereikbaar via
de API, en daaruit is het derivaat opnieuw te maken als een besluit wordt teruggedraaid.
"""
import uuid

import httpx

from .config import settings
from .derivaten import derivaat_sleutel
from .s3 import intern


def verwijder_derivaat(media_id: uuid.UUID) -> bool:
    """Haal het IIIF-derivaat weg; True als er iets stond."""
    cfg = settings()
    client = intern()
    sleutel = derivaat_sleutel(media_id)
    try:
        client.head_object(Bucket=cfg.s3_bucket_derivaten, Key=sleutel)
    except Exception:  # noqa: BLE001 - niet aanwezig is een prima eindtoestand
        return False
    client.delete_object(Bucket=cfg.s3_bucket_derivaten, Key=sleutel)
    return True


def ban_varnish(media_id: uuid.UUID) -> int:
    """Maak alle gecachte IIIF-URL's van dit beeld ongeldig; retourneert de statuscode.

    Eén ban op de identifier in plaats van een PURGE per URL: de viewer heeft naast de
    info.json tientallen tegels opgehaald, en die zijn niet één voor één te benoemen.
    """
    cfg = settings()
    with httpx.Client(timeout=10) as client:
        antwoord = client.request(
            "BAN", f"{cfg.varnish_url}/iiif/3/{media_id}",
            headers={"X-Jottem-Sleutel": cfg.varnish_sleutel,
                     "X-Jottem-Beeld": str(media_id)},
        )
    antwoord.raise_for_status()
    return antwoord.status_code


def schoon_beeldketen(media_id: uuid.UUID) -> dict:
    """Derivaat weg en cache ongeldig. Idempotent: een tweede ronde is een lege ronde."""
    return {"derivaat": verwijder_derivaat(media_id), "varnish": ban_varnish(media_id)}
