"""Client voor AnnoRepo, de W3C Web Annotation-server (vervangt miiify uit het
oorspronkelijke design, dat read-only is geworden).

Schrijven gebeurt uitsluitend hier, met de api-key; de containers staan op
readOnlyForAnonymousUsers zodat iedereen ze op anno.<domein> kan lezen. Eén container
per jottem, containernaam = mediaId. AnnoRepo kent PUT/DELETE alleen met If-Match op
de actuele ETag; die halen we per operatie op.
"""
import httpx
from fastapi import HTTPException

from .config import settings

ANNO_PROFIEL = 'application/ld+json; profile="http://www.w3.org/ns/anno.jsonld"'


def _headers(extra: dict | None = None) -> dict:
    kop = {
        "Authorization": f"Bearer {settings().anno_api_key}",
        "Accept": ANNO_PROFIEL,
    }
    if extra:
        kop.update(extra)
    return kop


def container_url_intern(container: str) -> str:
    return f"{settings().anno_url}/w3c/{container}/"


def container_url_publiek(container: str) -> str:
    return f"{settings().anno_basis_url}/w3c/{container}/"


def annotatie_iri(container: str, naam: str) -> str:
    return f"{settings().anno_basis_url}/w3c/{container}/{naam}"


def _intern(iri: str) -> str:
    """Publieke annotatie-IRI naar de interne AnnoRepo-URL."""
    return iri.replace(settings().anno_basis_url, settings().anno_url, 1)


def zorg_voor_container(client: httpx.Client, container: str, label: str) -> None:
    """Maak de container voor een jottem aan als die nog niet bestaat (idempotent)."""
    r = client.head(container_url_intern(container), headers=_headers())
    if r.status_code == 200:
        return
    r = client.post(
        f"{settings().anno_url}/w3c/",
        headers=_headers({"Content-Type": ANNO_PROFIEL, "Slug": container}),
        json={
            "@context": ["http://www.w3.org/ns/anno.jsonld", "http://www.w3.org/ns/ldp.jsonld"],
            "type": ["BasicContainer", "AnnotationCollection"],
            "label": label,
            "readOnlyForAnonymousUsers": True,
        },
    )
    if r.status_code not in (200, 201):
        raise HTTPException(502, "Annotatieserver niet beschikbaar")


def maak_annotatie(container: str, label: str, annotatie: dict) -> dict:
    """Sla een annotatie op; retourneert de annotatie zoals AnnoRepo die teruggeeft
    (met id), herschreven naar de publieke IRI."""
    with httpx.Client(timeout=15) as client:
        zorg_voor_container(client, container, label)
        r = client.post(
            container_url_intern(container),
            headers=_headers({"Content-Type": ANNO_PROFIEL}),
            json=annotatie,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(502, "Annotatie kon niet worden opgeslagen")
        return _publiek_dict(r.json())


def _etag(client: httpx.Client, iri: str) -> str:
    r = client.get(_intern(iri), headers=_headers())
    if r.status_code == 404:
        raise HTTPException(404, "Annotatie niet gevonden")
    r.raise_for_status()
    return r.headers.get("ETag", "")


def haal_annotatie(iri: str) -> dict:
    with httpx.Client(timeout=15) as client:
        r = client.get(_intern(iri), headers=_headers())
        if r.status_code == 404:
            raise HTTPException(404, "Annotatie niet gevonden")
        r.raise_for_status()
        return _publiek_dict(r.json())


def vervang_annotatie(iri: str, annotatie: dict) -> dict:
    with httpx.Client(timeout=15) as client:
        etag = _etag(client, iri)
        r = client.put(
            _intern(iri),
            headers=_headers({"Content-Type": ANNO_PROFIEL, "If-Match": etag}),
            json=annotatie,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(502, "Annotatie kon niet worden bijgewerkt")
        return _publiek_dict(r.json())


def verwijder_annotatie(iri: str) -> None:
    with httpx.Client(timeout=15) as client:
        etag = _etag(client, iri)
        r = client.delete(_intern(iri), headers=_headers({"If-Match": etag}))
        if r.status_code not in (200, 204):
            raise HTTPException(502, "Annotatie kon niet worden verwijderd")


def lees_container(container: str, pagina: int | None = None) -> dict | None:
    """AnnotationCollection (of een AnnotationPage) van een jottem; None als de
    container (nog) niet bestaat."""
    url = container_url_intern(container)
    if pagina is not None:
        url = f"{url}?page={pagina}"
    with httpx.Client(timeout=15) as client:
        r = client.get(url, headers=_headers())
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return _publiek_dict(r.json())


def alle_annotaties(container: str) -> list[dict]:
    """Alle annotaties van een jottem (pagina's doorlopen), publiek herschreven."""
    collectie = lees_container(container)
    if not collectie:
        return []
    items: list[dict] = []
    eerste = collectie.get("first")
    if isinstance(eerste, dict):
        items.extend(eerste.get("items", []))
        volgende = eerste.get("next")
        with httpx.Client(timeout=15) as client:
            while volgende:
                r = client.get(_intern(volgende), headers=_headers())
                r.raise_for_status()
                pagina = _publiek_dict(r.json())
                items.extend(pagina.get("items", []))
                volgende = pagina.get("next")
    return items


def _publiek_dict(data: dict) -> dict:
    """Herschrijf interne AnnoRepo-URL's naar de publieke anno-basis-URL."""
    import json

    tekst = json.dumps(data)
    tekst = tekst.replace(settings().anno_url, settings().anno_basis_url)
    return json.loads(tekst)
