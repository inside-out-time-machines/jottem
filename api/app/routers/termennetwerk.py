"""Terminologiebronnen en term-zoekopdrachten uit het NDE Termennetwerk (OB-3, AN-1).

Publieke proxy met cache: de organisatiebeheerder kiest per project de beschikbare
bronnen; de upload- en annotatieschermen beperken hun zoekopdrachten daarna tot die
selectie. De GraphQL-API van het Termennetwerk is publiek.
"""
import hashlib
import json
import uuid

import httpx
import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Project

router = APIRouter(tags=["Termennetwerk"])

TERMENNETWERK_GRAPHQL = "https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql"
CACHE_SLEUTEL = "termennetwerk:bronnen"
CACHE_TTL = 3600

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)


def _haal_bronnen() -> list[dict]:
    """De bronnenlijst uit het Termennetwerk, met cache."""
    try:
        gecached = _valkey.get(CACHE_SLEUTEL)
        if gecached:
            return json.loads(gecached)
    except redis.RedisError:
        pass
    try:
        antwoord = httpx.post(
            TERMENNETWERK_GRAPHQL,
            json={"query": "{ sources { uri name alternateName creators { name } } }"},
            timeout=30,
        )
        antwoord.raise_for_status()
        data = antwoord.json()["data"]["sources"]
    except Exception as fout:  # noqa: BLE001
        raise HTTPException(502, f"Termennetwerk niet bereikbaar: {fout}") from fout
    resultaat = [
        {
            "uri": bron["uri"],
            "naam": bron["name"],
            "alternatief": bron.get("alternateName"),
            "beheerder": (bron.get("creators") or [{}])[0].get("name"),
        }
        for bron in data
    ]
    try:
        _valkey.setex(CACHE_SLEUTEL, CACHE_TTL, json.dumps(resultaat))
    except redis.RedisError:
        pass
    return resultaat


@router.get("/termennetwerk/bronnen")
def bronnen():
    return _haal_bronnen()


def _bron_uris(db: Session, project_id: uuid.UUID | None) -> list[str]:
    """Bron-URI's waarbinnen gezocht mag worden: de projectselectie (OB-3), of alle
    bronnen als er geen selectie is. Waarden die geen URI zijn (bijv. 'cht') worden
    tegen de bronnenlijst gematcht op uri/naam/alternatieve naam."""
    lijst = _haal_bronnen()
    alle = [b["uri"] for b in lijst]
    if not project_id:
        return alle
    project = db.get(Project, project_id)
    if not project or not project.terminologiebronnen:
        return alle
    uris: list[str] = []
    for waarde in project.terminologiebronnen:
        if waarde.startswith("http"):
            uris.append(waarde)
            continue
        naald = waarde.lower()
        for bron in lijst:
            doelen = [bron["uri"], bron.get("naam") or "", bron.get("alternatief") or ""]
            if any(naald in str(d).lower() for d in doelen):
                uris.append(bron["uri"])
    return uris or alle


ZOEK_QUERY = """
query Zoek($bronnen: [ID]!, $tekst: String!) {
  terms(sources: $bronnen, query: $tekst, queryMode: OPTIMIZED, timeoutMs: 10000) {
    source { uri name }
    result {
      __typename
      ... on Terms { terms { uri prefLabel altLabel } }
    }
  }
}
"""


@router.get("/termennetwerk/zoek")
def zoek(
    query: str = Query(min_length=2, max_length=200),
    project: uuid.UUID | None = None,
    bron: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
):
    """Zoek termen (voor tags en identificaties), beperkt tot de projectbronnen; met
    `bron` wordt in één specifieke bron gezocht (bijv. GeoNames voor plaatsnamen)."""
    if bron:
        naald = bron.lower()
        bronnen = [
            b["uri"] for b in _haal_bronnen()
            if any(naald in str(d).lower()
                   for d in (b["uri"], b.get("naam") or "", b.get("alternatief") or ""))
        ]
        if not bronnen:
            raise HTTPException(404, f"Bron '{bron}' onbekend in het Termennetwerk")
    else:
        bronnen = _bron_uris(db, project)
    sleutel = "termennetwerk:zoek:" + hashlib.sha1(
        (query.lower() + "|" + ",".join(sorted(bronnen))).encode()).hexdigest()
    try:
        gecached = _valkey.get(sleutel)
        if gecached:
            return json.loads(gecached)
    except redis.RedisError:
        pass
    try:
        antwoord = httpx.post(
            TERMENNETWERK_GRAPHQL,
            json={"query": ZOEK_QUERY, "variables": {"bronnen": bronnen, "tekst": query}},
            timeout=15,
        )
        antwoord.raise_for_status()
        data = antwoord.json()["data"]["terms"]
    except Exception as fout:  # noqa: BLE001
        raise HTTPException(502, f"Termennetwerk niet bereikbaar: {fout}") from fout
    resultaat = []
    for per_bron in data:
        bron_naam = (per_bron.get("source") or {}).get("name")
        for term in (per_bron.get("result") or {}).get("terms", []) or []:
            labels = term.get("prefLabel") or []
            resultaat.append({
                "uri": term["uri"],
                "label": labels[0] if labels else term["uri"],
                "alternatief": (term.get("altLabel") or [None])[0],
                "bron": bron_naam,
            })
    resultaat = resultaat[:25]
    try:
        _valkey.setex(sleutel, 300, json.dumps(resultaat))
    except redis.RedisError:
        pass
    return resultaat
