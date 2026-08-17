"""Datasetbeschrijving per project en de NDE-Datasetregister-flow (OB-4).

De datasetbeschrijving (schema.org Dataset, JSON-LD conform het AP van het register)
wordt gegenereerd uit project- en organisatievelden; bewerken gebeurt via die velden.
Aanmelden kan alleen met openbare (gepubliceerde) jottems; de backend valideert eerst
via PUT /datasets/validate van het register (SHACL-fouten komen terug als 422).
"""
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import Principal, principal
from ..config import settings
from ..db import get_db
from ..models import Media, MediaStatus, Organisatie, Project
from ..outbox import log
from .projectbeheer import project_met_rechten

router = APIRouter(tags=["Dataset"])

REGISTER_API = "https://datasetregister.netwerkdigitaalerfgoed.nl/api"


def _aantal_openbaar(db: Session, project_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(Media).where(
            Media.projectId == project_id, Media.status == MediaStatus.goedgekeurd
        )
    ) or 0


def _dataset_jsonld(db: Session, project: Project) -> dict:
    organisatie = db.get(Organisatie, project.organisatieId)
    cfg = settings()
    dataset_url = f"{cfg.data_basis_url}/project/{project.projectId}/dataset"
    publisher_id = organisatie.website or f"{cfg.publieke_basis_url}/organisatie/{organisatie.slug}"
    laatste_wijziging = db.scalar(
        select(func.max(Media.wijzigingsDatum)).where(
            Media.projectId == project.projectId, Media.status == MediaStatus.goedgekeurd)
    )
    eerste_publicatie = db.scalar(
        select(func.min(Media.publicatieDatum)).where(
            Media.projectId == project.projectId, Media.status == MediaStatus.goedgekeurd)
    )

    def _nl(tekst: str) -> dict:
        return {"@value": tekst, "@language": "nl"}
    dataset = {
        "@context": "https://schema.org/",
        "@id": dataset_url,
        "@type": "Dataset",
        # naam en beschrijving expliciet Nederlandstalig (JSON-LD language map)
        "name": {"@value": f"{project.naam} ({organisatie.naam})", "@language": "nl"},
        "description": {"@value": project.beschrijving or f"Jottems uit het project {project.naam}.",
                        "@language": "nl"},
        "license": project.datasetLicentie,
        "publisher": {sleutel: waarde for sleutel, waarde in {
            "@id": publisher_id,
            "@type": "Organization",
            "name": {"@value": organisatie.naam, "@language": "nl"},
            "email": organisatie.email,   # verplicht, gevuld via het beheer
            "contactPoint": {"@type": "ContactPoint",
                             "name": {"@value": organisatie.naam, "@language": "nl"},
                             "email": organisatie.email} if organisatie.email else None,
        }.items() if waarde is not None},
        # het platform zelf als maker van de dataset
        "creator": {
            "@id": "https://iotm.nl/",
            "@type": "Organization",
            "name": {"@value": "Jottem", "@language": "nl"},
            "email": "data@iotm.nl",
            "contactPoint": {"@type": "ContactPoint",
                             "name": {"@value": "Jottem", "@language": "nl"},
                             "email": "data@iotm.nl"},
        },
        "inLanguage": ["nl"],
        # ISO 8601 op secondenprecisie (xsd:dateTime), bijv. 2026-04-14T10:30:00
        "dateCreated": project.creatieDatum.strftime("%Y-%m-%dT%H:%M:%S") if project.creatieDatum else None,
        "dateModified": laatste_wijziging.strftime("%Y-%m-%dT%H:%M:%S") if laatste_wijziging else None,
        "datePublished": eerste_publicatie.strftime("%Y-%m-%dT%H:%M:%S") if eerste_publicatie else None,
        "temporalCoverage": project.periode,
        "includedInDataCatalog": {"@id": f"{cfg.data_basis_url}/datacatalog"},
        # alle toegangswegen tot de projectdata als distributie (aanbeveling in de
        # data-architectuur, sectie aanvullende distributies)
        # encodingFormat draagt alleen het MIME-type; profielen en protocollen staan
        # in usageInfo (conform het SHACL-shape van het Datasetregister)
        "distribution": [
            {"@type": "DataDownload", "encodingFormat": "application/n-triples+gzip",
             "description": _nl("RDF-datadump van alle gepubliceerde jottems (N-Triples, gecomprimeerd)"),
             "contentUrl": f"{cfg.data_basis_url}/project/{project.projectId}/dump-{project.slug}.nt.gz"},
            {"@type": "DataDownload",
             "usageInfo": "https://www.w3.org/TR/sparql11-protocol/",
             "description": _nl("SPARQL-endpoint (alleen lezen; named graph per project)"),
             "contentUrl": f"{cfg.data_basis_url}/sparql"},
            {"@type": "DataDownload", "encodingFormat": "application/ld+json",
             "usageInfo": "http://iiif.io/api/presentation/3/context.json",
             "description": _nl("IIIF Presentation Collection van de gepubliceerde jottems"),
             "contentUrl": f"{cfg.api_basis_url}/project/{project.projectId}/iiif/collection"},
            {"@type": "DataDownload", "encodingFormat": "application/rss+xml",
             "description": _nl("RSS-feed van nieuwe jottems in dit project"),
             "contentUrl": f"{cfg.api_basis_url}/project/{project.projectId}/rss"},
            {"@type": "DataDownload", "encodingFormat": "application/ld+json",
             "usageInfo": "http://www.w3.org/ns/anno.jsonld",
             "description": _nl("Alle W3C-webannotaties bij de jottems van dit project"),
             "contentUrl": f"{cfg.api_basis_url}/project/{project.projectId}/annotations"},
            {"@type": "DataDownload", "encodingFormat": "application/ld+json",
             "usageInfo": "http://iiif.io/api/discovery/1/context.json",
             "description": _nl("IIIF Change Discovery activity-stream voor incrementeel harvesten"),
             "contentUrl": f"{cfg.api_basis_url}/project/{project.projectId}/activity-stream"},
        ],
    }
    return {sleutel: waarde for sleutel, waarde in dataset.items() if waarde is not None}


