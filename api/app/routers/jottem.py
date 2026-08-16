"""Publieke jottem-endpoints: duurzame URL met content negotiation.

`Accept: application/ld+json` (of turtle in een latere iteratie) levert JSON-LD conform
schema.org AP NDE (subset); anders HTML (in de MVP rendert de frontend die pagina, de API
geeft een 303 naar de publiekspagina). Gedepubliceerd = 410 tombstone.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import s3
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project
from ..schemas import JottemDetail

router = APIRouter(tags=["Jottems"])


def _detail(db: Session, media: Media) -> JottemDetail:
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    return JottemDetail(
        mediaId=media.mediaId,
        titel=media.titel,
        beschrijving=media.beschrijving,
        genre=media.genre,
        licentie=media.licentie,
        status=media.status.value,
        organisatie=organisatie.naam,
        project=project.naam,
        metadata={r.veld: r.waarde for r in media.metadataRijen},
        afbeeldingUrl=s3.presigned_get(media.objectKey),
        publicatieDatum=media.publicatieDatum,
        wijzigingsDatum=media.wijzigingsDatum,
    )


@router.get("/jottem/{media_id}")
async def jottem(media_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    if media.status == MediaStatus.gedepubliceerd:
        return JSONResponse(
            {"@id": f"{settings().publieke_basis_url}/jottem/{media_id}",
             "status": "gedepubliceerd",
             "melding": "Deze jottem is verwijderd (tombstone)"},
            status_code=410,
        )
    if media.status != MediaStatus.goedgekeurd:
        raise HTTPException(404, "Jottem niet gepubliceerd")

    accept = request.headers.get("accept", "")
    detail = _detail(db, media)

    if "application/ld+json" in accept or "application/json" in accept:
        return JSONResponse({
            "@context": "https://schema.org",
            "@id": f"{settings().publieke_basis_url}/jottem/{media_id}",
            "@type": "ImageObject",
            "name": detail.titel,
            "description": detail.beschrijving,
            "genre": detail.genre,
            "license": detail.licentie,
            "creator": {"@type": "Organization", "name": detail.organisatie},
            "isPartOf": {"@type": "Collection", "name": detail.project},
            "contentUrl": detail.afbeeldingUrl,
            "datePublished": detail.publicatieDatum.isoformat() if detail.publicatieDatum else None,
            "dateModified": detail.wijzigingsDatum.isoformat(),
        }, media_type="application/ld+json")

    # HTML-weergave leeft in de frontend: 303 See Other (content negotiation conform design)
    return RedirectResponse(
        f"{settings().publieke_basis_url}/jottem/{media_id}", status_code=303
    )


@router.get("/jottem/{media_id}/detail", response_model=JottemDetail)
async def jottem_detail(media_id: uuid.UUID, db: Session = Depends(get_db)):
    """Interne detailweergave voor de frontend (ook voor moderatie/preview)."""
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    return _detail(db, media)
