"""Client voor de Suggesties API (titel, categorie en steekwoorden bij het uploaden).

Aparte netwerkdienst (EUPL-1.2, eigen repo), aangeroepen tussen stap 1 en stap 2 van het
uploadformulier. Net als bij de Herkenbaar API geldt: dit is een hulpsignaal, geen
poortwachter. Faalt de dienst, staat hij uit of duurt hij te lang, dan geven we niets terug
en vult de inzender de velden zelf in (V-10).
"""
import httpx

from . import s3
from .config import settings

# de inzender wacht hierop terwijl hij stap 2 invult; langer wachten heeft geen zin
TIJDLIMIET = 30


def _leeg() -> dict:
    return {"titel": None, "genre": None, "steekwoorden": []}


def voor_bytes(data: bytes, bestandsnaam: str = "beeld.jpg") -> dict:
    """Suggesties voor één afbeelding; lege suggesties als de dienst niets oplevert."""
    if not settings().suggesties_url:
        return _leeg()
    try:
        antwoord = httpx.post(
            f"{settings().suggesties_url}/suggesties",
            files={"file": (bestandsnaam, data)},
            timeout=TIJDLIMIET,
        )
        antwoord.raise_for_status()
        uitkomst = antwoord.json()
    except Exception:  # noqa: BLE001 - suggesties zijn een hulpsignaal, geen poortwachter
        return _leeg()
    return {
        "titel": (uitkomst.get("titel") or {}).get("waarde"),
        "genre": (uitkomst.get("genre") or {}).get("waarde"),
        "steekwoorden": uitkomst.get("steekwoorden") or [],
        "model": uitkomst.get("model"),
    }


def voor_object(object_key: str) -> dict:
    """Zelfde suggesties, voor een origineel in de S3-bucket."""
    try:
        origineel = s3.intern().get_object(
            Bucket=settings().s3_bucket_originals, Key=object_key
        )
        return voor_bytes(origineel["Body"].read(), object_key.rsplit("/", 1)[-1])
    except Exception:  # noqa: BLE001
        return _leeg()
