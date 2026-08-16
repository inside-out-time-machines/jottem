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


def _iiif_service(media: Media) -> str | None:
    """IIIF Image API-basis-URL; beschikbaar zodra de worker het derivaat heeft gemaakt."""
    if media.breedte and media.hoogte and media.status == MediaStatus.goedgekeurd:
        return f"{settings().iiif_basis_url}/iiif/3/{media.mediaId}.tif"
    return None


def _detail(db: Session, media: Media) -> JottemDetail:
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    service = _iiif_service(media)
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
        iiifService=service,
        iiifManifest=f"{settings().api_basis_url}/jottem/{media.mediaId}/iiif/manifest" if service else None,
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


@router.get("/jottem/{media_id}/iiif/manifest")
async def iiif_manifest(media_id: uuid.UUID, db: Session = Depends(get_db)):
    """IIIF Presentation API 3.0-manifest van een gepubliceerde jottem."""
    media = db.get(Media, media_id)
    if not media or media.status != MediaStatus.goedgekeurd:
        raise HTTPException(404, "Jottem niet gepubliceerd")
    service = _iiif_service(media)
    if not service:
        raise HTTPException(404, "Beeldderivaat nog niet beschikbaar")
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    cfg = settings()
    manifest_id = f"{cfg.api_basis_url}/jottem/{media.mediaId}/iiif/manifest"
    canvas_id = f"{manifest_id}/canvas/1"
    manifest = {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": manifest_id,
        "type": "Manifest",
        "label": {"nl": [media.titel]},
        "summary": {"nl": [media.beschrijving]} if media.beschrijving else None,
        "rights": media.licentie,
        "requiredStatement": {
            "label": {"nl": ["Bron"]},
            "value": {"nl": [f"{organisatie.naam} · project {project.naam} · via Jottem"]},
        },
        "metadata": [
            {"label": {"nl": [r.veld]}, "value": {"nl": [r.waarde]}}
            for r in media.metadataRijen
        ],
        "homepage": [{
            "id": f"{cfg.publieke_basis_url}/jottem/{media.mediaId}",
            "type": "Text",
            "label": {"nl": ["Bekijk op Jottem"]},
            "format": "text/html",
        }],
        "items": [{
            "id": canvas_id,
            "type": "Canvas",
            "width": media.breedte,
            "height": media.hoogte,
            "items": [{
                "id": f"{canvas_id}/page/1",
                "type": "AnnotationPage",
                "items": [{
                    "id": f"{canvas_id}/page/1/anno/1",
                    "type": "Annotation",
                    "motivation": "painting",
                    "target": canvas_id,
                    "body": {
                        "id": f"{service}/full/max/0/default.jpg",
                        "type": "Image",
                        "format": "image/jpeg",
                        "width": media.breedte,
                        "height": media.hoogte,
                        "service": [{
                            "id": service,
                            "type": "ImageService3",
                            "profile": "level2",
                        }],
                    },
                }],
            }],
        }],
    }
    manifest = {sleutel: waarde for sleutel, waarde in manifest.items() if waarde is not None}
    return JSONResponse(manifest, media_type="application/ld+json;profile=\"http://iiif.io/api/presentation/3/context.json\"")


@router.get("/jottem/{media_id}/detail", response_model=JottemDetail)
async def jottem_detail(media_id: uuid.UUID, db: Session = Depends(get_db)):
    """Interne detailweergave voor de frontend (ook voor moderatie/preview)."""
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    return _detail(db, media)
