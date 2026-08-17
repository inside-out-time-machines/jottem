"""Open data-outputs (novembermijlpaal): IIIF Collections, IIIF Change Discovery,
RSS-feeds, datadump per project en de platformbrede datacatalogus.

Alle endpoints zijn publiek en volgen de URI-strategie en veld-naar-bron-tabellen uit
de data-architectuur; ze zijn bereikbaar op api.<domein> én (voor de data-paden) op
data.<domein> via de Traefik-router.
"""
import gzip
import math
import uuid
from email.utils import format_datetime
from xml.sax.saxutils import escape

import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import rdf
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project

router = APIRouter(tags=["Open data"])

_valkey = redis.Redis.from_url(settings().valkey_url)

IIIF_MEDIA_TYPE = 'application/ld+json;profile="http://iiif.io/api/presentation/3/context.json"'
CD_PAGINA_GROOTTE = 100


def _manifest_uri(media_id) -> str:
    return f"{settings().api_basis_url}/jottem/{media_id}/iiif/manifest"


def _organisatie(db: Session, slug: str) -> Organisatie:
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    return organisatie


def _gepubliceerd(db: Session, *, organisatie_id: int | None = None,
                  project_id: uuid.UUID | None = None) -> list[Media]:
    vraag = select(Media).where(Media.status == MediaStatus.goedgekeurd)
    if organisatie_id is not None:
        vraag = vraag.where(Media.organisatieId == organisatie_id)
    if project_id is not None:
        vraag = vraag.where(Media.projectId == project_id)
    return db.scalars(vraag.order_by(Media.publicatieDatum.desc())).all()


# ---------- IIIF Presentation: Collections ----------

def _collection(collectie_id: str, label: str, beschrijving: str | None,
                media: list[Media]) -> JSONResponse:
    collectie = {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": collectie_id,
        "type": "Collection",
        "label": {"nl": [label]},
        "summary": {"nl": [beschrijving]} if beschrijving else None,
        "items": [
            {
                "id": _manifest_uri(m.mediaId),
                "type": "Manifest",
                "label": {"nl": [m.titel]},
                "thumbnail": [{
                    "id": f"{settings().iiif_basis_url}/iiif/3/{m.mediaId}.tif/full/!400,400/0/default.jpg",
                    "type": "Image",
                    "format": "image/jpeg",
                }] if m.breedte else None,
            }
            for m in media
        ],
    }
    collectie["items"] = [
        {sleutel: waarde for sleutel, waarde in item.items() if waarde is not None}
        for item in collectie["items"]
    ]
    collectie = {sleutel: waarde for sleutel, waarde in collectie.items() if waarde is not None}
    return JSONResponse(collectie, media_type=IIIF_MEDIA_TYPE)


@router.get("/organisatie/{slug}/jottems/iiif/collection")
async def organisatie_collection(slug: str, db: Session = Depends(get_db)):
    organisatie = _organisatie(db, slug)
    return _collection(
        f"{settings().api_basis_url}/organisatie/{slug}/jottems/iiif/collection",
        f"Jottems van {organisatie.naam}", organisatie.beschrijving,
        _gepubliceerd(db, organisatie_id=organisatie.organisatieId),
    )


