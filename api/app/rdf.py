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

from . import anno, iiif, relaties
from .config import settings
from .models import Gebruiker, Media, MediaStatus, Organisatie, Project

# metadata-velden met een term-URI-tegenhanger (veld "xxxUri" naast "xxx")
ABOUT_VELDEN = ("persoon", "gebouw", "bedrijf", "gebeurtenis", "plaats")


def jottem_uri(media_id: uuid.UUID | str) -> str:
    return f"{settings().publieke_basis_url}/jottem/{media_id}"


def dataset_uri(project_id: uuid.UUID | str) -> str:
    return f"{settings().data_basis_url}/project/{project_id}/dataset"


def jottem_jsonld(db: Session, media: Media,
                  partners: list[uuid.UUID] | None = None) -> dict:
    """Eén gepubliceerde jottem als schema.org AP NDE JSON-LD."""
    cfg = settings()
    organisatie = db.get(Organisatie, media.organisatieId)
    project = db.get(Project, media.projectId)
    uploader = db.get(Gebruiker, media.uploaderId)
    # twee weergaven van dezelfde rijen: de meeste velden zijn enkelvoudig (adres, datering),
    # maar steekwoorden komen meerdere keren voor onder dezelfde veldnaam. Een kale dict liet
    # daar alleen de laatste van over, waardoor er in schema:keywords maar één steekwoord
    # belandde, hoeveel de inzender er ook opgaf.
    metadata: dict[str, str] = {}
    alle_waarden: dict[str, list[str]] = {}
    for rij in media.metadataRijen:
        metadata[rij.veld] = rij.waarde
        alle_waarden.setdefault(rij.veld, []).append(rij.waarde)
    uri = jottem_uri(media.mediaId)
    iiif_service = f"{cfg.iiif_basis_url}/iiif/3/{media.mediaId}.tif"

    doc: dict = {
        # de externe context https://schema.org/ mapt kale termen naar
        # http://schema.org/; Turtle, de dump en de triplestore gebruiken
        # https://schema.org/. Pinnen houdt alle serialisaties één graaf
        "@context": {"@vocab": "https://schema.org/",
                     "dcterms": "http://purl.org/dc/terms/"},
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
        doc["thumbnailUrl"] = iiif.afbeelding_url(
            media.externeIiifService, media.breedte, media.hoogte, 400)
        doc["isBasedOn"] = {"@id": media.bronUrl}          # herkomst: de beeldbank
    elif media.bron == "url":
        doc["contentUrl"] = media.bronUrl
        doc["thumbnailUrl"] = media.bronUrl
        doc["isBasedOn"] = {"@id": media.bronUrl}
    elif media.breedte and media.hoogte:
        doc["contentUrl"] = f"{iiif_service}/full/max/0/default.jpg"
        doc["thumbnailUrl"] = iiif.afbeelding_url(
            iiif_service, media.breedte, media.hoogte, 400)
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

    steekwoorden = [w for veld, lijst in alle_waarden.items()
                    if veld.startswith("steekwoord") for w in lijst]
    if steekwoorden:
        doc["keywords"] = steekwoorden

    # een steekwoord dat uit een thesaurus komt draagt een term-URI, opgeslagen onder
    # "<label>-termUri". Zo'n term is meer dan een woord: die gaat als schema:about de
    # graaf in, met het label en de URI, en is daarmee koppelbaar aan andere collecties.
    onderwerpen = [
        {"@id": uri, "name": veld[: -len("-termUri")]}
        for veld, uri in metadata.items() if veld.endswith("-termUri")
    ]

    about = []
    for veld in ABOUT_VELDEN:
        if metadata.get(veld):
            item: dict = {"name": metadata[veld]}
            if metadata.get(f"{veld}Uri"):
                item["@id"] = metadata[f"{veld}Uri"]
            about.append(item)
    about.extend(onderwerpen)
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
    # koppelingen naar jottems die hetzelfde object tonen (V-9); schema.org kent geen
    # generieke relatie tussen twee CreativeWorks, vandaar dcterms:relation. Alleen
    # gepubliceerde partners, anders wijst de graaf naar een 410-tombstone.
    if partners is None:
        partners = [p.mediaId for p in relaties.gepubliceerde_partners(db, media.mediaId)]
    if partners:
        doc["dcterms:relation"] = [{"@id": jottem_uri(p)} for p in partners]

    return {sleutel: waarde for sleutel, waarde in doc.items() if waarde is not None}


def project_jsonld(db: Session, project: Project) -> list[dict]:
    """Alle gepubliceerde jottems van een project (voor dump en Fuseki-graaf)."""
    rijen = db.scalars(
        select(Media).where(Media.projectId == project.projectId,
                            Media.status == MediaStatus.goedgekeurd)
    ).all()
    # de koppelingen in één query in plaats van per jottem, want dit voedt ook de dump
    gepubliceerd = {m.mediaId for m in rijen}
    per_jottem = relaties.partners_per_jottem(db, [m.mediaId for m in rijen])
    return [
        jottem_jsonld(db, media,
                      partners=[p for p in per_jottem.get(media.mediaId, [])
                                if p in gepubliceerd])
        for media in rijen
    ]


def naar_graaf(documenten: list[dict] | dict) -> Graph:
    graaf = Graph()
    lijst = documenten if isinstance(documenten, list) else [documenten]
    for doc in lijst:
        # de documenten dragen zelf een lokale context (@vocab plus de prefixen), dus
        # rdflib hoeft niets op te halen. Die context niet overschrijven: dan zou een
        # prefix als dcterms verdwijnen en werd dcterms:relation een IRI met schema
        # "dcterms" in plaats van een Dublin Core-predicaat.
        lokaal = doc
        if isinstance(doc.get("@context"), str):
            lokaal = {**doc, "@context": {"@vocab": "https://schema.org/"}}
        graaf.parse(data=json.dumps(lokaal), format="json-ld")
    graaf.bind("schema", "https://schema.org/")
    graaf.bind("dcterms", "http://purl.org/dc/terms/")
    return graaf


def serialiseer(documenten: list[dict] | dict, formaat: str) -> bytes:
    """formaat: turtle | nt | xml"""
    return naar_graaf(documenten).serialize(format=formaat, encoding="utf-8")
