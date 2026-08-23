"""Externe fotobronnen: beeldbank-permalinks (IIIF) en directe foto-URL's.

De resolver bepaalt server-side (gezaghebbend, de client wordt niet vertrouwd) wat er
achter een opgegeven URL zit:
- beeldbank: een permalink wordt herleid tot een IIIF Manifest of info.json; die URL
  wordt opgeslagen en getoond. Herkenning start met samh.nl (Memorix); nieuwe
  beeldbanken zijn een extra regel in PERMALINK_PATRONEN.
- foto-URL: de URL moet een werkende afbeelding opleveren (statuscode + content-type).

Er wordt uitsluitend verwezen, niets gekopieerd. SSRF-bescherming: alleen http(s), geen
private, loopback-, link-local-, CGNAT- of metadata-adressen, en **elke redirect-hop
wordt opnieuw gecontroleerd**. Eén controle vooraf is niet genoeg: een externe host kan
doorverwijzen naar een intern adres, en de image service uit een opgehaald manifest is
net zo goed invoer van buiten. Foutmeldingen zijn bewust generiek, zodat de resolver geen
poortscanner wordt.
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
MAX_REDIRECTS = 5
# één melding voor elke afwijzing: anders verraadt het verschil tussen "host onbekend",
# "verbinding geweigerd" en "niet toegestaan" wat er in het interne netwerk draait
GEWEIGERD = "Deze URL kunnen we niet gebruiken"

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
    # beschrijvende gegevens uit het manifest; het uploadformulier vult ze voor
    titel: str | None = None
    beschrijving: str | None = None
    metadata: dict[str, str] | None = None


def _adres_toegestaan(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Alles wat niet ondubbelzinnig publiek internet is, valt af."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped          # ::ffff:127.0.0.1 is gewoon loopback
    if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
            or ip.is_multicast or ip.is_unspecified):
        return False
    if isinstance(ip, ipaddress.IPv4Address):
        # CGNAT en de cloud-metadatadienst zijn niet "private" volgens de stdlib
        if ip in ipaddress.ip_network("100.64.0.0/10") or ip == ipaddress.ip_address("169.254.169.254"):
            return False
    return True


def _eis_publieke_url(url: str) -> None:
    """Schema en alle IP's achter de hostnaam controleren; faalt met één generieke melding."""
    try:
        onderdelen = urlparse(url)
    except ValueError as fout:
        raise HTTPException(422, GEWEIGERD) from fout
    if onderdelen.scheme not in ("http", "https") or not onderdelen.hostname:
        raise HTTPException(422, "Alleen http(s)-URL's zijn toegestaan")
    try:
        adressen = {info[4][0] for info in socket.getaddrinfo(onderdelen.hostname, None)}
    except OSError as fout:
        raise HTTPException(422, GEWEIGERD) from fout
    if not adressen or not all(_adres_toegestaan(ipaddress.ip_address(a)) for a in adressen):
        raise HTTPException(422, GEWEIGERD)


def veilig_ophalen(client: httpx.Client, url: str, **opties) -> httpx.Response:
    """GET met handmatige redirectlus: elke hop wordt eerst gevalideerd.

    httpx' eigen `follow_redirects` zou de controle omzeilen, want die kijkt alleen naar
    de eerste URL. Ook de laatste hop wordt gecontroleerd voordat we hem ophalen.
    """
    huidig = url.strip()
    for _ in range(MAX_REDIRECTS + 1):
        _eis_publieke_url(huidig)
        antwoord = client.get(huidig, follow_redirects=False, **opties)
        if antwoord.status_code not in (301, 302, 303, 307, 308):
            return antwoord
        volgende = antwoord.headers.get("location")
        if not volgende:
            return antwoord
        huidig = str(httpx.URL(huidig).join(volgende))
    raise HTTPException(422, GEWEIGERD)


def _haal_json(client: httpx.Client, url: str) -> dict | None:
    try:
        antwoord = veilig_ophalen(
            client, url, headers={"Accept": "application/json, application/ld+json"})
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


# labels in het metadata-blok van een manifest zijn vrije tekst; deze paar herkennen we en
# mappen we op de metadatavelden die de RDF-mapping al kent. Wat we niet herkennen laten we
# vallen: liever niets dan rommel in de open data.
MANIFEST_VELDEN = {
    "datering": "datering", "datum": "datering", "jaar": "datering",
    "vervaardiger": "vervaardiger", "fotograaf": "vervaardiger", "maker": "vervaardiger",
    "adres": "adres", "straat": "adres", "locatie": "adres", "plaatsnaam": "adres",
}

