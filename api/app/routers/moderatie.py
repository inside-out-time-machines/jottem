"""Moderatie: wachtrij, goed-/afkeuren (reden verplicht), herindienen door de uploader.

Bij goedkeuring krijgt de jottem een duurzame link en gaat de goedgekeurd-mail via de
outbox; bij afkeuring de afgekeurd-mail met reden en herindien-link (notificaties 3 en 4).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import Principal, eis_rol, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, MediaStatus, Organisatie, Rol
from ..outbox import log
from ..schemas import JottemKort, ModeratieBesluit

router = APIRouter(tags=["Moderatie"])

# de wachtrij laadde alles; bij een actief project loopt dat op tot duizenden rijen
PAGINA_GROOTTE = 50


def duurzame_url(media_id: uuid.UUID) -> str:
    return f"{settings().publieke_basis_url}/jottem/{media_id}"


@router.get("/organisatie/{slug}/moderatie/jottems", response_model=list[JottemKort])
def wachtrij(
    slug: str,
    status: MediaStatus | None = None,
    pagina: int = Query(default=1, ge=1),
    p: Principal = Depends(eis_rol(Rol.moderator)),
    db: Session = Depends(get_db),
):
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    if not p.heeft_rol(Rol.moderator, organisatie.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    vraag = select(Media).where(Media.organisatieId == organisatie.organisatieId)
    if status:
        vraag = vraag.where(Media.status == status)
    return [
        JottemKort(
            mediaId=m.mediaId, titel=m.titel, status=m.status.value, genre=m.genre,
            creatieDatum=m.creatieDatum, afkeurReden=m.afkeurReden,
            duurzameUrl=duurzame_url(m.mediaId) if m.status == MediaStatus.goedgekeurd else None,
            herkenbaar=m.herkenbaar, toestemming=m.toestemming.value,
        )
        for m in db.scalars(vraag.order_by(Media.creatieDatum)
                            .offset((pagina - 1) * PAGINA_GROOTTE).limit(PAGINA_GROOTTE))
    ]


@router.delete("/jottem/{media_id}/publicatie", status_code=200)
def depubliceren(
    media_id: uuid.UUID,
    p: Principal = Depends(eis_rol(Rol.moderator)),
    db: Session = Depends(get_db),
):
    """Een gepubliceerde jottem terugtrekken (verwijderverzoek, portretrecht, bezwaar).

    Tot nu toe bestond `gedepubliceerd` alleen als status: de 410-tombstone en de
    `Delete`-tak van de Change Discovery waren onbereikbaar omdat niets die status ooit
    zette. Deze route sluit dat gat, zodat een honorering van een bezwaar ook echt door de
    open data heen loopt.
    """
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    if not p.heeft_rol(Rol.moderator, media.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    if media.status != MediaStatus.goedgekeurd:
        raise HTTPException(409, "Alleen een gepubliceerde jottem kan worden gedepubliceerd")
    media.status = MediaStatus.gedepubliceerd
    log(db, "jottem.gedepubliceerd",
        organisatie_id=media.organisatieId, project_id=media.projectId,
        gebruikers_id=p.gebruiker.gebruikersId,
        payload={"mediaId": str(media.mediaId)})
    db.commit()
    return {"status": media.status.value}


@router.put("/jottem/{media_id}/status")
def beoordelen(
    media_id: uuid.UUID,
    besluit: ModeratieBesluit,
    p: Principal = Depends(eis_rol(Rol.moderator)),
    db: Session = Depends(get_db),
):
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    if not p.heeft_rol(Rol.moderator, media.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    if media.status not in (MediaStatus.nieuw,):
        raise HTTPException(409, f"Jottem heeft status '{media.status.value}', alleen 'nieuw' is te beoordelen")

    uploader = db.get(Gebruiker, media.uploaderId)
    if besluit.besluit == "afgekeurd":
        if not besluit.reden:
            raise HTTPException(422, "Afkeuren zonder reden is niet mogelijk")
        media.status = MediaStatus.afgekeurd
        media.afkeurReden = besluit.reden
        log(db, "jottem.afgekeurd",
            organisatie_id=media.organisatieId, project_id=media.projectId,
            gebruikers_id=p.gebruiker.gebruikersId,
            payload={"mediaId": str(media.mediaId), "reden": besluit.reden,
                     "mail": {"template": "jottem-afgekeurd", "aan": uploader.email,
                              "context": {"ontvangerNaam": uploader.naam,
                                          "jottemTitel": media.titel,
                                          "afkeurReden": besluit.reden,
                                          "herindienUrl": f"{settings().publieke_basis_url}/mijn/jottems"}}})
    else:
        media.status = MediaStatus.goedgekeurd
        media.afkeurReden = None
        media.publicatieDatum = media.wijzigingsDatum
        log(db, "jottem.goedgekeurd",
            organisatie_id=media.organisatieId, project_id=media.projectId,
            gebruikers_id=p.gebruiker.gebruikersId,
            payload={"mediaId": str(media.mediaId),
                     "mail": {"template": "jottem-goedgekeurd", "aan": uploader.email,
                              "context": {"ontvangerNaam": uploader.naam,
                                          "jottemTitel": media.titel,
                                          "jottemUrl": duurzame_url(media.mediaId)}}})
    db.commit()
    return {"mediaId": str(media.mediaId), "status": media.status.value,
            "duurzameUrl": duurzame_url(media.mediaId) if media.status == MediaStatus.goedgekeurd else None}


@router.put("/jottem/{media_id}")
def herindienen(
    media_id: uuid.UUID,
    p: Principal = Depends(principal),   # de uploader zelf, geen moderatierol nodig
    db: Session = Depends(get_db),
    titel: str | None = None,
    beschrijving: str | None = None,
):
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    if media.uploaderId != p.gebruiker.gebruikersId:
        raise HTTPException(403, "Alleen je eigen jottems")
    if media.status != MediaStatus.afgekeurd:
        raise HTTPException(409, "Alleen een afgekeurde jottem kan opnieuw worden ingediend")
    if titel:
        media.titel = titel
    if beschrijving is not None:
        media.beschrijving = beschrijving
    media.status = MediaStatus.nieuw
    media.afkeurReden = None
    log(db, "jottem.heringediend",
        organisatie_id=media.organisatieId, project_id=media.projectId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"mediaId": str(media.mediaId)})
    db.commit()
    return {"mediaId": str(media.mediaId), "status": media.status.value}
