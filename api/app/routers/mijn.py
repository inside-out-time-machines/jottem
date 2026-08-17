"""Ingelogde-gebruiker-endpoints en publieke hulplijsten voor de frontend."""
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import s3
from ..auth import Principal, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, MediaStatus, Organisatie, Project, actieve_upload_wijzen
from ..schemas import AfbeeldingUploadVraag, JottemKort

router = APIRouter(tags=["Mijn"])


def _profiel(p: Principal) -> dict:
    return {
        "naam": p.gebruiker.naam,
        "publiekeId": str(p.gebruiker.publiekeId),   # creator-IRI-basis bij annotaties
        "email": p.gebruiker.email,
        "naamPubliek": p.gebruiker.naamPubliek,
        "attenderingen": p.gebruiker.attenderingen,
        "afbeeldingUrl": s3.presigned_get(p.gebruiker.afbeelding, bucket=settings().s3_bucket_thumbs)
                         if p.gebruiker.afbeelding else None,
        "rollen": p.rollen,
    }


@router.get("/mijn/profiel")
async def profiel(p: Principal = Depends(principal)):
    return _profiel(p)


@router.get("/attenderingen/uit")
async def attenderingen_uit(token: uuid.UUID, db: Session = Depends(get_db)):
    """Uitschakellink uit de attenderingsmails: werkt zonder inloggen, via het geheime
    mailToken (notificaties 10/11; zie ook de afleverbaarheidseisen in het design)."""
    gebruiker = db.scalar(select(Gebruiker).where(Gebruiker.mailToken == token))
    if not gebruiker:
        return {"melding": "Deze uitschakellink is niet (meer) geldig"}
    gebruiker.attenderingen = False
    db.commit()
    return {"melding": "Je ontvangt geen attenderingen meer; je kunt ze in je profiel weer aanzetten"}


class ProfielIn(BaseModel):
    naam: str | None = Field(default=None, min_length=1, max_length=200)
    naamPubliek: bool | None = None
    attenderingen: bool | None = None
    afbeelding: str | None = None    # S3-sleutel uit de profiel-afbeelding-upload


@router.put("/mijn/profiel")
async def profiel_bewerken(
    vraag: ProfielIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    gebruiker = db.get(Gebruiker, p.gebruiker.gebruikersId)
    naam_geraakt = (vraag.naam and vraag.naam != gebruiker.naam) or (
        vraag.naamPubliek is not None and vraag.naamPubliek != gebruiker.naamPubliek)
    if vraag.naam:
        gebruiker.naam = vraag.naam
    if vraag.naamPubliek is not None:
        gebruiker.naamPubliek = vraag.naamPubliek
    if vraag.attenderingen is not None:
        gebruiker.attenderingen = vraag.attenderingen
    if vraag.afbeelding is not None:
        gebruiker.afbeelding = vraag.afbeelding or None
    if naam_geraakt:
        # de worker werkt creator.name bij in alle annotaties van deze gebruiker (GE-2)
        from ..outbox import log
        log(db, "gebruiker-naam-gewijzigd", gebruikers_id=gebruiker.gebruikersId,
            payload={"publiekeId": str(gebruiker.publiekeId)})
    db.commit()
    p.gebruiker = gebruiker
    return _profiel(p)


@router.post("/mijn/profiel-afbeelding-upload")
async def profiel_afbeelding_upload(
    vraag: AfbeeldingUploadVraag,
    p: Principal = Depends(principal),
):
    # niet-raadbare sleutel (uuid4), losgekoppeld van het gebruikers-id
    extensie = vraag.bestandsnaam.rsplit(".", 1)[-1].lower() if "." in vraag.bestandsnaam else "jpg"
    object_key = f"profielen/{uuid.uuid4()}.{extensie}"
    return {
        "objectKey": object_key,
        "uploadUrl": s3.presigned_put(object_key, vraag.contentType, bucket=settings().s3_bucket_thumbs),
    }


@router.get("/mijn/jottems", response_model=list[JottemKort])
async def mijn_jottems(p: Principal = Depends(principal), db: Session = Depends(get_db)):
    basis = settings().publieke_basis_url
    return [
        JottemKort(
            mediaId=m.mediaId, titel=m.titel, status=m.status.value, genre=m.genre,
            creatieDatum=m.creatieDatum, afkeurReden=m.afkeurReden,
            duurzameUrl=f"{basis}/jottem/{m.mediaId}" if m.status == MediaStatus.goedgekeurd else None,
        )
        for m in db.scalars(
            select(Media).where(Media.uploaderId == p.gebruiker.gebruikersId)
            .order_by(Media.creatieDatum.desc())
        )
    ]


def _aantal_annotaties(db: Session, project_id) -> int:
    """Totaal aantal annotaties van een project (som van de AnnoRepo-containers),
    met korte Valkey-cache zodat de open-data-pagina de annotatieserver niet belast."""
    import redis

    from .. import anno
    valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)
    sleutel = f"annotaties:aantal:{project_id}"
    gecached = valkey.get(sleutel)
    if gecached is not None:
        return int(gecached)
    media_ids = db.scalars(
        select(Media.mediaId).where(Media.projectId == project_id,
                                    Media.status == MediaStatus.goedgekeurd)
    ).all()
    totaal = sum(len(anno.alle_annotaties(str(m))) for m in media_ids)
    valkey.setex(sleutel, 300, totaal)
    return totaal


