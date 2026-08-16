"""Derivatenpipeline: pyramidal TIFF voor Cantaloupe (zie systeemarchitectuur).

Bij goedkeuring maakt de worker uit het origineel een pyramidal TIFF in de
derivatives-bucket; Cantaloupe leest die rechtstreeks uit S3 (S3Source) en kan er
zonder zware rekenlast tiles uit serveren. Breedte/hoogte worden op Media vastgelegd
(nodig voor het IIIF-canvas); een gevulde breedte geldt als "derivaat gereed".

Backfill voor bestaande goedgekeurde jottems: python -m app.derivaten
"""
import io
import uuid

import pyvips
from sqlalchemy import select

from . import s3
from .config import settings
from .db import SessionLocal
from .models import Media, MediaStatus


def derivaat_sleutel(media_id: uuid.UUID) -> str:
    return f"{media_id}.tif"


def maak_derivaat(media_id: uuid.UUID) -> tuple[int, int]:
    """Maakt (idempotent) het pyramidal TIFF en retourneert (breedte, hoogte)."""
    client = s3.intern()
    cfg = settings()
    sleutel = derivaat_sleutel(media_id)

    db = SessionLocal()
    try:
        media = db.get(Media, media_id)
        if not media:
            raise ValueError(f"Media {media_id} onbekend")

        # idempotent: bestaat het derivaat al, alleen de afmetingen bijwerken indien nodig
        try:
            client.head_object(Bucket=cfg.s3_bucket_derivaten, Key=sleutel)
            if media.breedte and media.hoogte:
                return media.breedte, media.hoogte
        except client.exceptions.ClientError:
            pass

        origineel = client.get_object(Bucket=cfg.s3_bucket_originals, Key=media.objectKey)
        beeld = pyvips.Image.new_from_buffer(origineel["Body"].read(), "")
        tif = beeld.tiffsave_buffer(
            tile=True, tile_width=256, tile_height=256,
            pyramid=True, compression="jpeg", Q=85, bigtiff=True,
        )
        client.put_object(
            Bucket=cfg.s3_bucket_derivaten, Key=sleutel,
            Body=io.BytesIO(tif), ContentType="image/tiff",
        )
        media.breedte = beeld.width
        media.hoogte = beeld.height
        db.commit()
        return beeld.width, beeld.height
    finally:
        db.close()


def backfill() -> None:
    """Derivaten maken voor alle goedgekeurde jottems die er nog geen hebben."""
    db = SessionLocal()
    try:
        wachtend = db.scalars(
            select(Media).where(Media.status == MediaStatus.goedgekeurd, Media.breedte.is_(None))
        ).all()
    finally:
        db.close()
    for media in wachtend:
        breedte, hoogte = maak_derivaat(media.mediaId)
        print(f"derivaat: {media.mediaId} ({breedte}x{hoogte})")
    print(f"backfill klaar: {len(wachtend)} derivaten")


if __name__ == "__main__":
    backfill()
