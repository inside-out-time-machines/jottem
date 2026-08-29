"""Publieke organisatie- en projectpagina's (zonder login, BE-1/BE-2) en de
aggregerende W3C AnnotationCollections per project en organisatie (AP-4)."""
import json
import math
import random
import uuid

import redis
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import accept, anno, frames, iiif, s3
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project
from ..schemas import JottemTegel, OrganisatiePubliek, ProjectPubliek, ProjectWidget, WidgetCta
from ..verrijkingen import actieve_verrijkingen

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


@router.get("/organisatie/{org_slug}/project/{project_slug}/widget", response_model=ProjectWidget)
def project_widget(
    org_slug: str, project_slug: str,
    aantal: int = Query(default=4, ge=1, le=12),
    volgorde: str = Query(default="recent", pattern="^(recent|willekeurig)$"),
    db: Session = Depends(get_db),
):
    """Gegevens voor de inbedbare widgets (hoofdstuk Deelbaarheid, D-1): projectinfo,
    de {aantal} recentste of willekeurige gepubliceerde jottems, en een willekeurige
    actieve verrijkings-CTA (D-4). De widget-HTML zelf komt uit de webapplicatie."""
    organisatie, project = _project(db, org_slug, project_slug)
    orden = func.random() if volgorde == "willekeurig" else Media.publicatieDatum.desc()
    rijen = db.scalars(
        select(Media)
        .where(Media.projectId == project.projectId, Media.status == MediaStatus.goedgekeurd)
        .order_by(orden).limit(aantal)
    ).all()
    keuze = actieve_verrijkingen(project)
    gekozen = random.choice(keuze) if keuze else None
    return ProjectWidget(
        projectId=project.projectId,
        naam=project.naam,
        slug=project.slug,
        organisatieSlug=organisatie.slug,
        organisatieNaam=organisatie.naam,
        kleurPrimair=organisatie.kleurPrimair,
        logoUrl=s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
        if organisatie.logo else None,
        beschrijving=project.beschrijving,
        oproep=project.oproep,
        aantalJottems=_aantal_gepubliceerd(db, project.projectId),
        cta=WidgetCta(sleutel=gekozen.sleutel, cta=gekozen.cta) if gekozen else None,
        jottems=[
            JottemTegel(
                mediaId=m.mediaId, titel=m.titel,
                thumbnailUrl=thumbnail_url(m), publicatieDatum=m.publicatieDatum,
            )
            for m in rijen
        ],
    )


ANNO_PROFIEL = "http://www.w3.org/ns/anno.jsonld"
ANNO_MEDIA_TYPE = f'application/ld+json;profile="{ANNO_PROFIEL}"'
# bovengrens voor framen van een aggregatie; daarboven blijft de gewone representatie over
MAX_FRAME_ITEMS = 5000


def _aggregatie(db: Session, media_ids: list[uuid.UUID], collectie_id: str, label: str,
                cache_sleutel: str, kop: str = "") -> JSONResponse:
    """Aggregerende AnnotationCollection over de containers van meerdere jottems.

    Op pilotschaal lezen we de containers live uit AnnoRepo, met een korte
    Valkey-cache; de per-jottem-containers blijven de canonieke W3C-bron.

    Vraagt de client een geframede representatie, dan wordt die apart gecacht: framing
    kost werk en deze collectie is de enige die met het project mee kan groeien.
    """
    geframed = accept.framed_gevraagd(kop)
    sleutel = f"{cache_sleutel}:framed" if geframed else cache_sleutel
    gecached = _valkey.get(sleutel)
    if gecached:
        return (frames.antwoord(json.loads(gecached), "annotatiecollectie", (ANNO_PROFIEL,))
                if geframed
                else JSONResponse(json.loads(gecached), media_type=ANNO_MEDIA_TYPE,
                                  headers={"Vary": "Accept"}))
    items: list[dict] = []
    for media_id in media_ids:
        items.extend(anno.alle_annotaties(str(media_id)))
    collectie = {
        # dezelfde context als op de losse annotatie, uit dezelfde definitie: zonder de
        # jottem-prefix zijn jottem:verrijking en jottem:aard hier geen resolvebare termen
        "@context": anno.context(),
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
    if geframed:
        # boven deze omvang is framen (de hele graaf moet in het geheugen) duurder dan
        # het oplevert; dan krijgt de client de gewone representatie, zoals de
        # data-architectuur ook adviseert bij grote grafen
        if len(items) > MAX_FRAME_ITEMS:
            return JSONResponse(collectie, media_type=ANNO_MEDIA_TYPE,
                                headers={"Vary": "Accept"})
        _valkey.setex(f"{cache_sleutel}:framed", 300, json.dumps(collectie))
        return frames.antwoord(collectie, "annotatiecollectie", (ANNO_PROFIEL,))
    return JSONResponse(collectie, media_type=ANNO_MEDIA_TYPE, headers={"Vary": "Accept"})


@router.get("/project/{project_id}/annotations")
def project_annotaties(project_id: uuid.UUID, request: Request,
                       db: Session = Depends(get_db)):
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
        request.headers.get("accept", ""),
    )


@router.get("/organisatie/{slug}/annotations")
def organisatie_annotaties(slug: str, request: Request,
                           db: Session = Depends(get_db)):
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
        request.headers.get("accept", ""),
    )
