"""RDF-representatie van jottems conform schema.org AP NDE (zie de data-architectuur,
veld-naar-bron-tabel in de sectie RDF en datadump).

De JSON-LD wordt hier opgebouwd uit de database; rdflib zet dezelfde graaf om naar
Turtle, N-Triples of RDF/XML (content negotiation, dump, Fuseki-sync). Persoonsgegevens:
de inzender komt alleen als schema:contributor mee wanneer Gebruiker.naamPubliek aan staat.
"""
import json
import uuid

from rdflib import Graph
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import anno
from .config import settings
from .models import Gebruiker, Media, MediaStatus, Organisatie, Project

# metadata-velden met een term-URI-tegenhanger (veld "xxxUri" naast "xxx")
ABOUT_VELDEN = ("persoon", "gebouw", "bedrijf", "gebeurtenis", "plaats")


def jottem_uri(media_id: uuid.UUID | str) -> str:
    return f"{settings().publieke_basis_url}/jottem/{media_id}"


def dataset_uri(project_id: uuid.UUID | str) -> str:
    return f"{settings().data_basis_url}/project/{project_id}/dataset"


def jottem_jsonld(db: Session, media: Media) -> dict:
    """Eén gepubliceerde jottem als schema.org AP NDE JSON-LD."""
    cfg = settings()
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    uploader = db.get(Gebruiker, media.uploaderId)
    metadata = {r.veld: r.waarde for r in media.metadataRijen}
    uri = jottem_uri(media.mediaId)
    iiif = f"{cfg.iiif_basis_url}/iiif/3/{media.mediaId}.tif"

    doc: dict = {
        "@context": "https://schema.org/",
        "@id": uri,
        "@type": "ImageObject",
        "name": media.titel,
        "description": media.beschrijving,
        "license": media.licentie,
        "datePublished": media.publicatieDatum.isoformat() if media.publicatieDatum else None,
        "dateModified": media.wijzigingsDatum.isoformat(),
        "inLanguage": "nl",
        "publisher": {
            "@id": organisatie.website or f"{cfg.publieke_basis_url}/organisatie/{organisatie.slug}",
            "@type": "Organization",
            "name": organisatie.naam,
        },
        "isPartOf": {"@id": dataset_uri(media.projectId)},
        "encodingFormat": media.mimeType,
        "width": media.breedte,
        "height": media.hoogte,
    }
    if media.bron == "iiif" and media.externeIiifService:
        doc["contentUrl"] = f"{media.externeIiifService}/full/max/0/default.jpg"
        doc["thumbnailUrl"] = f"{media.externeIiifService}/full/!400,400/0/default.jpg"
        doc["isBasedOn"] = {"@id": media.bronUrl}          # herkomst: de beeldbank
    elif media.bron == "url":
        doc["contentUrl"] = media.bronUrl
        doc["thumbnailUrl"] = media.bronUrl
        doc["isBasedOn"] = {"@id": media.bronUrl}
    elif media.breedte and media.hoogte:
        doc["contentUrl"] = f"{iiif}/full/max/0/default.jpg"
        doc["thumbnailUrl"] = f"{iiif}/full/!400,400/0/default.jpg"
    if media.genre:
        doc["genre"] = media.genre
        if metadata.get("genreUri"):
            doc["additionalType"] = {"@id": metadata["genreUri"]}
    if metadata.get("datering"):
        doc["dateCreated"] = metadata["datering"]
    if metadata.get("vervaardiger"):
        doc["creator"] = {"@type": "Person", "name": metadata["vervaardiger"]}
    if uploader and uploader.naamPubliek:
        doc["contributor"] = {"@type": "Person", "name": uploader.naam}

    # locatie: adres en/of speld op de kaart (lat/lon)
    plaats: dict = {}
    if metadata.get("adres"):
        plaats["address"] = metadata["adres"]
    if metadata.get("lat") and metadata.get("lon"):
        plaats["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": float(metadata["lat"]),
            "longitude": float(metadata["lon"]),
        }
    if plaats:
        doc["contentLocation"] = {"@type": "Place", **plaats}

    if metadata.get("jaarVan") or metadata.get("jaarTot"):
        doc["temporalCoverage"] = f"{metadata.get('jaarVan', '..')}/{metadata.get('jaarTot', '..')}"

    steekwoorden = [w for v, w in metadata.items() if v.startswith("steekwoord")]
    if steekwoorden:
        doc["keywords"] = steekwoorden

    about = []
    for veld in ABOUT_VELDEN:
        if metadata.get(veld):
            item: dict = {"name": metadata[veld]}
            if metadata.get(f"{veld}Uri"):
                item["@id"] = metadata[f"{veld}Uri"]
            about.append(item)
    if about:
        doc["about"] = about
    if metadata.get("archiefbron"):
        bron: dict = {"name": metadata["archiefbron"]}
        if metadata.get("archiefbronUri"):
            bron["@id"] = metadata["archiefbronUri"]
        doc["subjectOf"] = bron

    # verwijzing naar de verrijkingslaag (W3C Annotation Protocol, zie data-architectuur)
    doc["mainEntityOfPage"] = {
        "@id": anno.container_url_publiek(str(media.mediaId)),
        "@type": "CreativeWork",
        "name": "Webannotaties (W3C) bij deze jottem",
    }
    return {sleutel: waarde for sleutel, waarde in doc.items() if waarde is not None}


def project_jsonld(db: Session, project: Project) -> list[dict]:
    """Alle gepubliceerde jottems van een project (voor dump en Fuseki-graaf)."""
    rijen = db.scalars(
        select(Media).where(Media.projectId == project.projectId,
                            Media.status == MediaStatus.goedgekeurd)
    ).all()
    return [jottem_jsonld(db, media) for media in rijen]


def naar_graaf(documenten: list[dict] | dict) -> Graph:
    graaf = Graph()
    lijst = documenten if isinstance(documenten, list) else [documenten]
    for doc in lijst:
        # @vocab in plaats van de externe schema.org-context: rdflib hoeft dan niets
        # op te halen en alle kale termen resolven naar schema.org
        lokaal = {**doc, "@context": {"@vocab": "https://schema.org/"}}
        graaf.parse(data=json.dumps(lokaal), format="json-ld")
    graaf.bind("schema", "https://schema.org/")
    return graaf


def serialiseer(documenten: list[dict] | dict, formaat: str) -> bytes:
    """formaat: turtle | nt | xml"""
    return naar_graaf(documenten).serialize(format=formaat, encoding="utf-8")
