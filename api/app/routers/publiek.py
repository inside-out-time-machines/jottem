"""Publieke organisatie- en projectpagina's (zonder login, BE-1/BE-2) en de
aggregerende W3C AnnotationCollections per project en organisatie (AP-4)."""
import json
import math
import uuid

import redis
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import anno, iiif, s3
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project
from ..schemas import JottemTegel, OrganisatiePubliek, ProjectPubliek

router = APIRouter(tags=["Publiek"])

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)

PAGINA_GROOTTE = 24


@router.get("/verrijkingen")
def verrijkingen_catalogus():
    """De MVP-verrijkingencatalogus (labels + CTA's), o.a. voor het projectbeheer (V-1)."""
    from ..verrijkingen import CATALOGUS
    return [
        {"sleutel": v.sleutel, "label": v.label, "cta": v.cta,
         "motivation": v.motivation, "doel": v.doel}
        for v in CATALOGUS if v.mvp
    ]


def thumbnail_url(media: Media) -> str | None:
    """IIIF-thumbnail (eigen of externe service), de foto-URL, of presigned origineel;
    bron-bewust, ook gebruikt door de RSS-feeds en IIIF Collections (opendata)."""
    if media.bron == "iiif" and media.externeIiifService:
        return iiif.afbeelding_url(media.externeIiifService, media.breedte, media.hoogte, 400)
    if media.bron == "url":
        return media.bronUrl
    if media.breedte and media.hoogte:
        return iiif.afbeelding_url(
            f"{settings().iiif_basis_url}/iiif/3/{media.mediaId}.tif",
            media.breedte, media.hoogte, 400,
        )
    return s3.presigned_get(media.objectKey) if media.objectKey else None


def _aantal_gepubliceerd(db: Session, project_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(Media)
        .where(Media.projectId == project_id, Media.status == MediaStatus.goedgekeurd)
    ) or 0


@router.get("/organisatie/{slug}/publiek", response_model=OrganisatiePubliek)
def organisatie_publiek(slug: str, db: Session = Depends(get_db)):
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    projecten = []
    for project in organisatie.projecten:
        if project.status != "actief":
            continue
        projecten.append({
            "naam": project.naam,
            "slug": project.slug,
            "oproep": project.oproep,
            "periode": project.periode,
            "afbeeldingUrl": s3.presigned_get(project.afbeelding, bucket=settings().s3_bucket_thumbs)
            if project.afbeelding else None,
            "aantalJottems": _aantal_gepubliceerd(db, project.projectId),
        })
    return OrganisatiePubliek(
        naam=organisatie.naam,
        slug=organisatie.slug,
        beschrijving=organisatie.beschrijving,
        website=organisatie.website,
        kleurPrimair=organisatie.kleurPrimair,
        kleurSecundair=organisatie.kleurSecundair,
        kleurAchtergrond=organisatie.kleurAchtergrond,
        logoUrl=s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
        if organisatie.logo else None,
        projecten=projecten,
    )


def _project(db: Session, org_slug: str, project_slug: str) -> tuple[Organisatie, Project]:
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == org_slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    project = db.scalar(
        select(Project).where(
            Project.organisatieId == organisatie.organisatieId,
            Project.slug == project_slug,
        )
    )
    if not project:
        raise HTTPException(404, "Project onbekend")
    return organisatie, project


@router.get("/organisatie/{org_slug}/project/{project_slug}/publiek", response_model=ProjectPubliek)
def project_publiek(
    org_slug: str, project_slug: str,
    pagina: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
):
    """Projectpagina: info + gepagineerd overzicht van gepubliceerde jottems."""
    organisatie, project = _project(db, org_slug, project_slug)
    totaal = _aantal_gepubliceerd(db, project.projectId)
    paginas = max(1, math.ceil(totaal / PAGINA_GROOTTE))
    rijen = db.scalars(
        select(Media)
        .where(Media.projectId == project.projectId, Media.status == MediaStatus.goedgekeurd)
        .order_by(Media.publicatieDatum.desc())
        .offset((pagina - 1) * PAGINA_GROOTTE).limit(PAGINA_GROOTTE)
    ).all()
    return ProjectPubliek(
        projectId=project.projectId,
        naam=project.naam,
        slug=project.slug,
        organisatieSlug=organisatie.slug,
        organisatieNaam=organisatie.naam,
        kleurPrimair=organisatie.kleurPrimair,
        kleurSecundair=organisatie.kleurSecundair,
        logoUrl=s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
        if organisatie.logo else None,
        beschrijving=project.beschrijving,
        oproep=project.oproep,
        periode=project.periode,
        datasetLicentie=project.datasetLicentie,
        afbeeldingUrl=s3.presigned_get(project.afbeelding, bucket=settings().s3_bucket_thumbs)
        if project.afbeelding else None,
        aantalJottems=totaal,
        jottems=[
            JottemTegel(
                mediaId=m.mediaId, titel=m.titel,
                thumbnailUrl=thumbnail_url(m), publicatieDatum=m.publicatieDatum,
            )
            for m in rijen
        ],
        pagina=pagina,
        paginas=paginas,
    )


ANNO_MEDIA_TYPE = 'application/ld+json;profile="http://www.w3.org/ns/anno.jsonld"'


def _aggregatie(db: Session, media_ids: list[uuid.UUID], collectie_id: str, label: str,
                cache_sleutel: str) -> JSONResponse:
    """Aggregerende AnnotationCollection over de containers van meerdere jottems.

    Op pilotschaal lezen we de containers live uit AnnoRepo, met een korte
    Valkey-cache; de per-jottem-containers blijven de canonieke W3C-bron.
    """
    gecached = _valkey.get(cache_sleutel)
    if gecached:
        return JSONResponse(json.loads(gecached), media_type=ANNO_MEDIA_TYPE)
    items: list[dict] = []
    for media_id in media_ids:
        items.extend(anno.alle_annotaties(str(media_id)))
    collectie = {
        "@context": "http://www.w3.org/ns/anno.jsonld",
        "id": collectie_id,
        "type": "AnnotationCollection",
        "label": label,
        "total": len(items),
        "first": {
            "id": f"{collectie_id}?page=0",
            "type": "AnnotationPage",
            "partOf": collectie_id,
            "startIndex": 0,
            "items": items,
        },
    }
    _valkey.setex(cache_sleutel, 300, json.dumps(collectie))
    return JSONResponse(collectie, media_type=ANNO_MEDIA_TYPE)


@router.get("/project/{project_id}/annotations")
def project_annotaties(project_id: uuid.UUID, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    media_ids = db.scalars(
        select(Media.mediaId).where(
            Media.projectId == project_id, Media.status == MediaStatus.goedgekeurd)
    ).all()
    return _aggregatie(
        db, media_ids,
        f"{settings().api_basis_url}/project/{project_id}/annotations",
        f"Annotaties bij project {project.naam}",
        f"annotaties:project:{project_id}",
    )


@router.get("/organisatie/{slug}/annotations")
def organisatie_annotaties(slug: str, db: Session = Depends(get_db)):
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    media_ids = db.scalars(
        select(Media.mediaId).where(
            Media.organisatieId == organisatie.organisatieId,
            Media.status == MediaStatus.goedgekeurd)
    ).all()
    return _aggregatie(
        db, media_ids,
        f"{settings().api_basis_url}/organisatie/{slug}/annotations",
        f"Annotaties bij {organisatie.naam}",
        f"annotaties:organisatie:{slug}",
    )
