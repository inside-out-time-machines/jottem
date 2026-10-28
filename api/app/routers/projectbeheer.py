"""Projectbeheer door de organisatiebeheerder (OB-2/OB-3).

Elke organisatie houdt minstens één project en elke jottem hoort bij precies één
project; verwijderen kan daarom alleen bij een leeg project dat niet het laatste is
(anders 409). Terminologiebronnen per project sturen straks de upload- en
annotatieschermen (Termennetwerk).
"""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import authentik, s3
from ..auth import Principal, eis_sterke_factor, principal
from ..config import settings
from ..db import get_db
from ..models import Gebruiker, Media, Organisatie, Project, ProjectLid, Rol
from ..outbox import log
from ..schemas import (
    AfbeeldingUploadVraag, ProjectIn, ProjectLidIn, ProjectLidUit, ProjectUit,
)

router = APIRouter(tags=["Projecten"])


def _organisatie(db: Session, slug: str) -> Organisatie:
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    return organisatie


def _eis_beheerder(p: Principal, organisatie_id: int) -> None:
    eis_sterke_factor(p)
    if not (p.heeft_rol(Rol.platformbeheerder) or p.heeft_rol(Rol.organisatiebeheerder, organisatie_id)):
        raise HTTPException(403, "Alleen voor beheerders van deze organisatie")


def _uit(db: Session, project: Project, organisatie_slug: str) -> ProjectUit:
    aantal = db.scalar(select(func.count()).select_from(Media).where(Media.projectId == project.projectId)) or 0
    return ProjectUit(
        projectId=project.projectId,
        organisatieSlug=organisatie_slug,
        naam=project.naam,
        slug=project.slug,
        beschrijving=project.beschrijving,
        oproep=project.oproep,
        periode=project.periode,
        afbeelding=project.afbeelding,
        afbeeldingUrl=s3.presigned_get(project.afbeelding, bucket=settings().s3_bucket_thumbs) if project.afbeelding else None,
        datasetLicentie=project.datasetLicentie,
        status=project.status,
        zichtbaarheid=project.zichtbaarheid,
        terminologiebronnen=project.terminologiebronnen or [],
        verrijkingen=project.verrijkingen,
        uploadWijzen=project.uploadWijzen,
        datasetAangemeld=project.datasetAangemeld,
        aantalJottems=aantal,
    )


def project_met_rechten(db: Session, project_id: uuid.UUID, p: Principal) -> tuple[Project, Organisatie]:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    organisatie = db.get(Organisatie, project.organisatieId)
    _eis_beheerder(p, organisatie.organisatieId)
    return project, organisatie