@router.get("/deelnemers")
async def deelnemers(
    ids: str = Query(description="komma-gescheiden publiekeId's uit de creator-IRI's"),
    db: Session = Depends(get_db),
):
    """Publiek: naam en profielfoto bij de creator van een annotatie of reactie, zodat
    de jottempagina die naast een bijdrage kan tonen. Wie zijn naam niet publiek deelt,
    komt hier niet in voor (dan toont de pagina de anonieme weergave)."""
    gevraagd = []
    for waarde in ids.split(",")[:100]:
        waarde = waarde.strip().removeprefix("urn:uuid:")
        try:
            gevraagd.append(uuid.UUID(waarde))
        except ValueError:
            continue
    if not gevraagd:
        return []
    rijen = db.scalars(
        select(Gebruiker).where(Gebruiker.publiekeId.in_(gevraagd),
                                Gebruiker.naamPubliek.is_(True))
    ).all()
    return [
        {
            "publiekeId": str(g.publiekeId),
            "naam": g.naam,
            "afbeeldingUrl": s3.presigned_get(g.afbeelding, bucket=settings().s3_bucket_thumbs)
                             if g.afbeelding else None,
        }
        for g in rijen
    ]


@router.get("/organisaties")
async def organisaties(db: Session = Depends(get_db)):
    """Publiek: organisaties met huisstijl en actieve projecten (home, uploadformulier
    en de open-data-pagina op data.dev.iotm.nl)."""
    from sqlalchemy import func

    from .. import s3

    resultaat = []
    for organisatie in db.scalars(select(Organisatie).order_by(Organisatie.naam)):
        projecten = db.scalars(
            select(Project).where(Project.organisatieId == organisatie.organisatieId,
                                  Project.status == "actief")
        ).all()
        resultaat.append({
            "slug": organisatie.slug,
            "naam": organisatie.naam,
            "beschrijving": organisatie.beschrijving,
            "website": organisatie.website,
            "kleurPrimair": organisatie.kleurPrimair,
            "kleurSecundair": organisatie.kleurSecundair,
            # coördinaten van de organisatieplaats: startpunt van de kaartspeld
            "spatialLat": organisatie.spatialLat,
            "spatialLon": organisatie.spatialLon,
            "logoUrl": s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
                       if organisatie.logo else None,
            "faviconUrl": s3.presigned_get(organisatie.favicon, bucket=settings().s3_bucket_thumbs)
                          if organisatie.favicon else None,
            "projecten": [
                {"projectId": str(pr.projectId), "naam": pr.naam, "slug": pr.slug,
                 "oproep": pr.oproep, "datasetLicentie": pr.datasetLicentie,
                 "uploadWijzen": actieve_upload_wijzen(pr),
                 "aantalJottems": db.scalar(
                     select(func.count()).select_from(Media).where(
                         Media.projectId == pr.projectId,
                         Media.status == MediaStatus.goedgekeurd)) or 0,
                 "aantalAnnotaties": _aantal_annotaties(db, pr.projectId)}
                for pr in projecten
            ],
        })
    return resultaat
