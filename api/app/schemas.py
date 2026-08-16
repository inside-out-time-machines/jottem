import uuid
from datetime import datetime

from pydantic import BaseModel, Field

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
    project: str
    metadata: dict[str, str]
    afbeeldingUrl: str | None
    iiifService: str | None = None      # IIIF Image API-basis zodra het derivaat er is
    iiifManifest: str | None = None
    publicatieDatum: datetime | None
    wijzigingsDatum: datetime
