"""Publieke jottem-endpoints: duurzame URL met content negotiation.

`Accept: application/ld+json` (of turtle in een latere iteratie) levert JSON-LD conform
schema.org AP NDE (subset); anders HTML (in de MVP rendert de frontend die pagina, de API
geeft een 303 naar de publiekspagina). Gedepubliceerd = 410 tombstone.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import anno, iiif, s3
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, MediaStatus, Organisatie, Project
from ..schemas import JottemDetail, VerrijkingUit
from ..verrijkingen import actieve_verrijkingen

router = APIRouter(tags=["Jottems"])


def _iiif_service(media: Media) -> str | None:
    """IIIF Image API-basis-URL: de eigen Cantaloupe voor uploads (zodra de worker het
    derivaat heeft gemaakt), of de externe service bij een beeldbank-bron."""
    if media.status != MediaStatus.goedgekeurd:
        return None
    if media.bron == "iiif":
        return media.externeIiifService
    if media.bron == "url":
        return None
    if media.breedte and media.hoogte:
        return f"{settings().iiif_basis_url}/iiif/3/{media.mediaId}.tif"
    return None


def afbeelding_url(media: Media) -> str | None:
    """Getoonde afbeelding: presigned origineel (upload), IIIF-preview (beeldbank)
    of de foto-URL zelf (website)."""
    if media.bron == "iiif" and media.externeIiifService:
        return iiif.afbeelding_url(media.externeIiifService, media.breedte, media.hoogte, 1200)
    if media.bron == "url":
        return media.bronUrl
    return s3.presigned_get(media.objectKey) if media.objectKey else None


def canvas_iri(media: Media) -> str:
    return f"{settings().api_basis_url}/jottem/{media.mediaId}/iiif/manifest/canvas/1"


def iiif_rights(licentie: str | None) -> str | None:
    """IIIF Presentation 3 eist in `rights` de canonieke URI van Creative Commons en
    RightsStatements.org, en die is http://; elders (RDF, datasetbeschrijving, NDE)
    gebruiken we bewust de https-vorm."""
    if licentie and licentie.startswith(("https://creativecommons.org/",
                                         "https://rightsstatements.org/")):
        return "http://" + licentie.removeprefix("https://")
    return licentie


def _detail(db: Session, media: Media) -> JottemDetail:
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    uploader = db.get(Gebruiker, media.uploaderId)
    toon_uploader = bool(uploader and uploader.naamPubliek)
    service = _iiif_service(media)
    gepubliceerd = media.status == MediaStatus.goedgekeurd
    return JottemDetail(
        mediaId=media.mediaId,
        titel=media.titel,
        beschrijving=media.beschrijving,
        genre=media.genre,
        licentie=media.licentie,
        status=media.status.value,
        organisatie=organisatie.naam,
        organisatieSlug=organisatie.slug,
        organisatieLogoUrl=s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
        if organisatie.logo else None,
        organisatieLat=organisatie.spatialLat,
        organisatieLon=organisatie.spatialLon,
        organisatieKleurPrimair=organisatie.kleurPrimair,
        organisatieKleurSecundair=organisatie.kleurSecundair,
        project=project.naam,
        projectSlug=project.slug,
        projectId=project.projectId,
        metadata={r.veld: r.waarde for r in media.metadataRijen},
        afbeeldingUrl=afbeelding_url(media),
        breedte=media.breedte,
        hoogte=media.hoogte,
        bron=media.bron,
        bronUrl=media.bronUrl,
        iiifService=service,
        iiifManifest=f"{settings().api_basis_url}/jottem/{media.mediaId}/iiif/manifest" if service else None,
        publicatieDatum=media.publicatieDatum,
        wijzigingsDatum=media.wijzigingsDatum,
        uploaderNaam=uploader.naam if toon_uploader else None,
        uploaderAfbeeldingUrl=s3.presigned_get(
            uploader.afbeelding, bucket=settings().s3_bucket_thumbs)
        if toon_uploader and uploader.afbeelding else None,
        annotatiesUrl=anno.container_url_publiek(str(media.mediaId)) if gepubliceerd else None,
        canvas=canvas_iri(media) if gepubliceerd else None,
        verrijkingen=[
            VerrijkingUit(sleutel=v.sleutel, label=v.label, cta=v.cta,
                          motivation=v.motivation, doel=v.doel)
            for v in actieve_verrijkingen(project)
        ] if gepubliceerd else [],
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

    # content negotiation (data-architectuur): HTML voor mensen, RDF conform
    # schema.org AP NDE voor machines (JSON-LD, Turtle of RDF/XML)
    from .. import rdf
    from fastapi.responses import Response

    accept = request.headers.get("accept", "")
    if "text/turtle" in accept:
        return Response(rdf.serialiseer(rdf.jottem_jsonld(db, media), "turtle"),
                        media_type="text/turtle")
    if "application/rdf+xml" in accept:
        return Response(rdf.serialiseer(rdf.jottem_jsonld(db, media), "xml"),
                        media_type="application/rdf+xml")
    if "application/ld+json" in accept or "application/json" in accept:
        return JSONResponse(rdf.jottem_jsonld(db, media), media_type="application/ld+json")

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
    if not service and not (media.bron == "url" and media.breedte and media.hoogte):
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
        "rights": iiif_rights(media.licentie),
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
                    # uploads en beeldbank-bronnen dragen een image service (eigen
                    # Cantaloupe resp. de externe dienst); een kale foto-URL niet
                    "body": {
                        "id": f"{service}/full/max/0/default.jpg" if service else media.bronUrl,
                        "type": "Image",
                        "format": media.mimeType or "image/jpeg",
                        "width": media.breedte,
                        "height": media.hoogte,
                        **({"service": [{
                            "id": service,
                            "type": "ImageService3",
                            "profile": "level2",
                        }]} if service else {}),
                    },
                }],
            }],
            # webannotaties (verrijkingen) van deze jottem, live uit de annotatieserver
            "annotations": [{
                "id": f"{anno.container_url_publiek(str(media.mediaId))}?page=0",
                "type": "AnnotationPage",
            }],
        }],
    }
    manifest = {sleutel: waarde for sleutel, waarde in manifest.items() if waarde is not None}
    return JSONResponse(manifest, media_type="application/ld+json;profile=\"http://iiif.io/api/presentation/3/context.json\"")


@router.get("/jottem/{media_id}/annotations")
async def jottem_annotaties(media_id: uuid.UUID, db: Session = Depends(get_db)):
    """W3C AnnotationCollection van een jottem: doorverwijzing naar de container op de
    annotatieserver (conform openapi.yaml)."""
    media = db.get(Media, media_id)
    if not media or media.status != MediaStatus.goedgekeurd:
        raise HTTPException(404, "Jottem niet gepubliceerd")
    return RedirectResponse(anno.container_url_publiek(str(media_id)), status_code=303)


@router.get("/jottem/{media_id}/detail", response_model=JottemDetail)
async def jottem_detail(media_id: uuid.UUID, db: Session = Depends(get_db)):
    """Interne detailweergave voor de frontend (ook voor moderatie/preview)."""
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    return _detail(db, media)