@router.get("/organisatie/{slug}/projecten", response_model=list[ProjectUit])
def projecten(
    slug: str,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    _eis_beheerder(p, organisatie.organisatieId)
    return [
        _uit(db, project, slug)
        for project in db.scalars(select(Project).where(Project.organisatieId == organisatie.organisatieId).order_by(Project.naam))
    ]


@router.post("/organisatie/{slug}/projecten", response_model=ProjectUit, status_code=201)
def project_aanmaken(
    slug: str,
    vraag: ProjectIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    organisatie = _organisatie(db, slug)
    _eis_beheerder(p, organisatie.organisatieId)
    if db.scalar(select(Project).where(Project.organisatieId == organisatie.organisatieId, Project.slug == vraag.slug)):
        raise HTTPException(409, "Er bestaat al een project met deze slug binnen de organisatie")
    project = Project(organisatieId=organisatie.organisatieId, **vraag.model_dump())
    db.add(project)
    db.flush()
    log(db, "project.aangemaakt", organisatie_id=organisatie.organisatieId,
        project_id=project.projectId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"slug": project.slug})
    db.commit()
    return _uit(db, project, slug)


@router.put("/project/{project_id}", response_model=ProjectUit)
def project_bewerken(
    project_id: uuid.UUID,
    vraag: ProjectIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    if vraag.slug != project.slug and db.scalar(
        select(Project).where(Project.organisatieId == organisatie.organisatieId, Project.slug == vraag.slug)
    ):
        raise HTTPException(409, "Er bestaat al een project met deze slug binnen de organisatie")
    for veld, waarde in vraag.model_dump().items():
        setattr(project, veld, waarde)
    log(db, "project.bewerkt", organisatie_id=organisatie.organisatieId,
        project_id=project.projectId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"slug": project.slug})
    db.commit()
    return _uit(db, project, organisatie.slug)


@router.delete("/project/{project_id}")
def project_verwijderen(
    project_id: uuid.UUID,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    aantal_jottems = db.scalar(select(func.count()).select_from(Media).where(Media.projectId == project.projectId)) or 0
    if aantal_jottems:
        raise HTTPException(409, "Dit project bevat jottems en kan niet worden verwijderd")
    aantal_projecten = db.scalar(
        select(func.count()).select_from(Project).where(Project.organisatieId == organisatie.organisatieId)
    ) or 0
    if aantal_projecten <= 1:
        raise HTTPException(409, "Elke organisatie houdt minstens één project; dit is het laatste")
    # het Gebeurtenislog overleeft mutaties: regels ontkoppelen in plaats van blokkeren
    from ..models import Gebeurtenislog
    db.execute(update(Gebeurtenislog).where(Gebeurtenislog.projectId == project.projectId).values(projectId=None))
    for lid in db.scalars(select(ProjectLid).where(ProjectLid.projectId == project.projectId)):
        db.delete(lid)
    db.delete(project)
    log(db, "project.verwijderd", organisatie_id=organisatie.organisatieId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"slug": project.slug})
    db.commit()
    return {"status": "verwijderd"}


# ---------- ledenadministratie van besloten projecten (OB-8) ----------

def _lid_uit(lid: ProjectLid, gebruiker: Gebruiker) -> ProjectLidUit:
    return ProjectLidUit(
        gebruikersId=gebruiker.gebruikersId, naam=gebruiker.naam, email=gebruiker.email,
        gekoppeld=gebruiker.sub is not None, creatieDatum=lid.creatieDatum,
    )


@router.get("/project/{project_id}/leden", response_model=list[ProjectLidUit])
def leden(
    project_id: uuid.UUID,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, _ = project_met_rechten(db, project_id, p)
    rijen = db.execute(
        select(ProjectLid, Gebruiker).join(Gebruiker, Gebruiker.gebruikersId == ProjectLid.gebruikersId)
        .where(ProjectLid.projectId == project.projectId)
        .order_by(Gebruiker.naam)
    )
    return [_lid_uit(lid, gebruiker) for lid, gebruiker in rijen]


@router.post("/project/{project_id}/leden", status_code=201)
def lid_uitnodigen(
    project_id: uuid.UUID,
    vraag: ProjectLidIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    """Klaarzetpatroon zoals bij de rollen (organisatiebeheer.uitnodigen), maar zonder rol
    en zonder sterke factor voor het lid. Omdat de mail naar de wachtwoord-vergeten-flow
    linkt, krijgt een nieuwe genodigde meteen een account in Authentik."""
    project, organisatie = project_met_rechten(db, project_id, p)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", vraag.email):
        raise HTTPException(422, "Geen geldig e-mailadres")

    gebruiker = db.scalar(select(Gebruiker).where(Gebruiker.email == vraag.email))
    if not gebruiker:
        gebruiker = Gebruiker(sub=None, naam=vraag.naam, email=vraag.email)
        db.add(gebruiker)
        db.flush()
    if db.scalar(select(ProjectLid).where(ProjectLid.projectId == project.projectId,
                                          ProjectLid.gebruikersId == gebruiker.gebruikersId)):
        raise HTTPException(409, "Deze gebruiker is al lid van het project")
    lid = ProjectLid(projectId=project.projectId, gebruikersId=gebruiker.gebruikersId,
                     uitgenodigdDoor=p.gebruiker.gebruikersId)
    db.add(lid)

    # al eens ingelogd (sub bekend): dan bestaat het account al en volstaat "log in"
    al_bekend = gebruiker.sub is not None
    account = "bestond" if al_bekend else authentik.zorg_voor_account(gebruiker.email, gebruiker.naam)

    cfg = settings()
    log(db, "project.lid_uitgenodigd",
        organisatie_id=organisatie.organisatieId, project_id=project.projectId,
        gebruikers_id=p.gebruiker.gebruikersId,
        payload={"genodigde": gebruiker.gebruikersId, "account": account,
                 "mail": {"template": "uitnodiging-projectlid", "aan": gebruiker.email,
                          "context": {
                              "ontvangerNaam": gebruiker.naam,
                              "uitnodigerNaam": p.gebruiker.naam,
                              "projectNaam": project.naam,
                              "projectUrl": f"{cfg.publieke_basis_url}/organisatie/{organisatie.slug}/{project.slug}",
                              "wachtwoordUrl": f"{cfg.oidc_issuer.split('/application/')[0]}/if/flow/jottem-wachtwoord-herstel/",
                              "alBekend": al_bekend,
                          }}})
    db.commit()
    return {"gebruikersId": gebruiker.gebruikersId, "account": account, "status": "uitgenodigd"}


@router.delete("/project/{project_id}/lid/{gebruikers_id}", status_code=204)
def lid_intrekken(
    project_id: uuid.UUID,
    gebruikers_id: int,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    lid = db.scalar(select(ProjectLid).where(ProjectLid.projectId == project.projectId,
                                             ProjectLid.gebruikersId == gebruikers_id))
    if not lid:
        raise HTTPException(404, "Deze gebruiker is geen lid van het project")
    db.delete(lid)
    log(db, "project.lid_ingetrokken",
        organisatie_id=organisatie.organisatieId, project_id=project.projectId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"gebruiker": gebruikers_id})
    db.commit()


@router.post("/project/{project_id}/afbeelding-upload")
def afbeelding_upload(
    project_id: uuid.UUID,
    vraag: AfbeeldingUploadVraag,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, _ = project_met_rechten(db, project_id, p)
    extensie = s3.extensie_voor(vraag.contentType, "jpg")
    object_key = f"projecten/{project.projectId}/afbeelding.{extensie}"
    return {
        "objectKey": object_key,
        "uploadUrl": s3.presigned_put(object_key, vraag.contentType, bucket=settings().s3_bucket_thumbs),
    }
