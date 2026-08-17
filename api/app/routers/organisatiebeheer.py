"""Platform- en organisatiebeheer (PB-2/PB-3 en de uitnodigingsflow uit OB-1).

Platformbeheerders definiëren organisatiejottems (met huisstijl, automatisch een eerste
project) en nodigen organisatiebeheerders uit; organisatiebeheerders nodigen moderatoren
uit voor hun eigen organisatie. Uitnodigingen volgen het klaarzetpatroon: Gebruiker-rij
zonder sub, rol klaargezet, koppeling op e-mailadres bij de eerste OIDC-login.
"""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import s3
from ..auth import Principal, eis_rol, invalideer_rollen_cache, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, GebruikerRol, Organisatie, Project, Rol
from ..outbox import log
from ..schemas import (
    GebruikerRolUit, HuisstijlUploadVraag, OrganisatieIn, OrganisatieUit, UitnodigingIn,
)

router = APIRouter(tags=["Organisatiebeheer"])


def _uit(organisatie: Organisatie) -> OrganisatieUit:
    return OrganisatieUit(
        organisatieId=organisatie.organisatieId,
        naam=organisatie.naam,
        slug=organisatie.slug,
        beschrijving=organisatie.beschrijving,
        website=organisatie.website,
        email=organisatie.email,
        kleurPrimair=organisatie.kleurPrimair,
        kleurSecundair=organisatie.kleurSecundair,
        kleurAchtergrond=organisatie.kleurAchtergrond,
        logo=organisatie.logo,
        favicon=organisatie.favicon,
        logoUrl=s3.presigned_get(organisatie.logo, bucket=settings().s3_bucket_thumbs) if organisatie.logo else None,
        faviconUrl=s3.presigned_get(organisatie.favicon, bucket=settings().s3_bucket_thumbs) if organisatie.favicon else None,
    )


def _organisatie(db: Session, slug: str) -> Organisatie:
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    return organisatie


@router.get("/organisatie", response_model=list[OrganisatieUit])
async def organisaties_beheer(
    p: Principal = Depends(eis_rol(Rol.platformbeheerder)),
    db: Session = Depends(get_db),
):
    return [_uit(o) for o in db.scalars(select(Organisatie).order_by(Organisatie.naam))]


@router.post("/organisatie", response_model=OrganisatieUit, status_code=201)
async def organisatie_aanmaken(
    vraag: OrganisatieIn,
    p: Principal = Depends(eis_rol(Rol.platformbeheerder)),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Organisatie).where(Organisatie.slug == vraag.slug)):
        raise HTTPException(409, "Er bestaat al een organisatie met deze slug")
    organisatie = Organisatie(**vraag.model_dump())
    db.add(organisatie)
    db.flush()
    # PB-2: bij het aanmaken ontstaat automatisch een eerste project
    db.add(Project(
        organisatieId=organisatie.organisatieId,
        naam=f"Eerste project van {organisatie.naam}",
        slug="eerste-project",
        beschrijving="Automatisch aangemaakt bij de organisatie; pas dit project aan of maak nieuwe projecten.",
        status="actief",
    ))
    log(db, "organisatie.aangemaakt", organisatie_id=organisatie.organisatieId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"slug": organisatie.slug})
    db.commit()
    return _uit(organisatie)


@router.put("/organisatie/{slug}", response_model=OrganisatieUit)
async def organisatie_bewerken(
    slug: str,
    vraag: OrganisatieIn,
    p: Principal = Depends(eis_rol(Rol.platformbeheerder)),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    if vraag.slug != slug and db.scalar(select(Organisatie).where(Organisatie.slug == vraag.slug)):
        raise HTTPException(409, "Er bestaat al een organisatie met deze slug")
    for veld, waarde in vraag.model_dump().items():
        setattr(organisatie, veld, waarde)
    log(db, "organisatie.bewerkt", organisatie_id=organisatie.organisatieId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"slug": organisatie.slug})
    db.commit()
    return _uit(organisatie)


