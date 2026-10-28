"""Toegang tot besloten projecten (ontwerp: OB-7, OB-8, GE-5, BE-8).

Een openbaar project is voor iedereen; een besloten project toont zijn jottems in de
webapplicatie alleen aan leden (ProjectLid) en aan wie er beroepshalve bij moet:
platformbeheerder, organisatiebeheerders en moderatoren van de organisatie. De open data
(RDF, IIIF, RSS, activity stream, dump, SPARQL) gebruikt deze module bewust niet.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import Principal
from .models import Project, ProjectLid, Rol

BESLOTEN = "besloten"


def is_besloten(project: Project) -> bool:
    return project.zichtbaarheid == BESLOTEN


def is_lid(db: Session, project: Project, p: Principal) -> bool:
    return db.scalar(select(ProjectLid.id).where(
        ProjectLid.projectId == project.projectId,
        ProjectLid.gebruikersId == p.gebruiker.gebruikersId,
    )) is not None


def mag_project_zien(db: Session, project: Project, p: Principal | None) -> bool:
    if not is_besloten(project):
        return True
    if p is None:
        return False
    if (p.heeft_rol(Rol.platformbeheerder)
            or p.heeft_rol(Rol.organisatiebeheerder, project.organisatieId)
            or p.heeft_rol(Rol.moderator, project.organisatieId)):
        return True
    return is_lid(db, project, p)


def toegang_label(db: Session, project: Project, p: Principal | None) -> str:
    """Wat de publieke projectweergave aan de frontend meldt: ja | inloggen | geen-lid."""
    if mag_project_zien(db, project, p):
        return "ja"
    return "inloggen" if p is None else "geen-lid"


def eis_project_toegang(db: Session, project: Project, p: Principal | None) -> None:
    """401 zonder login, 403 zonder lidmaatschap; bij een openbaar project doet dit niets."""
    if mag_project_zien(db, project, p):
        return
    if p is None:
        raise HTTPException(401, "Dit project is besloten; log in om de jottems te zien")
    raise HTTPException(403, "Dit project is besloten; je account is geen lid")
