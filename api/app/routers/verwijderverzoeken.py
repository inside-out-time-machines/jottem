"""Verwijderverzoeken: indienen (publiek, BE-4) en afhandelen (moderator, MO-5).

Een bezoeker, inzender of afgebeelde persoon dient een verzoek in bij een gepubliceerde
jottem; de indiener krijgt mail 6, de moderatoren van de organisatie mail 7. De moderator
kiest depubliceren (origineel blijft als archiefexemplaar), wissen (alles weg, op de
wislijst, zie app/wissen.py) of afwijzen met een toelichting; de indiener krijgt mail 8.
De wettelijke termijn is 30 dagen (niet-functionele requirements).
"""
import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import wissen
from ..auth import Principal, eis_rol
from ..config import settings
from ..db import get_db
from ..models import (Gebruiker, GebruikerRol, Media, MediaStatus, Organisatie, Rol,
                      Verwijderverzoek)
from ..outbox import log
from ..schemas import VerwijderverzoekBesluit, VerwijderverzoekIn, VerwijderverzoekUit
from .moderatie import depubliceer

router = APIRouter(tags=["Verwijderverzoeken"])

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)

TERMIJN_DAGEN = 30


def _rate_limit(request: Request) -> None:
    """Zelfde maat als bij meldingen: per IP via Valkey, adres van de verbinding zelf."""
    ip = request.client.host if request.client else "?"
    sleutel = f"verwijderverzoek-rate:{ip}"
    teller = _valkey.incr(sleutel)
    if teller == 1:
        _valkey.expire(sleutel, 60)
    if teller > 5:
        raise HTTPException(429, "Te veel verzoeken; probeer het over een minuut opnieuw",
                            headers={"Retry-After": "60"})


def _uit(v: Verwijderverzoek, titel: str) -> VerwijderverzoekUit:
    return VerwijderverzoekUit(
        verzoekId=v.verzoekId, mediaId=v.mediaId, jottemTitel=titel, soort=v.soort,
        reden=v.reden, email=v.email, status=v.status, toelichting=v.toelichting,
        creatieDatum=v.creatieDatum, afhandelDatum=v.afhandelDatum,
    )


@router.post("/verwijderverzoek", status_code=201)
def dien_in(invoer: VerwijderverzoekIn, request: Request, db: Session = Depends(get_db)):
    """Verzoek om verwijdering van een gepubliceerde jottem; werkt zonder account."""
    _rate_limit(request)
    media = db.get(Media, invoer.jottemId)
    if not media or media.status != MediaStatus.goedgekeurd:
        raise HTTPException(404, "Jottem niet gepubliceerd")
    verzoek = Verwijderverzoek(mediaId=media.mediaId, soort=invoer.soort,
                               reden=invoer.reden.strip(), email=invoer.email.strip())
    db.add(verzoek)
    db.flush()
    basis = {"jottemTitel": media.titel, "verzoekNummer": verzoek.verzoekId,
             "termijnDagen": TERMIJN_DAGEN}
    # mail 6: ontvangstbevestiging aan de indiener
    log(db, "verwijderverzoek.ingediend", organisatie_id=media.organisatieId,
        project_id=media.projectId,
        payload={"mediaId": str(media.mediaId), "verzoekId": verzoek.verzoekId,
                 "soort": invoer.soort,
                 "mail": {"template": "verwijderverzoek-bevestiging", "aan": verzoek.email,
                          "context": basis}})
    # mail 7: directe melding aan elke moderator van de organisatie (juridische termijn loopt)
    moderatoren = db.scalars(
        select(Gebruiker).join(GebruikerRol, GebruikerRol.gebruikersId == Gebruiker.gebruikersId)
        .where(GebruikerRol.organisatieId == media.organisatieId,
               GebruikerRol.rol == Rol.moderator)
    ).all()
    for moderator in moderatoren:
        if not moderator.email:
            continue
        log(db, "verwijderverzoek.melding", organisatie_id=media.organisatieId,
            project_id=media.projectId,
            payload={"mediaId": str(media.mediaId), "verzoekId": verzoek.verzoekId,
                     "mail": {"template": "verwijderverzoek-melding", "aan": moderator.email,
                              "context": basis | {
                                  "ontvangerNaam": moderator.naam,
                                  "reden": verzoek.reden,
                                  "afhandelUrl": f"{settings().publieke_basis_url}/moderatie#verwijderverzoeken",
                              }}})
    db.commit()
    return {"verzoekNummer": verzoek.verzoekId,
            "melding": f"Je verzoek is ontvangen (kenmerk {verzoek.verzoekId}). Je krijgt "
                       f"binnen {TERMIJN_DAGEN} dagen per e-mail de uitkomst."}


