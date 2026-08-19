"""Uploadflow: presigned PUT naar de originals-bucket, daarna indienen met metadata.

MVP-scope conform requirements: JPG/PNG/TIFF tot 50 MB, projectkeuze verplicht,
licentiebevestiging (projectlicentie wordt op de jottem vastgelegd), locatie als
speld (lat/lon in metadata). De Herkenbaar-check draait synchroon bij het indienen en
legt het signaal plus de toestemmingsverklaring vast op de jottem.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bronnen, herkenbaar, s3
from ..auth import Principal, principal
from ..db import get_db
from ..models import Media, MediaMetadata, MediaStatus, Project, Toestemming, actieve_upload_wijzen
from ..outbox import log
from ..schemas import (
    TOEGESTANE_TYPES, ExterneBronVraag, HerkenbaarCheckAntwoord, HerkenbaarCheckVraag,
    JottemIndienen, UploadUrlAntwoord, UploadUrlVraag,
)

router = APIRouter(tags=["Uploaden"])


def _object_key_voor(media_id: uuid.UUID) -> str | None:
    inhoud = s3.intern().list_objects_v2(
        Bucket=s3.settings().s3_bucket_originals, Prefix=f"{media_id}/"
    ).get("Contents") or []
    return inhoud[0]["Key"] if inhoud else None


@router.post("/upload-url", response_model=UploadUrlAntwoord)
async def upload_url(vraag: UploadUrlVraag, p: Principal = Depends(principal)):
    if vraag.contentType not in TOEGESTANE_TYPES:
        raise HTTPException(415, "Alleen JPG, PNG of TIFF (PDF en audio volgen in fase 2)")
    media_id = uuid.uuid4()
    extensie = s3.extensie_voor(vraag.contentType)
    object_key = f"{media_id}/origineel.{extensie}"
    return UploadUrlAntwoord(
        mediaId=media_id,
        uploadUrl=s3.presigned_put(object_key, vraag.contentType),
        objectKey=object_key,
    )


@router.post("/upload/externe-bron")
async def externe_bron(vraag: ExterneBronVraag, p: Principal = Depends(principal)):
    """Valideer een beeldbank-permalink (IIIF) of foto-URL en geef terug wat er
    opgeslagen en getoond gaat worden (voor de popup in het uploadformulier)."""
    resultaat = bronnen.resolve(vraag.soort, vraag.url)
    return {
        "bron": resultaat.bron,
        "bronUrl": resultaat.bronUrl,
        "previewUrl": resultaat.previewUrl,
        "service": resultaat.service,
        "breedte": resultaat.breedte,
        "hoogte": resultaat.hoogte,
    }


@router.post("/herkenbaar-check", response_model=HerkenbaarCheckAntwoord)
async def herkenbaar_check(vraag: HerkenbaarCheckVraag, p: Principal = Depends(principal)):
    """Directe controle op herkenbare personen, na de upload en vóór het indienen
    (Herkenbaar API); bij "ja" vraagt de frontend om de toestemmingsverklaring."""
    object_key = _object_key_voor(vraag.mediaId)
    if not object_key:
        raise HTTPException(409, "Bestand niet gevonden; upload eerst via de upload-URL")
    gevonden, score = herkenbaar.check_object(object_key)
    return HerkenbaarCheckAntwoord(herkenbaar=gevonden, betrouwbaarheid=score)


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

    # de organisatiebeheerder bepaalt per project welke uploadwijzen aan staan; een
    # cameraopname komt als gewoon bestand binnen, dus bestand en camera tellen hier
    # samen als de bestandsroute
    wijzen = actieve_upload_wijzen(project)
    if vraag.externeBron:
        toegestaan = vraag.externeBron.soort in wijzen   # "beeldbank" of "url"
    else:
        toegestaan = "bestand" in wijzen or "camera" in wijzen
    if not toegestaan:
        raise HTTPException(422, "Deze manier van aanleveren staat in dit project niet aan")

    externe = None
    object_key = None
    if vraag.externeBron:
        # externe bron: de resolver draait hier opnieuw (gezaghebbend; wat de popup
        # eerder toonde wordt niet vertrouwd) en er wordt alleen verwezen
        externe = bronnen.resolve(vraag.externeBron.soort, vraag.externeBron.url)
    else:
        # het bestand moet al geupload zijn via de presigned URL
        object_key = _object_key_voor(vraag.mediaId)
        if not object_key:
            raise HTTPException(409, "Bestand niet gevonden; upload eerst via de upload-URL")

    # gezaghebbende Herkenbaar-check op de server (de frontend-check is alleen UX):
    # bij herkenbare personen is een expliciete keuze van de uploader verplicht
    if externe:
        beeld = bronnen.haal_beeld_bytes(externe)
        gevonden, score = herkenbaar.check_bytes(beeld) if beeld else (None, None)
    else:
        gevonden, score = herkenbaar.check_object(object_key)
    toestemming = Toestemming.nvt
    if gevonden:
        if vraag.toestemming not in ("ja", "nee"):
            raise HTTPException(
                422,
                "Er zijn mogelijk herkenbare personen gedetecteerd; geef aan of je hun "
                "toestemming hebt (toestemming: ja of nee)",
            )
        toestemming = Toestemming(vraag.toestemming)
    elif vraag.toestemming in ("ja", "nee"):
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
        bron=externe.bron if externe else "upload",
        bronUrl=externe.bronUrl if externe else None,
        externeIiifService=externe.service if externe else None,
        objectKey=object_key,
        mimeType=externe.mimeType if externe else None,
        breedte=externe.breedte if externe else None,
        hoogte=externe.hoogte if externe else None,
        status=MediaStatus.nieuw,
        herkenbaar=gevonden,
        herkenbaarScore=score,
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
