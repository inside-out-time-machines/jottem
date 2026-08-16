"""Ingelogde-gebruiker-endpoints en publieke hulplijsten voor de frontend."""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import s3
from ..auth import Principal, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, MediaStatus, Organisatie, Project
from ..schemas import AfbeeldingUploadVraag, JottemKort

router = APIRouter(tags=["Mijn"])


def _profiel(p: Principal) -> dict:
    return {
        "naam": p.gebruiker.naam,
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
    if vraag.naam:
        gebruiker.naam = vraag.naam
    if vraag.naamPubliek is not None:
        gebruiker.naamPubliek = vraag.naamPubliek
    if vraag.attenderingen is not None:
        gebruiker.attenderingen = vraag.attenderingen
    if vraag.afbeelding is not None:
        gebruiker.afbeelding = vraag.afbeelding or None
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


@router.get("/organisaties")
async def organisaties(db: Session = Depends(get_db)):
    """Publiek: organisaties met huisstijl en actieve projecten (home en uploadformulier)."""
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
            "logoUrl": s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs)
                       if organisatie.logo else None,
            "projecten": [
                {"projectId": str(pr.projectId), "naam": pr.naam, "slug": pr.slug,
                 "oproep": pr.oproep, "datasetLicentie": pr.datasetLicentie}
                for pr in projecten
            ],
        })
    return resultaat