@router.delete("/organisatie/{slug}")
async def organisatie_verwijderen(
    slug: str,
    p: Principal = Depends(eis_rol(Rol.platformbeheerder)),
    db: Session = Depends(get_db),
):
    """Verwijder een organisatie zonder jottems: de (lege) projecten en de
    rolkoppelingen gaan mee; het Gebeurtenislog blijft (ontkoppeld) bestaan."""
    from sqlalchemy import func, update
    from ..models import Gebeurtenislog, Media

    organisatie = _organisatie(db, slug)
    aantal_jottems = db.scalar(
        select(func.count()).select_from(Media).where(
            Media.organisatieId == organisatie.organisatieId)
    ) or 0
    if aantal_jottems:
        raise HTTPException(
            409, f"Deze organisatie heeft {aantal_jottems} jottems en kan niet worden "
                 "verwijderd; depubliceer en verwijder eerst alle jottems")

    geraakte_gebruikers = db.scalars(
        select(GebruikerRol.gebruikersId).where(
            GebruikerRol.organisatieId == organisatie.organisatieId)
    ).all()
    db.execute(update(Gebeurtenislog)
               .where(Gebeurtenislog.organisatieId == organisatie.organisatieId)
               .values(organisatieId=None))
    for project in list(organisatie.projecten):
        db.execute(update(Gebeurtenislog)
                   .where(Gebeurtenislog.projectId == project.projectId)
                   .values(projectId=None))
        db.delete(project)
    for gebruikerrol in db.scalars(select(GebruikerRol).where(
            GebruikerRol.organisatieId == organisatie.organisatieId)):
        db.delete(gebruikerrol)
    db.delete(organisatie)
    log(db, "organisatie.verwijderd", gebruikers_id=p.gebruiker.gebruikersId,
        payload={"slug": slug, "naam": organisatie.naam})
    db.commit()
    for gebruikers_id in set(geraakte_gebruikers):
        invalideer_rollen_cache(gebruikers_id)
    return {"status": "verwijderd"}


@router.post("/organisatie/{slug}/huisstijl-upload")
async def huisstijl_upload(
    slug: str,
    vraag: HuisstijlUploadVraag,
    p: Principal = Depends(eis_rol(Rol.platformbeheerder)),
    db: Session = Depends(get_db),
):
    _organisatie(db, slug)
    extensie = vraag.bestandsnaam.rsplit(".", 1)[-1].lower() if "." in vraag.bestandsnaam else "png"
    object_key = f"huisstijl/{slug}/{vraag.soort}.{extensie}"
    return {
        "objectKey": object_key,
        "uploadUrl": s3.presigned_put(object_key, vraag.contentType, bucket=settings().s3_bucket_thumbs),
    }