@router.get("/project/{project_id}/dataset")
async def dataset_publiek(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """Publieke datasetbeschrijving; alleen beschikbaar met gepubliceerde jottems."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project onbekend")
    if not _aantal_openbaar(db, project_id):
        raise HTTPException(404, "Dit project heeft nog geen openbare data")
    return JSONResponse(_dataset_jsonld(db, project), media_type="application/ld+json")


@router.get("/project/{project_id}/datasetbeschrijving")
async def datasetbeschrijving(
    project_id: uuid.UUID,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    return {
        "dataset": _dataset_jsonld(db, project),
        "openbareJottems": _aantal_openbaar(db, project_id),
        "aangemeld": project.datasetAangemeld,
        "publisherEmail": organisatie.email,
    }


class DatasetbeschrijvingIn(BaseModel):
    naam: str | None = None
    beschrijving: str | None = None
    datasetLicentie: str | None = None
    # publisher-contactadres (Organisatie.email); verplicht in de beheer-GUI
    publisherEmail: str | None = None


@router.put("/project/{project_id}/datasetbeschrijving")
async def datasetbeschrijving_bewerken(
    project_id: uuid.UUID,
    vraag: DatasetbeschrijvingIn,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    if vraag.naam:
        project.naam = vraag.naam
    if vraag.beschrijving is not None:
        project.beschrijving = vraag.beschrijving
    if vraag.datasetLicentie:
        project.datasetLicentie = vraag.datasetLicentie
    if vraag.publisherEmail:
        import re
        if not re.match(r"^\S+@\S+\.\S+$", vraag.publisherEmail):
            raise HTTPException(422, "Geen geldig e-mailadres voor de publisher")
        organisatie.email = vraag.publisherEmail
    log(db, "dataset.bewerkt", organisatie_id=organisatie.organisatieId,
        project_id=project.projectId, gebruikers_id=p.gebruiker.gebruikersId, payload={})
    db.commit()
    return {"dataset": _dataset_jsonld(db, project)}


@router.post("/project/{project_id}/datasetbeschrijving/aanmelden", status_code=202)
async def aanmelden(
    project_id: uuid.UUID,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    if not _aantal_openbaar(db, project_id):
        raise HTTPException(409, "Zonder openbare (gepubliceerde) jottems is aanmelden niet mogelijk")

    dataset = _dataset_jsonld(db, project)
    dataset_url = dataset["@id"]

    # stap 1: valideren tegen het SHACL-shape van het register
    try:
        validatie = httpx.put(
            f"{REGISTER_API}/datasets/validate",
            json=dataset,
            headers={"Content-Type": "application/ld+json"},
            timeout=60,
        )
    except httpx.HTTPError as fout:
        raise HTTPException(502, f"Datasetregister niet bereikbaar: {fout}") from fout
    if validatie.status_code not in (200, 201):
        raise HTTPException(422, {
            "melding": "Validatie tegen het Datasetregister faalde",
            "status": validatie.status_code,
            "details": validatie.text[:2000],
        })

    # stap 2: aanmelden met de publieke URL van de datasetbeschrijving
    aanmelding = httpx.post(
        f"{REGISTER_API}/datasets",
        json={"@id": dataset_url},
        headers={"Content-Type": "application/ld+json"},
        timeout=60,
    )
    if aanmelding.status_code not in (200, 201, 202):
        # bijv. domein niet op de allowlist; gevalideerd is het wel
        raise HTTPException(502, {
            "melding": "Gevalideerd, maar aanmelden is geweigerd door het register "
                       "(staat het domein op de allowlist?)",
            "status": aanmelding.status_code,
            "details": aanmelding.text[:1000],
        })
    project.datasetAangemeld = datetime.now(timezone.utc)
    log(db, "dataset.aangemeld", organisatie_id=organisatie.organisatieId,
        project_id=project.projectId, gebruikers_id=p.gebruiker.gebruikersId,
        payload={"datasetUrl": dataset_url})
    db.commit()
    return {"status": "aangemeld", "datasetUrl": dataset_url}


@router.delete("/project/{project_id}/datasetbeschrijving/aanmelden", status_code=204)
async def afmelden(
    project_id: uuid.UUID,
    p: Principal = Depends(principal),
    db: Session = Depends(get_db),
):
    project, organisatie = project_met_rechten(db, project_id, p)
    dataset_url = f"{settings().api_basis_url}/project/{project.projectId}/dataset"
    try:
        httpx.request(
            "DELETE", f"{REGISTER_API}/datasets",
            json={"@id": dataset_url},
            headers={"Content-Type": "application/ld+json"},
            timeout=60,
        )
    except httpx.HTTPError:
        pass  # afmelden bij een onbereikbaar register mag lokaal niet blokkeren
    project.datasetAangemeld = None
    log(db, "dataset.afgemeld", organisatie_id=organisatie.organisatieId,
        project_id=project.projectId, gebruikers_id=p.gebruiker.gebruikersId, payload={})
    db.commit()