@router.get("/organisatie/{slug}/verwijderverzoeken", response_model=list[VerwijderverzoekUit])
def overzicht(slug: str, p: Principal = Depends(eis_rol(Rol.moderator)),
              db: Session = Depends(get_db)):
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    if not p.heeft_rol(Rol.moderator, organisatie.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    rijen = db.execute(
        select(Verwijderverzoek, Media.titel)
        .join(Media, Verwijderverzoek.mediaId == Media.mediaId)
        .where(Media.organisatieId == organisatie.organisatieId)
        .order_by((Verwijderverzoek.status != "open"), Verwijderverzoek.creatieDatum)
    ).all()
    return [_uit(v, titel) for v, titel in rijen]


@router.put("/verwijderverzoek/{verzoek_id}", response_model=VerwijderverzoekUit)
def handel_af(verzoek_id: int, besluit: VerwijderverzoekBesluit,
              p: Principal = Depends(eis_rol(Rol.moderator)), db: Session = Depends(get_db)):
    verzoek = db.get(Verwijderverzoek, verzoek_id)
    if not verzoek:
        raise HTTPException(404, "Verzoek onbekend")
    media = db.get(Media, verzoek.mediaId)
    if not p.heeft_rol(Rol.moderator, media.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    if verzoek.status != "open":
        raise HTTPException(409, "Verzoek is al afgehandeld")
    if besluit.besluit == "afgewezen" and not (besluit.toelichting or "").strip():
        raise HTTPException(422, "Afwijzen kan alleen met een toelichting")

    titel = media.titel   # vóór het wissen, voor de uitkomstmail
    if besluit.besluit in ("depubliceren", "wissen") and media.status == MediaStatus.goedgekeurd:
        depubliceer(db, media, p.gebruiker.gebruikersId)
    if besluit.besluit == "wissen":
        wissen.wis_database(db, media)

    verzoek.status = {"depubliceren": "gedepubliceerd", "wissen": "gewist"}.get(
        besluit.besluit, "afgewezen")
    verzoek.toelichting = besluit.toelichting
    verzoek.afhandelDatum = datetime.now(timezone.utc)
    # mail 8: de uitkomst aan de indiener; depubliceren en wissen zijn beide "gehonoreerd"
    log(db, "verwijderverzoek.afgehandeld", organisatie_id=media.organisatieId,
        project_id=media.projectId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"mediaId": str(media.mediaId), "verzoekId": verzoek.verzoekId,
                 "besluit": besluit.besluit,
                 "mail": {"template": "verwijderverzoek-uitkomst", "aan": verzoek.email,
                          "context": {"jottemTitel": titel,
                                      "verzoekNummer": verzoek.verzoekId,
                                      "uitkomst": "afgewezen" if besluit.besluit == "afgewezen"
                                                  else "gehonoreerd",
                                      "toelichting": besluit.toelichting or ""}}})
    if besluit.besluit == "wissen":
        # als laatste gelogd: de worker verwerkt in volgorde, dus de mailregels hierboven
        # zijn dan al verstuurd en kan hij hun payloads meteen inkorten
        log(db, "jottem.gewist", organisatie_id=media.organisatieId,
            project_id=media.projectId, gebruikers_id=p.gebruiker.gebruikersId,
            payload={"mediaId": str(media.mediaId), "verzoekId": verzoek.verzoekId})
    db.commit()
    return _uit(verzoek, media.titel)
