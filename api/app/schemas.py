import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

TOEGESTANE_TYPES = {"image/jpeg", "image/png", "image/tiff"}  # MVP: JPG/PNG/TIFF (PDF/audio fase 2)
MAX_BESTAND_MB = 50


class UploadUrlVraag(BaseModel):
    bestandsnaam: str
    contentType: str
    grootte: int = Field(gt=0, le=MAX_BESTAND_MB * 1024 * 1024)


class UploadUrlAntwoord(BaseModel):
    mediaId: uuid.UUID
    uploadUrl: str
    objectKey: str


class ExterneBronVraag(BaseModel):
    soort: str = Field(pattern="^(beeldbank|url)$")
    url: str = Field(min_length=8, max_length=1000)


class JottemIndienen(BaseModel):
    mediaId: uuid.UUID
    projectId: uuid.UUID
    titel: str = Field(min_length=1, max_length=300)
    beschrijving: str | None = None
    genre: str | None = None
    licentieBevestigd: bool = Field(description="Uploader bevestigt de projectlicentie")
    steekwoorden: list[str] = []
    metadata: dict[str, str] = {}     # adres, jaarVan, jaarTot, lat, lon, ...
    toestemming: str | None = None    # "ja" of "nee" wanneer herkenbaar gemeld is
    externeBron: ExterneBronVraag | None = None   # i.p.v. een geupload bestand


class JottemKort(BaseModel):
    mediaId: uuid.UUID
    titel: str
    status: str
    genre: str | None
    creatieDatum: datetime
    afkeurReden: str | None = None
    duurzameUrl: str | None = None
    herkenbaar: bool | None = None      # Herkenbaar API-signaal (None = niet bepaald)
    toestemming: str | None = None      # nvt | ja | nee


class ProjectIn(BaseModel):
    naam: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern="^[a-z0-9-]+$")
    beschrijving: str | None = None
    oproep: str | None = None
    periode: str | None = None
    afbeelding: str | None = None          # S3-sleutel in de thumbs-bucket
    datasetLicentie: str | None = None
    status: str = Field(default="actief", pattern="^(actief|afgerond)$")
    terminologiebronnen: list[str] = []
    # ingeschakelde verrijkingen (V-1); None = alle MVP-verrijkingen aan
    verrijkingen: list[str] | None = None
    # ingeschakelde uploadwijzen; None = alle wijzen aan, minimaal één verplicht
    uploadWijzen: list[str] | None = None

    @field_validator("uploadWijzen")
    @classmethod
    def _upload_wijzen_geldig(cls, waarde: list[str] | None) -> list[str] | None:
        from .models import UPLOAD_WIJZEN
        if waarde is None:
            return None
        onbekend = [w for w in waarde if w not in UPLOAD_WIJZEN]
        if onbekend:
            raise ValueError(f"Onbekende uploadwijze: {', '.join(onbekend)}")
        if not waarde:
            raise ValueError("Minimaal één uploadwijze moet aan staan")
        return waarde


class ProjectUit(ProjectIn):
    projectId: uuid.UUID
    organisatieSlug: str
    afbeeldingUrl: str | None = None
    datasetAangemeld: datetime | None = None
    aantalJottems: int = 0


class OrganisatieIn(BaseModel):
    naam: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern="^[a-z0-9-]+$")
    beschrijving: str | None = None
    website: str | None = None
    kleurPrimair: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    kleurSecundair: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    kleurAchtergrond: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    logo: str | None = None      # S3-sleutel in de thumbs-bucket (huisstijl/<slug>/...)
    favicon: str | None = None


class OrganisatieUit(OrganisatieIn):
    organisatieId: int
    logoUrl: str | None = None
    faviconUrl: str | None = None


class AfbeeldingUploadVraag(BaseModel):
    bestandsnaam: str
    contentType: str = Field(pattern="^image/")


class HuisstijlUploadVraag(AfbeeldingUploadVraag):
    soort: str = Field(pattern="^(logo|favicon)$")


class UitnodigingIn(BaseModel):
    naam: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=320)
    rol: str = Field(pattern="^(organisatiebeheerder|moderator)$")


class GebruikerRolUit(BaseModel):
    gebruikersId: int
    naam: str
    email: str
    rol: str
    gekoppeld: bool              # False zolang de uitgenodigde nog niet heeft ingelogd


class HerkenbaarCheckVraag(BaseModel):
    mediaId: uuid.UUID


class HerkenbaarCheckAntwoord(BaseModel):
    herkenbaar: bool | None             # None = dienst niet beschikbaar
    betrouwbaarheid: float | None


class ModeratieBesluit(BaseModel):
    besluit: str = Field(pattern="^(goedgekeurd|afgekeurd)$")
    reden: str | None = None


class JottemDetail(BaseModel):
    mediaId: uuid.UUID
    titel: str
    beschrijving: str | None
    genre: str | None
    licentie: str | None
    status: str
    organisatie: str
    organisatieSlug: str
    project: str
    projectSlug: str
    projectId: uuid.UUID
    metadata: dict[str, str]
    afbeeldingUrl: str | None
    bron: str = "upload"                # upload | iiif | url
    bronUrl: str | None = None          # permalink/manifest of foto-URL bij externe bron
    iiifService: str | None = None      # IIIF Image API-basis zodra het derivaat er is
    iiifManifest: str | None = None
    publicatieDatum: datetime | None
    wijzigingsDatum: datetime
    annotatiesUrl: str | None = None    # publieke AnnoRepo-container (W3C)
    canvas: str | None = None           # canvas-IRI voor vlak-annotaties
    verrijkingen: list["VerrijkingUit"] = []   # ingeschakelde CTA's van het project (V-2)


class VerrijkingUit(BaseModel):
    sleutel: str
    label: str
    cta: str
    motivation: str
    doel: str                            # heel | vlak


class JottemTegel(BaseModel):
    """Eén jottem in het publieke projectoverzicht."""
    mediaId: uuid.UUID
    titel: str
    thumbnailUrl: str | None
    publicatieDatum: datetime | None


class ProjectPubliek(BaseModel):
    projectId: uuid.UUID
    naam: str
    slug: str
    organisatieSlug: str
    organisatieNaam: str
    kleurPrimair: str | None
    logoUrl: str | None
    beschrijving: str | None
    oproep: str | None
    periode: str | None
    datasetLicentie: str | None
    afbeeldingUrl: str | None
    aantalJottems: int
    jottems: list[JottemTegel]
    pagina: int
    paginas: int


class OrganisatiePubliek(BaseModel):
    naam: str
    slug: str
    beschrijving: str | None
    website: str | None
    kleurPrimair: str | None
    kleurAchtergrond: str | None
    logoUrl: str | None
    projecten: list[dict]                # naam, slug, oproep, afbeeldingUrl, aantalJottems


class MeldingIn(BaseModel):
    reden: str = Field(pattern="^(spam|reclame|ongepast|onjuist|anders)$")
    toelichting: str | None = Field(default=None, max_length=2000)


class MeldingUit(BaseModel):
    meldingId: int
    mediaId: uuid.UUID | None
    annotatieIri: str
    reden: str
    toelichting: str | None
    status: str
    creatieDatum: datetime
    annotatie: dict | None = None        # inhoud uit AnnoRepo (voor de moderator)


class MeldingBesluit(BaseModel):
    besluit: str = Field(pattern="^(verwijderd|verborgen|afgewezen)$")
    toelichting: str | None = None
