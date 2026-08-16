"""Terminologiebronnen uit het NDE Termennetwerk (OB-3).

Publieke proxy met cache: de organisatiebeheerder kiest hieruit per project de
beschikbare bronnen; de upload- en annotatieschermen beperken zich daarna tot die
selectie. De GraphQL-API van het Termennetwerk is publiek.
"""
import json

import httpx
import redis
from fastapi import APIRouter, HTTPException

from ..config import settings

router = APIRouter(tags=["Termennetwerk"])

TERMENNETWERK_GRAPHQL = "https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql"
CACHE_SLEUTEL = "termennetwerk:bronnen"
CACHE_TTL = 3600

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)


@router.get("/termennetwerk/bronnen")
async def bronnen():
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
