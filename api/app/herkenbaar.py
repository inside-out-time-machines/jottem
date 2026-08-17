"""Client voor de Herkenbaar API (detectie van herkenbare personen, portretrecht).

Aparte netwerkdienst (AGPL-3.0, eigen repo); synchroon aangeroepen bij de upload,
conform de systeemarchitectuur. Faalt de dienst, dan blokkeren we de upload niet maar
markeren we het signaal als onbekend; de moderator beoordeelt dan zoals altijd zelf.
"""
import httpx

from . import s3
from .config import settings


def check_bytes(data: bytes, bestandsnaam: str = "beeld.jpg") -> tuple[bool | None, float | None]:
    """Retourneert (herkenbaar, betrouwbaarheid); (None, None) als de dienst faalt."""
    try:
        antwoord = httpx.post(
            f"{settings().herkenbaar_url}/herken-img",
            files={"file": (bestandsnaam, data)},
            timeout=60,
        )
        antwoord.raise_for_status()
        uitkomst = antwoord.json()
        return uitkomst.get("herkenbaar") == "ja", float(uitkomst.get("betrouwbaarheid", 0))
    except Exception:  # noqa: BLE001 - detectie is een hulpsignaal, geen poortwachter
        return None, None


def check_object(object_key: str) -> tuple[bool | None, float | None]:
    """Zelfde check, voor een origineel in de S3-bucket."""
    try:
        origineel = s3.intern().get_object(
            Bucket=settings().s3_bucket_originals, Key=object_key
        )
        return check_bytes(origineel["Body"].read(), object_key.rsplit("/", 1)[-1])
    except Exception:  # noqa: BLE001
        return None, None
