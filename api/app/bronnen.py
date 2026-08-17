"""Externe fotobronnen: beeldbank-permalinks (IIIF) en directe foto-URL's.

De resolver bepaalt server-side (gezaghebbend, de client wordt niet vertrouwd) wat er
achter een opgegeven URL zit:
- beeldbank: een permalink wordt herleid tot een IIIF Manifest of info.json; die URL
  wordt opgeslagen en getoond. Herkenning start met samh.nl (Memorix); nieuwe
  beeldbanken zijn een extra regel in PERMALINK_PATRONEN.
- foto-URL: de URL moet een werkende afbeelding opleveren (statuscode + content-type).

Er wordt uitsluitend verwezen, niets gekopieerd. SSRF-bescherming: alleen http(s) en
geen private of loopback-adressen.
"""
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from . import iiif

FOTO_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff"}
MAX_FOTO_BYTES = 20 * 1024 * 1024

# permalink-patronen per beeldbank: regex -> functie(match) die de manifest-URL geeft
PERMALINK_PATRONEN: list[tuple[re.Pattern, str]] = [
    # SAMH (Memorix Maior): detail/{record}[/media/{media}] -> manifest/{record}
    (re.compile(r"^https?://(?:www\.)?samh\.nl/bronnen/beeldbank/detail/"
                r"(?P<record>[0-9a-f-]{36})(?:/media/(?P<media>[0-9a-f-]{36}))?",
                re.IGNORECASE),
     "https://samh.nl/bronnen/beeldbank/manifest/{record}"),
]


@dataclass
class ExterneBron:
    bron: str                  # "iiif" | "url"
    bronUrl: str               # wat we opslaan en tonen
    previewUrl: str
    service: str | None = None  # IIIF image service-basis
    breedte: int | None = None
    hoogte: int | None = None
    mimeType: str | None = None


def _eis_publieke_url(url: str) -> None:
    try:
        onderdelen = urlparse(url)
    except ValueError as fout:
        raise HTTPException(422, "Dit is geen geldige URL") from fout
    if onderdelen.scheme not in ("http", "https") or not onderdelen.hostname:
        raise HTTPException(422, "Alleen http(s)-URL's zijn toegestaan")
    try:
        adressen = {info[4][0] for info in socket.getaddrinfo(onderdelen.hostname, None)}
    except OSError as fout:
        raise HTTPException(422, "De host van deze URL is niet vindbaar") from fout
    for adres in adressen:
        ip = ipaddress.ip_address(adres)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(422, "Deze URL is niet toegestaan")


def _haal_json(client: httpx.Client, url: str) -> dict | None:
    try:
        antwoord = client.get(url, headers={"Accept": "application/json, application/ld+json"})
        if antwoord.status_code != 200:
            return None
        return antwoord.json()
    except Exception:  # noqa: BLE001
        return None


def _service_uit_canvas(canvas: dict) -> tuple[str | None, int | None, int | None]:
    """Image service + afmetingen uit een IIIF v3-canvas (Memorix levert v3)."""
    try:
        body = canvas["items"][0]["items"][0]["body"]
    except (KeyError, IndexError, TypeError):
        return None, canvas.get("width"), canvas.get("height")
    diensten = body.get("service") or []
    service = None
    if diensten:
        service = diensten[0].get("id") or diensten[0].get("@id")
    return service, body.get("width") or canvas.get("width"), body.get("height") or canvas.get("height")


def _uit_manifest(manifest: dict, manifest_url: str, media_uuid: str | None) -> ExterneBron:
    canvases = manifest.get("items") or []
    if not canvases:
        raise HTTPException(422, "Het manifest van deze beeldbank bevat geen afbeelding")
    gekozen = canvases[0]
    if media_uuid:
        for canvas in canvases:
            service, _, _ = _service_uit_canvas(canvas)
            if service and media_uuid.lower() in service.lower():
                gekozen = canvas
                break
    service, breedte, hoogte = _service_uit_canvas(gekozen)
    if not service:
        raise HTTPException(422, "In het manifest is geen IIIF image service gevonden")
    return ExterneBron(
        bron="iiif", bronUrl=manifest_url,
        previewUrl=iiif.afbeelding_url(service, breedte, hoogte, 1200),
        service=service, breedte=breedte, hoogte=hoogte, mimeType="image/jpeg",
    )


