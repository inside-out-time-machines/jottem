"""Ingelogde-gebruiker-endpoints en publieke hulplijsten voor de frontend."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import Principal, principal
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project
from ..schemas import JottemKort

router = APIRouter(tags=["Mijn"])


@router.get("/mijn/profiel")
async def profiel(p: Principal = Depends(principal)):
    return {
        "naam": p.gebruiker.naam,
        "email": p.gebruiker.email,
        "naamPubliek": p.gebruiker.naamPubliek,
        "attenderingen": p.gebruiker.attenderingen,
        "rollen": p.rollen,
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