# labels waaronder een beeldbank de eigenlijke beschrijving kwijt kan
BESCHRIJVING_LABELS = ("beschrijving", "omschrijving", "titel", "onderwerp")

# sommige beeldbanken vullen het label met een plaatsaanduiding in plaats van een titel
GEEN_TITEL = {"no title", "zonder titel", "untitled", "geen titel", ""}


def _tekst(waarde: dict | None) -> str | None:
    """Eén regel uit een meertalige IIIF-map ({"nl": [...], "none": [...]})."""
    if not isinstance(waarde, dict):
        return None
    for taal in ("nl", "en", "none"):
        regels = waarde.get(taal)
        if regels:
            return " ".join(str(r) for r in regels).strip() or None
    for regels in waarde.values():   # onbekende taalcode: neem wat er is
        if regels:
            return " ".join(str(r) for r in regels).strip() or None
    return None


def _manifest_metadata(manifest: dict) -> tuple[dict[str, str], str | None]:
    """De herkende regels uit het metadata-blok, plus de beschrijving als die er staat."""
    gevonden: dict[str, str] = {}
    beschrijving: str | None = None
    for regel in manifest.get("metadata") or []:
        label = (_tekst(regel.get("label")) or "").strip().lower().rstrip(":")
        waarde = _tekst(regel.get("value"))
        if not waarde:
            continue
        if label in BESCHRIJVING_LABELS and not beschrijving:
            beschrijving = waarde[:2000]
        veld = MANIFEST_VELDEN.get(label)
        if veld and veld not in gevonden:
            gevonden[veld] = waarde[:2000]
    return gevonden, beschrijving


def _bruikbare_titel(*kandidaten: str | None) -> str | None:
    """De eerste kandidaat die als titel doorgaat.

    Beeldbanken vullen het manifestlabel soms met "No title" of met een archiefcode van
    het scanbestand; dan is de beschrijving uit het metadata-blok een betere titel. Een
    hele beschrijving is te lang voor een titelveld, dus die knippen we bij de eerste punt.
    """
    for kandidaat in kandidaten:
        if not kandidaat:
            continue
        schoon = kandidaat.strip()
        if schoon.lower() in GEEN_TITEL:
            continue
        # archiefcodes als NL-GdSAMH_0440_58352_Fotocollectie_MH zijn geen titel
        if "_" in schoon and " " not in schoon:
            continue
        eerste = schoon.split(". ")[0].strip(" .")
        return (eerste if 3 <= len(eerste) <= 120 else schoon)[:120]
    return None


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
    # de service-URL komt uit het manifest van een derde: dezelfde eisen als aan invoer
    _eis_publieke_url(service)
    velden, uit_metadata = _manifest_metadata(manifest)
    beschrijving = _tekst(manifest.get("summary")) or uit_metadata
    titel = _bruikbare_titel(_tekst(manifest.get("label")),
                             _tekst(gekozen.get("label")), beschrijving)
    return ExterneBron(
        bron="iiif", bronUrl=manifest_url,
        previewUrl=iiif.afbeelding_url(service, breedte, hoogte, 1200),
        service=service, breedte=breedte, hoogte=hoogte, mimeType="image/jpeg",
        # de beeldbank heeft het materiaal al beschreven; die beschrijving overnemen
        # scheelt de inzender werk en levert betere metadata dan een leeg veld
        titel=titel, beschrijving=beschrijving, metadata=velden or None,
    )


def resolve_beeldbank(url: str) -> ExterneBron:
    _eis_publieke_url(url)
    with httpx.Client(timeout=20) as client:
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
                _eis_publieke_url(service)
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
        with httpx.Client(timeout=20) as client:
            antwoord = veilig_ophalen(client, url)
    except HTTPException:
        raise
    except Exception as fout:  # noqa: BLE001
        raise HTTPException(422, GEWEIGERD) from fout
    if antwoord.status_code != 200:
        raise HTTPException(422, "De URL levert geen werkende afbeelding op")
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
        with httpx.Client(timeout=30) as client:
            # de service-URL komt uit een extern manifest en is dus invoer van buiten
            antwoord = veilig_ophalen(client, doel)
            antwoord.raise_for_status()
            return antwoord.content
    except Exception:  # noqa: BLE001 - de check is een hulpsignaal
        return None
