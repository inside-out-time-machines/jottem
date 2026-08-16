"""Uploadflow: presigned PUT naar de originals-bucket, daarna indienen met metadata.

MVP-scope conform requirements: JPG/PNG/TIFF tot 50 MB, projectkeuze verplicht,
licentiebevestiging (projectlicentie wordt op de jottem vastgelegd), locatie als
speld (lat/lon in metadata). De Herkenbaar-check wordt in een volgende iteratie
aangesloten; het datamodel (herkenbaar/toestemming) staat er al voor klaar.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import s3
from ..auth import Principal, principal
from ..db import get_db
from ..models import Media, MediaMetadata, MediaStatus, Project, Toestemming
from ..outbox import log
from ..schemas import TOEGESTANE_TYPES, JottemIndienen, UploadUrlAntwoord, UploadUrlVraag

router = APIRouter(tags=["Uploaden"])


@router.post("/upload-url", response_model=UploadUrlAntwoord)
async def upload_url(vraag: UploadUrlVraag, p: Principal = Depends(principal)):
    if vraag.contentType not in TOEGESTANE_TYPES:
        raise HTTPException(415, "Alleen JPG, PNG of TIFF (PDF en audio volgen in fase 2)")
    media_id = uuid.uuid4()
    extensie = vraag.bestandsnaam.rsplit(".", 1)[-1].lower() if "." in vraag.bestandsnaam else "bin"
    object_key = f"{media_id}/origineel.{extensie}"
    return UploadUrlAntwoord(
        mediaId=media_id,
        uploadUrl=s3.presigned_put(object_key, vraag.contentType),
        objectKey=object_key,
    )


@router.post("/jottem", status_code=201)
async def jottem_indienen(
    vraag: JottemIndienen,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project = db.get(Project, vraag.projectId)
    if not project:
        raise HTTPException(404, "Project onbekend; de projectkeuze is verplicht")
    if not vraag.licentieBevestigd:
        raise HTTPException(422, "Bevestig de licentie van het project")
    object_key = f"{vraag.mediaId}/"
    # het bestand moet al geupload zijn via de presigned URL
    sleutels = s3.intern().list_objects_v2(
        Bucket=s3.settings().s3_bucket_originals, Prefix=str(vraag.mediaId) + "/"
    )
    inhoud = sleutels.get("Contents") or []
    if not inhoud:
        raise HTTPException(409, "Bestand niet gevonden; upload eerst via de upload-URL")
    object_key = inhoud[0]["Key"]

    toestemming = Toestemming.nvt
    if vraag.toestemming in ("ja", "nee"):
        toestemming = Toestemming(vraag.toestemming)

    media = Media(
        mediaId=vraag.mediaId,
        organisatieId=project.organisatieId,
        projectId=project.projectId,
        uploaderId=p.gebruiker.gebruikersId,
        titel=vraag.titel,
        beschrijving=vraag.beschrijving,
        genre=vraag.genre,
        licentie=project.datasetLicentie,   # bevestigde projectlicentie
        objectKey=object_key,
        status=MediaStatus.nieuw,
        toestemming=toestemming,
    )
    db.add(media)
    for veld, waarde in vraag.metadata.items():
        db.add(MediaMetadata(mediaId=media.mediaId, veld=veld, waarde=waarde))
    for woord in vraag.steekwoorden:
        db.add(MediaMetadata(mediaId=media.mediaId, veld="steekwoord", waarde=woord))
    log(db, "jottem.ingediend",
        organisatie_id=project.organisatieId, project_id=project.projectId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"mediaId": str(media.mediaId)})
    db.commit()
    return {"mediaId": str(media.mediaId), "status": media.status.value}