def resolve_beeldbank(url: str) -> ExterneBron:
    _eis_publieke_url(url)
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        # 1. bekende permalink-patronen -> manifest-URL afleiden
        for patroon, sjabloon in PERMALINK_PATRONEN:
            match = patroon.match(url.strip())
            if match:
                manifest_url = sjabloon.format(**{"record": match.group("record")})
                manifest = _haal_json(client, manifest_url)
                if not manifest:
                    raise HTTPException(422, "De beeldbank leverde geen manifest bij deze permalink")
                return _uit_manifest(manifest, manifest_url, match.groupdict().get("media"))

        # 2. de URL is misschien zelf al een IIIF-document
        document = _haal_json(client, url.strip())
        if document:
            context = str(document.get("@context", ""))
            if "iiif.io/api/presentation" in context:
                return _uit_manifest(document, url.strip(), None)
            if "iiif.io/api/image" in context:
                service = document.get("id") or document.get("@id") or url.strip().removesuffix("/info.json")
                return ExterneBron(
                    bron="iiif", bronUrl=url.strip(),
                    previewUrl=iiif.afbeelding_url(
                        service, document.get("width"), document.get("height"), 1200),
                    service=service, breedte=document.get("width"),
                    hoogte=document.get("height"), mimeType="image/jpeg",
                )
    raise HTTPException(
        422, "Deze link herkennen we (nog) niet als beeldbank-permalink; op dit moment "
             "ondersteunen we de beeldbank van samh.nl en directe IIIF-manifest- of "
             "info.json-links")


def resolve_foto_url(url: str) -> ExterneBron:
    _eis_publieke_url(url)
    try:
        with httpx.Client(timeout=20, follow_redirects=True) as client:
            antwoord = client.get(url.strip())
    except Exception as fout:  # noqa: BLE001
        raise HTTPException(422, "De URL is niet bereikbaar") from fout
    if antwoord.status_code != 200:
        raise HTTPException(422, f"De URL levert geen werkende afbeelding op (status {antwoord.status_code})")
    content_type = (antwoord.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if content_type not in FOTO_TYPES:
        raise HTTPException(422, f"De URL levert geen afbeelding op (type: {content_type or 'onbekend'})")
    data = antwoord.content
    if len(data) > MAX_FOTO_BYTES:
        raise HTTPException(422, "Deze afbeelding is groter dan 20 MB")
    breedte = hoogte = None
    try:
        import pyvips
        beeld = pyvips.Image.new_from_buffer(data, "")
        breedte, hoogte = beeld.width, beeld.height
    except Exception:  # noqa: BLE001 - afmetingen zijn welkom maar niet verplicht
        pass
    return ExterneBron(
        bron="url", bronUrl=url.strip(), previewUrl=url.strip(),
        breedte=breedte, hoogte=hoogte, mimeType=content_type,
    )


def resolve(soort: str, url: str) -> ExterneBron:
    if soort == "beeldbank":
        return resolve_beeldbank(url)
    return resolve_foto_url(url)


def haal_beeld_bytes(bron: ExterneBron) -> bytes | None:
    """Verkleinde download voor de Herkenbaar-check (portretrecht)."""
    doel = (iiif.afbeelding_url(bron.service, bron.breedte, bron.hoogte, 1024)
            if bron.bron == "iiif" and bron.service else bron.bronUrl)
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            antwoord = client.get(doel)
            antwoord.raise_for_status()
            return antwoord.content
    except Exception:  # noqa: BLE001 - de check is een hulpsignaal
        return None