@router.get("/organisatie/{slug}/gebruikers", response_model=list[GebruikerRolUit])
async def gebruikers(
    slug: str,
    rol: str | None = None,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    if not (p.heeft_rol(Rol.platformbeheerder) or p.heeft_rol(Rol.organisatiebeheerder, organisatie.organisatieId)):
        raise HTTPException(403, "Alleen voor beheerders")
    vraag = select(GebruikerRol, Gebruiker).join(Gebruiker).where(
        GebruikerRol.organisatieId == organisatie.organisatieId
    )
    if rol:
        vraag = vraag.where(GebruikerRol.rol == Rol(rol))
    return [
        GebruikerRolUit(
            gebruikersId=gebruiker.gebruikersId, naam=gebruiker.naam, email=gebruiker.email,
            rol=gebruikerrol.rol.value, gekoppeld=gebruiker.sub is not None,
        )
        for gebruikerrol, gebruiker in db.execute(vraag)
    ]


@router.post("/organisatie/{slug}/gebruikers", status_code=201)
async def uitnodigen(
    slug: str,
    vraag: UitnodigingIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    doel_rol = Rol(vraag.rol)
    # platformbeheerders nodigen organisatiebeheerders uit; organisatiebeheerders moderatoren
    if doel_rol == Rol.organisatiebeheerder and not p.heeft_rol(Rol.platformbeheerder):
        raise HTTPException(403, "Alleen de platformbeheerder nodigt organisatiebeheerders uit")
    if doel_rol == Rol.moderator and not (
        p.heeft_rol(Rol.platformbeheerder) or p.heeft_rol(Rol.organisatiebeheerder, organisatie.organisatieId)
    ):
        raise HTTPException(403, "Alleen beheerders van deze organisatie nodigen moderatoren uit")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", vraag.email):
        raise HTTPException(422, "Geen geldig e-mailadres")

    gebruiker = db.scalar(select(Gebruiker).where(Gebruiker.email == vraag.email))
    if not gebruiker:
        gebruiker = Gebruiker(sub=None, naam=vraag.naam, email=vraag.email)
        db.add(gebruiker)
        db.flush()
    bestaand = db.scalar(select(GebruikerRol).where(
        GebruikerRol.gebruikersId == gebruiker.gebruikersId,
        GebruikerRol.organisatieId == organisatie.organisatieId,
        GebruikerRol.rol == doel_rol,
    ))
    if bestaand:
        raise HTTPException(409, "Deze gebruiker heeft die rol al")
    db.add(GebruikerRol(
        gebruikersId=gebruiker.gebruikersId,
        organisatieId=organisatie.organisatieId,
        rol=doel_rol,
    ))
    invalideer_rollen_cache(gebruiker.gebruikersId)

    cfg = settings()
    template = "uitnodiging-organisatiebeheerder" if doel_rol == Rol.organisatiebeheerder else "uitnodiging-moderator"
    log(db, "gebruiker.uitgenodigd",
        organisatie_id=organisatie.organisatieId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"rol": doel_rol.value, "genodigde": gebruiker.gebruikersId,
                 "mail": {"template": template, "aan": gebruiker.email,
                          "context": {
                              "ontvangerNaam": gebruiker.naam,
                              "uitnodigerNaam": p.gebruiker.naam,
                              "bevestigingsUrl": f"{cfg.oidc_issuer.split('/application/')[0]}/if/flow/jottem-registratie/",
                              "spelregelsUrl": "https://design.iotm.nl/juridisch/handreiking-moderatie.html",
                          }}})
    db.commit()
    return {"gebruikersId": gebruiker.gebruikersId, "rol": doel_rol.value, "status": "uitgenodigd"}


@router.delete("/organisatie/{slug}/gebruiker/{gebruikers_id}")
async def rol_intrekken(
    slug: str,
    gebruikers_id: int,
    rol: str,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    doel_rol = Rol(rol)
    if doel_rol == Rol.organisatiebeheerder and not p.heeft_rol(Rol.platformbeheerder):
        raise HTTPException(403, "Alleen de platformbeheerder beheert organisatiebeheerders")
    if doel_rol == Rol.moderator and not (
        p.heeft_rol(Rol.platformbeheerder) or p.heeft_rol(Rol.organisatiebeheerder, organisatie.organisatieId)
    ):
        raise HTTPException(403, "Alleen beheerders van deze organisatie")
    gebruikerrol = db.scalar(select(GebruikerRol).where(
        GebruikerRol.gebruikersId == gebruikers_id,
        GebruikerRol.organisatieId == organisatie.organisatieId,
        GebruikerRol.rol == doel_rol,
    ))
    if not gebruikerrol:
        raise HTTPException(404, "Rol niet gevonden")
    db.delete(gebruikerrol)
    invalideer_rollen_cache(gebruikers_id)
    log(db, "gebruiker.rol_ingetrokken",
        organisatie_id=organisatie.organisatieId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"rol": doel_rol.value, "gebruiker": gebruikers_id})
    db.commit()
    return {"status": "ingetrokken"}
