"""Projectbeheer door de organisatiebeheerder (OB-2/OB-3).

Elke organisatie houdt minstens één project en elke jottem hoort bij precies één
project; verwijderen kan daarom alleen bij een leeg project dat niet het laatste is
(anders 409). Terminologiebronnen per project sturen straks de upload- en
annotatieschermen (Termennetwerk).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import s3
from ..auth import Principal, principal
from ..config import settings
from ..db import get_db
from ..models import Media, Organisatie, Project, Rol
from ..outbox import log
from ..schemas import AfbeeldingUploadVraag, ProjectIn, ProjectUit

router = APIRouter(tags=["Projecten"])


def _organisatie(db: Session, slug: str) -> Organisatie:
    organisatie = db.scalar(select(Organisatie).where(Organisatie.slug == slug))
    if not organisatie:
        raise HTTPException(404, "Organisatie onbekend")
    return organisatie


def _eis_beheerder(p: Principal, organisatie_id: int) -> None:
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
        terminologiebronnen=project.terminologiebronnen or [],
        verrijkingen=project.verrijkingen,
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
async def projecten(
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
async def project_aanmaken(
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
async def project_bewerken(
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
async def project_verwijderen(
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
    db.delete(project)
    log(db, "project.verwijderd", organisatie_id=organisatie.organisatieId,
        gebruikers_id=p.gebruiker.gebruikersId, payload={"slug": project.slug})
    db.commit()
    return {"status": "verwijderd"}


@router.post("/project/{project_id}/afbeelding-upload")
async def afbeelding_upload(
    project_id: uuid.UUID,
    vraag: AfbeeldingUploadVraag,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, _ = project_met_rechten(db, project_id, p)
    extensie = vraag.bestandsnaam.rsplit(".", 1)[-1].lower() if "." in vraag.bestandsnaam else "jpg"
    object_key = f"projecten/{project.projectId}/afbeelding.{extensie}"
    return {
        "objectKey": object_key,
        "uploadUrl": s3.presigned_put(object_key, vraag.contentType, bucket=settings().s3_bucket_thumbs),
    }
