"""Annotaties (verrijkingen): schrijven via de backend naar AnnoRepo, plus melden en
moderatie van meldingen.

De backend is de enige schrijfroute (AN-4, V-7): zij valideert de verrijking tegen de
projectinstellingen (V-1), bouwt de W3C-annotatie (creator, created, jottem:aard) en
bewaakt eigenaarschap. Elke mutatie gaat met volledige payload het Gebeurtenislog in
(versiegeschiedenis + outbox) en werkt Media.wijzigingsDatum bij.
"""
import re
import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import anno
from ..auth import Principal, eis_rol, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, MediaStatus, Melding, Project, Rol
from ..outbox import log
from ..schemas import HTTP_URL, MeldingBesluit, MeldingIn, MeldingUit
from .. import relaties
from ..verrijkingen import PER_SLEUTEL, REAGEREN_MOTIVATION, actieve_sleutels
from .jottem import canvas_iri

router = APIRouter(tags=["Annotaties"])

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)

ANONIEM = "Een deelnemer"


class Vlak(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(gt=0)
    h: int = Field(gt=0)


class Geo(BaseModel):
    lat: float = Field(ge=-90, le=90)                          # camerastandpunt
    lon: float = Field(ge=-180, le=180)
    richting: int | None = Field(default=None, ge=0, le=359)   # bearing in graden
    fov: int | None = Field(default=None, ge=1, le=179)        # beeldhoek in graden
    doelLat: float | None = Field(default=None, ge=-90, le=90)  # doelpunt (kijkdoel)
    doelLon: float | None = Field(default=None, ge=-180, le=180)


class AnnotatieIn(BaseModel):
    verrijking: str                      # sleutel uit de catalogus, of "reactie"
    tekst: str | None = Field(default=None, max_length=4000)
    aard: str | None = Field(default=None, pattern="^(herinnering|feit)$")  # V-4
    termUri: str | None = Field(default=None, max_length=500, pattern=HTTP_URL)
    termLabel: str | None = Field(default=None, max_length=200)
    bronUrl: str | None = Field(default=None, max_length=500, pattern=HTTP_URL)
    bronLabel: str | None = Field(default=None, max_length=200)
    jaarVan: str | None = Field(default=None, max_length=10)   # EDTF, bijv. 1973 of 196X
    jaarTot: str | None = Field(default=None, max_length=10)
    geo: Geo | None = None
    vlak: Vlak | None = None
    doelAnnotatie: str | None = None     # IRI, alleen bij verrijking == "reactie"


def _creator(gebruiker: Gebruiker) -> dict:
    return {
        "id": f"urn:uuid:{gebruiker.publiekeId}",
        "type": "Person",
        "name": gebruiker.naam if gebruiker.naamPubliek else ANONIEM,
    }


def _nu_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _bodies(invoer: AnnotatieIn, purpose: str) -> list[dict]:
    bodies: list[dict] = []
    if invoer.tekst:
        bodies.append({"type": "TextualBody", "value": invoer.tekst,
                       "format": "text/plain", "language": "nl", "purpose": purpose})
    if invoer.termUri:
        if invoer.termLabel:
            bodies.append({"type": "TextualBody", "value": invoer.termLabel,
                           "format": "text/plain", "purpose": purpose})
        bodies.append({"type": "SpecificResource", "source": invoer.termUri, "purpose": purpose})
    if invoer.bronUrl:
        if invoer.bronLabel:
            bodies.append({"type": "TextualBody", "value": invoer.bronLabel,
                           "format": "text/plain", "purpose": "describing"})
        bodies.append({"type": "SpecificResource", "source": invoer.bronUrl, "purpose": "linking"})
    return bodies


def _bouw_annotatie(media: Media, project: Project, gebruiker: Gebruiker,
                    invoer: AnnotatieIn) -> dict:
    """Vertaal de gestructureerde invoer naar een W3C-annotatie (vorm conform het
    verrijkingendocument); werpt 400 bij ontbrekende velden."""
    jottem_uri = f"{settings().publieke_basis_url}/jottem/{media.mediaId}"

    if invoer.verrijking == "reactie":
        if not invoer.doelAnnotatie or not invoer.tekst:
            raise HTTPException(400, "Een reactie heeft een doelannotatie en tekst nodig")
        basis = anno.container_url_publiek(str(media.mediaId))
        if not invoer.doelAnnotatie.startswith(basis):
            raise HTTPException(400, "De doelannotatie hoort niet bij deze jottem")
        return {
            "@context": anno.context(),
            "type": "Annotation",
            "motivation": REAGEREN_MOTIVATION,
            "target": invoer.doelAnnotatie,
            "body": _bodies(invoer, "replying"),
            "creator": _creator(gebruiker),
            "created": _nu_iso(),
            "generator": {"id": settings().publieke_basis_url, "type": "Software", "name": "Jottem"},
            "jottem:verrijking": "reactie",
        }

    verrijking = PER_SLEUTEL.get(invoer.verrijking)
    if not verrijking or invoer.verrijking not in actieve_sleutels(project):
        raise HTTPException(400, "Deze verrijking is niet ingeschakeld voor dit project")

    # doel: hele jottem of getekend vlak op het canvas
    if verrijking.doel == "vlak" or invoer.vlak:
        if not invoer.vlak:
            raise HTTPException(400, "Deze verrijking heeft een getekend vak nodig")
        target: dict | str = {
            "type": "SpecificResource",
            "source": canvas_iri(media),
            "selector": {
                "type": "FragmentSelector",
                "conformsTo": "http://www.w3.org/TR/media-frags/",
                "value": f"xywh=pixel:{invoer.vlak.x},{invoer.vlak.y},{invoer.vlak.w},{invoer.vlak.h}",
            },
        }
    else:
        target = jottem_uri

    annotatie: dict = {
        "@context": anno.context(),
        "type": "Annotation",
        "motivation": verrijking.motivation,
        "target": target,
        "creator": _creator(gebruiker),
        "created": _nu_iso(),
        "generator": {"id": settings().publieke_basis_url, "type": "Software", "name": "Jottem"},
        "jottem:verrijking": verrijking.sleutel,
    }

    if verrijking.sleutel == "herinnering":
        if not invoer.tekst:
            raise HTTPException(400, "Vertel eerst je herinnering of aanvulling")
        if not invoer.aard:
            raise HTTPException(400, "Geef aan: is dit een herinnering of een vaststaand feit? (jottem:aard)")
        annotatie["body"] = _bodies(invoer, "commenting")
        annotatie["jottem:aard"] = invoer.aard
    elif verrijking.sleutel == "vlak":
        if not (invoer.tekst or invoer.termUri):
            raise HTTPException(400, "Vertel wat er in het vak te zien is")
        annotatie["body"] = _bodies(invoer, "identifying")
    elif verrijking.sleutel == "tag":
        if not invoer.termUri:
            raise HTTPException(400, "Kies een term uit de lijst")
        annotatie["body"] = _bodies(invoer, "tagging")
    elif verrijking.sleutel == "vraag":
        if not invoer.tekst:
            raise HTTPException(400, "Typ eerst je vraag")
        annotatie["body"] = _bodies(invoer, "questioning")
    elif verrijking.sleutel == "bron":
        if not invoer.bronUrl:
            raise HTTPException(400, "Plak de link naar de bron")
        annotatie["body"] = _bodies(invoer, "linking")
    elif verrijking.sleutel == "periode":
        if not invoer.jaarVan:
            raise HTTPException(400, "Vul een jaartal in")
        for jaar in (invoer.jaarVan, invoer.jaarTot):
            if jaar and not re.fullmatch(r"[0-9X]{3,4}(-[0-9]{2})?", jaar):
                raise HTTPException(400, "Gebruik een jaartal zoals 1973 of 196X (EDTF)")
        edtf = invoer.jaarVan if not invoer.jaarTot else f"{invoer.jaarVan}/{invoer.jaarTot}"
        annotatie["body"] = [{"type": "TextualBody", "value": edtf,
                              "format": "text/plain", "purpose": "describing"}] + (
            _bodies(invoer, "describing") if invoer.tekst else [])
    elif verrijking.sleutel == "begrip":
        if not invoer.tekst:
            raise HTTPException(400, "Typ eerst je uitleg")
        annotatie["body"] = _bodies(invoer, "describing")
    elif verrijking.sleutel == "zichtveld":
        if not invoer.geo:
            raise HTTPException(400, "Zet eerst de camera op de kaart")
        # vorm conform het verrijkingendocument: Point (camera) + bearing/fov; het
        # doelpunt gaat mee in properties zodat de kaart bij herbewerken terugkomt
        eigenschappen: dict = {}
        if invoer.geo.richting is not None:
            eigenschappen["bearing"] = invoer.geo.richting
        if invoer.geo.fov is not None:
            eigenschappen["fov"] = invoer.geo.fov
        if invoer.geo.doelLat is not None and invoer.geo.doelLon is not None:
            eigenschappen["target"] = [invoer.geo.doelLon, invoer.geo.doelLat]
        geojson = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [invoer.geo.lon, invoer.geo.lat]},
            "properties": eigenschappen,
        }
        import json as _json
        annotatie["body"] = [{"type": "TextualBody", "value": _json.dumps(geojson),
                              "format": "application/geo+json", "purpose": "describing"}] + (
            _bodies(invoer, "describing") if invoer.tekst else [])
    elif invoer.verrijking == relaties.AARD:
        # deze verrijking levert geen annotatie op maar een nieuwe jottem plus een
        # koppeling; die ontstaat via de uploadflow, niet hier (V-9)
        raise HTTPException(400, "Deze verrijking loopt via het uploadformulier, "
                                 "niet via een annotatie")
    else:
        raise HTTPException(400, "Onbekende verrijking")
    return annotatie