@router.get("/project/{project_id}/iiif/collection")
async def project_collection(project_id: uuid.UUID, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    return _collection(
        f"{settings().api_basis_url}/project/{project_id}/iiif/collection",
        project.naam, project.beschrijving,
        _gepubliceerd(db, project_id=project_id),
    )


# ---------- IIIF Change Discovery ----------

def _activiteiten(db: Session, *, organisatie_id: int | None = None,
                  project_id: uuid.UUID | None = None) -> list[dict]:
    """Create/Update/Delete-activiteiten (organisatie of project), oplopend op endTime."""
    stmt = select(Media).where(
        Media.status.in_([MediaStatus.goedgekeurd, MediaStatus.gedepubliceerd]))
    if organisatie_id is not None:
        stmt = stmt.where(Media.organisatieId == organisatie_id)
    if project_id is not None:
        stmt = stmt.where(Media.projectId == project_id)
    rijen = db.scalars(stmt).all()
    activiteiten = []
    for m in rijen:
        manifest = {"id": _manifest_uri(m.mediaId), "type": "Manifest"}
        if m.status == MediaStatus.gedepubliceerd:
            activiteiten.append({"type": "Delete", "object": manifest,
                                 "endTime": m.wijzigingsDatum})
            continue
        if m.publicatieDatum:
            activiteiten.append({"type": "Create", "object": manifest,
                                 "endTime": m.publicatieDatum})
            if m.wijzigingsDatum > m.publicatieDatum:
                activiteiten.append({"type": "Update", "object": manifest,
                                     "endTime": m.wijzigingsDatum})
    return sorted(activiteiten, key=lambda a: a["endTime"])


def _activity_stream(activiteiten: list[dict], basis: str, pagina: int | None) -> JSONResponse:
    """IIIF Change Discovery 1.0: OrderedCollection (zonder page) of een pagina."""
    laatste = max(0, math.ceil(len(activiteiten) / CD_PAGINA_GROOTTE) - 1)

    if pagina is None:
        collectie = {
            "@context": "http://iiif.io/api/discovery/1/context.json",
            "id": basis,
            "type": "OrderedCollection",
            "totalItems": len(activiteiten),
            "first": {"id": f"{basis}?page=0", "type": "OrderedCollectionPage"},
            "last": {"id": f"{basis}?page={laatste}", "type": "OrderedCollectionPage"},
        }
        return JSONResponse(collectie, media_type="application/ld+json")

    start = pagina * CD_PAGINA_GROOTTE
    items = activiteiten[start:start + CD_PAGINA_GROOTTE]
    blad = {
        "@context": "http://iiif.io/api/discovery/1/context.json",
        "id": f"{basis}?page={pagina}",
        "type": "OrderedCollectionPage",
        "partOf": {"id": basis, "type": "OrderedCollection"},
        "startIndex": start,
        "prev": {"id": f"{basis}?page={pagina - 1}", "type": "OrderedCollectionPage"} if pagina > 0 else None,
        "next": {"id": f"{basis}?page={pagina + 1}", "type": "OrderedCollectionPage"} if pagina < laatste else None,
        "orderedItems": [
            {"type": a["type"], "object": a["object"], "endTime": a["endTime"].isoformat()}
            for a in items
        ],
    }
    blad = {sleutel: waarde for sleutel, waarde in blad.items() if waarde is not None}
    return JSONResponse(blad, media_type="application/ld+json")


@router.get("/organisatie/{slug}/activity-stream")
async def activity_stream(slug: str, pagina: int | None = Query(default=None, alias="page", ge=0),
                          db: Session = Depends(get_db)):
    """Activity-stream van alle jottems van een organisatie (Change Discovery)."""
    organisatie = _organisatie(db, slug)
    return _activity_stream(
        _activiteiten(db, organisatie_id=organisatie.organisatieId),
        f"{settings().api_basis_url}/organisatie/{slug}/activity-stream", pagina)


@router.get("/project/{project_id}/activity-stream")
async def project_activity_stream(project_id: uuid.UUID,
                                  pagina: int | None = Query(default=None, alias="page", ge=0),
                                  db: Session = Depends(get_db)):
    """Activity-stream van één project (Change Discovery); ook de distributie waarnaar
    de projectdatasetbeschrijving verwijst."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    return _activity_stream(
        _activiteiten(db, project_id=project_id),
        f"{settings().api_basis_url}/project/{project_id}/activity-stream", pagina)


# ---------- RSS 2.0 ----------

def _rss(titel: str, link: str, beschrijving: str | None, items: list[str]) -> Response:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n<channel>\n'
        f"<title>{escape(titel)}</title>\n"
        f"<link>{escape(link)}</link>\n"
        f"<description>{escape(beschrijving or titel)}</description>\n"
        "<language>nl</language>\n"
        + "".join(items)
        + "</channel>\n</rss>\n"
    )
    return Response(xml, media_type="application/rss+xml")


def _rss_jottem_item(m: Media) -> str:
    cfg = settings()
    link = f"{cfg.publieke_basis_url}/jottem/{m.mediaId}"
    thumb = (f"{cfg.iiif_basis_url}/iiif/3/{m.mediaId}.tif/full/!400,400/0/default.jpg"
             if m.breedte else None)
    beschrijving = escape(m.beschrijving or m.titel)
    if thumb:
        beschrijving = f'&lt;img src="{escape(thumb)}"/&gt; {beschrijving}'
    item = (
        "<item>\n"
        f"<title>{escape(m.titel)}</title>\n"
        f"<link>{escape(link)}</link>\n"
        f'<guid isPermaLink="true">{escape(link)}</guid>\n'
        f"<description>{beschrijving}</description>\n"
    )
    if m.publicatieDatum:
        item += f"<pubDate>{format_datetime(m.publicatieDatum)}</pubDate>\n"
    if thumb:
        item += f'<enclosure url="{escape(thumb)}" type="image/jpeg" length="0"/>\n'
    return item + "</item>\n"


@router.get("/rss")
async def platform_rss(db: Session = Depends(get_db)):
    """Platformbrede feed: de aangesloten organisaties (data-architectuur, sectie RSS)."""
    cfg = settings()
    items = "".join(
        "<item>\n"
        f"<title>{escape(organisatie.naam)}</title>\n"
        f"<link>{cfg.publieke_basis_url}/organisatie/{organisatie.slug}</link>\n"
        f'<guid isPermaLink="true">{cfg.publieke_basis_url}/organisatie/{organisatie.slug}</guid>\n'
        f"<description>{escape(organisatie.beschrijving or organisatie.naam)}</description>\n"
        "</item>\n"
        for organisatie in db.scalars(select(Organisatie).order_by(Organisatie.naam))
    )
    return _rss("Jottem: organisaties", cfg.publieke_basis_url,
                "Nieuwe organisaties op het Jottem-platform", [items])


@router.get("/organisatie/{slug}/rss")
async def organisatie_rss(slug: str, db: Session = Depends(get_db)):
    organisatie = _organisatie(db, slug)
    media = _gepubliceerd(db, organisatie_id=organisatie.organisatieId)[:50]
    return _rss(
        f"Jottems van {organisatie.naam}",
        f"{settings().publieke_basis_url}/organisatie/{slug}",
        organisatie.beschrijving,
        [_rss_jottem_item(m) for m in media],
    )


@router.get("/project/{project_id}/rss")
async def project_rss(project_id: uuid.UUID, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    organisatie = db.get(Organisatie, project.organisatieId)
    media = _gepubliceerd(db, project_id=project_id)[:50]
    return _rss(
        f"{project.naam} ({organisatie.naam})",
        f"{settings().publieke_basis_url}/organisatie/{organisatie.slug}/{project.slug}",
        project.oproep or project.beschrijving,
        [_rss_jottem_item(m) for m in media],
    )


# ---------- Datadump en datacatalogus ----------

@router.get("/project/{project_id}/dump-{slug}.nt.gz")
async def project_dump(project_id: uuid.UUID, slug: str, db: Session = Depends(get_db)):
    """N-Triples-dump van alle gepubliceerde jottems van een project (gecomprimeerd);
    de kern-distributie van de projectdataset en onderdeel van de exitstrategie."""
    project = db.get(Project, project_id)
    if not project or project.slug != slug:
        raise HTTPException(404, "Project onbekend")
    sleutel = f"dump:{project_id}"
    dump = _valkey.get(sleutel)
    if dump is None:
        documenten = rdf.project_jsonld(db, project)
        if not documenten:
            raise HTTPException(404, "Dit project heeft nog geen openbare data")
        dump = gzip.compress(rdf.serialiseer(documenten, "nt"))
        _valkey.setex(sleutel, 3600, dump)
    return Response(
        dump, media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="dump-{project.slug}.nt.gz"'},
    )


@router.get("/project/{project_id}/dump.nt.gz")
async def project_dump_oud(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """De oude dump-URL zonder slug staat in eerder gepubliceerde datasetbeschrijvingen:
    permanent doorverwijzen naar de naam met projectslug."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    return RedirectResponse(
        f"{settings().data_basis_url}/project/{project_id}/dump-{project.slug}.nt.gz",
        status_code=301,
    )


@router.get("/datacatalog")
async def datacatalogus(db: Session = Depends(get_db)):
    """Platformbrede datacatalogus (schema:DataCatalog): alle projectdatasets met
    openbare data; samen dekken die alle gepubliceerde jottems."""
    cfg = settings()
    datasets = []
    for project in db.scalars(select(Project)):
        aantal = db.scalar(
            select(func.count()).select_from(Media).where(
                Media.projectId == project.projectId,
                Media.status == MediaStatus.goedgekeurd)
        ) or 0
        if aantal:
            datasets.append({"@id": rdf.dataset_uri(project.projectId), "@type": "Dataset"})
    catalogus = {
        "@context": "https://schema.org/",
        "@id": f"{cfg.data_basis_url}/datacatalog",
        "@type": "DataCatalog",
        "name": "Jottem-datacatalogus",
        "description": "Alle projectdatasets van het Jottem-platform; elke gepubliceerde "
                       "jottem hoort bij precies één projectdataset.",
        "publisher": {"@type": "Organization", "name": "Inside Out Time Machines",
                      "url": "https://www.iotm.nl/"},
        "inLanguage": "nl",
        "dataset": datasets,
    }
    return JSONResponse(catalogus, media_type="application/ld+json")
