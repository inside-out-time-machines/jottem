"""Coördinaten bij een plaats-URI uit het NDE Termennetwerk (GeoNames).

De platformbeheerder kiest per organisatie een plaats; die URI
(bijv. https://sws.geonames.org/2755420/) content-negotieert naar RDF met
wgs84_pos:lat/long. We halen dat één keer op en bewaren het bij de organisatie,
zodat de kaarten (standpunt van de fotograaf, speld bij het uploaden) op de eigen
omgeving starten in plaats van op een hardgecodeerde plaats.

Backfill van bestaande organisaties: `python -m app.geo`.
"""
import httpx
from rdflib import Graph, URIRef

WGS84_LAT = URIRef("http://www.w3.org/2003/01/geo/wgs84_pos#lat")
WGS84_LON = URIRef("http://www.w3.org/2003/01/geo/wgs84_pos#long")


def coordinaten(uri: str) -> tuple[float, float] | None:
    """(lat, lon) bij een plaats-URI, of None als het niet lukt. Faalt nooit met een
    exception: het opslaan van een organisatie mag hier niet op stuklopen."""
    if not uri:
        return None
    try:
        antwoord = httpx.get(
            uri,
            headers={"Accept": "application/rdf+xml, text/turtle;q=0.8"},
            follow_redirects=True,
            timeout=15,
        )
        antwoord.raise_for_status()
        formaat = "turtle" if "turtle" in antwoord.headers.get("content-type", "") else "xml"
        graaf = Graph().parse(data=antwoord.content, format=formaat)
    except Exception:  # noqa: BLE001 - onbereikbaar of onparsebaar: geen coördinaten
        return None

    # eerst het subject dat bij de URI hoort (GeoNames beschrijft de plaats onder de
    # http-vorm), anders de eerste lat/long in de graaf
    onderwerpen = [URIRef(uri), URIRef(uri.replace("https://", "http://", 1)), None]
    for onderwerp in onderwerpen:
        lat = graaf.value(onderwerp, WGS84_LAT) if onderwerp else next(
            graaf.objects(None, WGS84_LAT), None)
        lon = graaf.value(onderwerp, WGS84_LON) if onderwerp else next(
            graaf.objects(None, WGS84_LON), None)
        if lat is None or lon is None:
            continue
        try:
            return float(lat), float(lon)
        except (TypeError, ValueError):
            return None
    return None


def _backfill() -> None:
    """Vul de coördinaten van organisaties die al een plaats-URI hebben."""
    from sqlalchemy import select

    from .db import SessionLocal
    from .models import Organisatie

    with SessionLocal() as db:
        organisaties = db.scalars(
            select(Organisatie).where(Organisatie.spatialUri.is_not(None),
                                      Organisatie.spatialLat.is_(None))
        ).all()
        if not organisaties:
            print("geen organisaties zonder coördinaten")
            return
        for organisatie in organisaties:
            gevonden = coordinaten(organisatie.spatialUri)
            if gevonden:
                organisatie.spatialLat, organisatie.spatialLon = gevonden
                print(f"{organisatie.slug}: {organisatie.spatialNaam} -> "
                      f"{gevonden[0]}, {gevonden[1]}")
            else:
                print(f"{organisatie.slug}: geen coördinaten bij {organisatie.spatialUri}")
        db.commit()


if __name__ == "__main__":
    _backfill()