def _media_gepubliceerd(db: Session, media_id: uuid.UUID) -> tuple[Media, Project]:
    media = db.get(Media, media_id)
    if not media or media.status != MediaStatus.goedgekeurd:
        raise HTTPException(404, "Jottem niet gepubliceerd")
    return media, db.get(Project, media.projectId)


def _log_annotatie(db: Session, type_: str, media: Media, gebruikers_id: int | None,
                   annotatie: dict, extra: dict | None = None) -> None:
    payload = {"annotatie": annotatie, "mediaId": str(media.mediaId)}
    if extra:
        payload.update(extra)
    log(db, type_, organisatie_id=media.organisatieId, project_id=media.projectId,
        gebruikers_id=gebruikers_id, payload=payload)
    media.wijzigingsDatum = datetime.now(timezone.utc)
    _valkey.delete(f"annotaties:project:{media.projectId}")


@router.post("/jottem/{media_id}/annotation", status_code=201)
def maak_annotatie(
    media_id: uuid.UUID,
    invoer: AnnotatieIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    media, project = _media_gepubliceerd(db, media_id)
    annotatie = _bouw_annotatie(media, project, p.gebruiker, invoer)
    opgeslagen = anno.maak_annotatie(str(media.mediaId), f"Annotaties bij {media.titel}", annotatie)

    extra: dict = {}
    if invoer.verrijking == "reactie":
        # de maker van de doelannotatie (voor attendering 11)
        doel = anno.haal_annotatie(invoer.doelAnnotatie)
        doel_creator = (doel.get("creator") or {}).get("id", "")
        if doel_creator.startswith("urn:uuid:"):
            doelgebruiker = db.scalar(select(Gebruiker).where(
                Gebruiker.publiekeId == uuid.UUID(doel_creator.removeprefix("urn:uuid:"))))
            if doelgebruiker:
                extra["doelGebruikersId"] = doelgebruiker.gebruikersId
    _log_annotatie(db, "annotatie-aangemaakt", media, p.gebruiker.gebruikersId,
                   opgeslagen, extra)
    db.commit()
    return opgeslagen


def _eis_maker(annotatie: dict, p: Principal) -> None:
    creator = (annotatie.get("creator") or {}).get("id", "")
    if creator != f"urn:uuid:{p.gebruiker.publiekeId}":
        raise HTTPException(403, "Alleen de maker kan deze annotatie aanpassen")


@router.put("/annotation/{media_id}/{naam}")
def wijzig_annotatie(
    media_id: uuid.UUID,
    naam: str,
    invoer: AnnotatieIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    media, project = _media_gepubliceerd(db, media_id)
    iri = anno.annotatie_iri(str(media_id), naam)
    bestaand = anno.haal_annotatie(iri)
    _eis_maker(bestaand, p)
    nieuw = _bouw_annotatie(media, project, p.gebruiker, invoer)
    nieuw["created"] = bestaand.get("created", nieuw["created"])
    nieuw["modified"] = _nu_iso()
    opgeslagen = anno.vervang_annotatie(iri, nieuw)
    _log_annotatie(db, "annotatie-gewijzigd", media, p.gebruiker.gebruikersId, opgeslagen)
    db.commit()
    return opgeslagen


@router.delete("/annotation/{media_id}/{naam}", status_code=204)
def verwijder_annotatie(
    media_id: uuid.UUID,
    naam: str,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    media, _ = _media_gepubliceerd(db, media_id)
    iri = anno.annotatie_iri(str(media_id), naam)
    bestaand = anno.haal_annotatie(iri)
    _eis_maker(bestaand, p)
    anno.verwijder_annotatie(iri)
    _log_annotatie(db, "annotatie-verwijderd", media, p.gebruiker.gebruikersId, bestaand)
    db.commit()


# ---------- melden (BE-7: ook zonder account) en moderatie (MO-6) ----------

def _rate_limit(request: Request) -> None:
    """Meldingen: 2 req/s met burst 5 (systeemarchitectuur), per IP via Valkey.

    Het adres komt van de verbinding zelf (Traefik als enige proxy ervoor), niet uit
    X-Forwarded-For: die header stuurt de client mee en met een willekeurige waarde per
    verzoek was de limiet in één regel te omzeilen.
    """
    ip = request.client.host if request.client else "?"
    sleutel = f"melding-rate:{ip}"
    teller = _valkey.incr(sleutel)
    if teller == 1:
        _valkey.expire(sleutel, 5)
    if teller > 10:  # 5 seconden x 2 req/s, met de burst als marge
        raise HTTPException(429, "Te veel meldingen; probeer het zo weer",
                            headers={"Retry-After": "5"})


@router.post("/annotation/{media_id}/{naam}/melding", status_code=201)
def meld_annotatie(
    media_id: uuid.UUID,
    naam: str,
    invoer: MeldingIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """Rapporteer een annotatie of reactie; werkt zonder account (BE-7)."""
    _rate_limit(request)
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(404, "Jottem onbekend")
    iri = anno.annotatie_iri(str(media_id), naam)
    anno.haal_annotatie(iri)  # 404 als de annotatie niet bestaat
    melding = Melding(mediaId=media_id, annotatieIri=iri,
                      reden=invoer.reden, toelichting=invoer.toelichting)
    db.add(melding)
    log(db, "annotatie-gemeld", organisatie_id=media.organisatieId,
        project_id=media.projectId, payload={"annotatieIri": iri, "reden": invoer.reden})
    db.commit()
    return {"melding": "Bedankt, we hebben je melding ontvangen; een moderator kijkt ernaar"}


@router.get("/organisatie/{slug}/meldingen", response_model=list[MeldingUit])
def meldingen(
    slug: str,
    p: Principal = Depends(eis_rol(Rol.moderator)),
    db: Session = Depends(get_db),
):
    from ..models import Organisatie
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    if not p.heeft_rol(Rol.moderator, organisatie.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    rijen = db.scalars(
        select(Melding).join(Media, Melding.mediaId == Media.mediaId)
        .where(Media.organisatieId == organisatie.organisatieId)
        .order_by(Melding.creatieDatum.desc())
    ).all()
    uit: list[MeldingUit] = []
    for m in rijen:
        inhoud = None
        if m.status == "nieuw":
            try:
                inhoud = anno.haal_annotatie(m.annotatieIri)
            except HTTPException:
                inhoud = None
        uit.append(MeldingUit(
            meldingId=m.meldingId, mediaId=m.mediaId, annotatieIri=m.annotatieIri,
            reden=m.reden, toelichting=m.toelichting, status=m.status,
            creatieDatum=m.creatieDatum, annotatie=inhoud,
        ))
    return uit


@router.put("/melding/{melding_id}", response_model=MeldingUit)
def handel_melding_af(
    melding_id: int,
    besluit: MeldingBesluit,
    p: Principal = Depends(eis_rol(Rol.moderator)),
    db: Session = Depends(get_db),
):
    melding = db.get(Melding, melding_id)
    if not melding:
        raise HTTPException(404, "Melding onbekend")
    media = db.get(Media, melding.mediaId)
    if not p.heeft_rol(Rol.moderator, media.organisatieId):
        raise HTTPException(403, "Geen moderator van deze organisatie")
    if melding.status != "nieuw":
        raise HTTPException(409, "Melding is al afgehandeld")

    inhoud = None
    if besluit.besluit in ("verwijderd", "verborgen"):
        # verbergen en verwijderen betekenen beide: uit de publieke container halen;
        # de volledige inhoud blijft herstelbaar in het Gebeurtenislog
        try:
            inhoud = anno.haal_annotatie(melding.annotatieIri)
            anno.verwijder_annotatie(melding.annotatieIri)
        except HTTPException:
            inhoud = None  # al weg; besluit blijft geldig
    melding.status = besluit.besluit
    melding.afhandelDatum = datetime.now(timezone.utc)
    _log_annotatie(db, f"annotatie-melding-{besluit.besluit}", media,
                   p.gebruiker.gebruikersId,
                   inhoud or {"id": melding.annotatieIri},
                   {"meldingId": melding.meldingId, "toelichting": besluit.toelichting})
    db.commit()
    return MeldingUit(
        meldingId=melding.meldingId, mediaId=melding.mediaId,
        annotatieIri=melding.annotatieIri, reden=melding.reden,
        toelichting=melding.toelichting, status=melding.status,
        creatieDatum=melding.creatieDatum,
    )
