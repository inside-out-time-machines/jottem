import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

# Alleen http(s) in velden die als link of als RDF-identifier naar buiten gaan: een
# `javascript:`-URI belandt anders in de publieke annotatie, het IIIF-manifest en de RDF.
HTTP_URL = r"^https?://\S+$"

# Vrije metadata is invoer van de uploader en komt in de RDF terecht. Zonder grenzen
# breekt één ongeldige waarde (bijv. lat="abc") de dump, de datasetbeschrijving en de
# nachtelijke Fuseki-sync van het hele project.
MAX_METADATA_VELDEN = 40
MAX_METADATA_SLEUTEL = 60
MAX_METADATA_WAARDE = 2000
MAX_STEEKWOORDEN = 50

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
    url: str = Field(min_length=8, max_length=1000, pattern=HTTP_URL)


class JottemIndienen(BaseModel):
    mediaId: uuid.UUID
    projectId: uuid.UUID
    # koppeling aan een bestaande jottem die hetzelfde object toont (V-9); moet in
    # hetzelfde project staan en gepubliceerd zijn
    gerelateerdAan: uuid.UUID | None = None
    titel: str = Field(min_length=1, max_length=300)
    beschrijving: str | None = None
    genre: str | None = None
    licentieBevestigd: bool = Field(description="Uploader bevestigt de projectlicentie")
    steekwoorden: list[str] = Field(default=[], max_length=MAX_STEEKWOORDEN)
    metadata: dict[str, str] = {}     # adres, jaarVan, jaarTot, lat, lon, ...
    toestemming: str | None = None    # "ja" of "nee" wanneer herkenbaar gemeld is
    externeBron: ExterneBronVraag | None = None   # i.p.v. een geupload bestand

    @field_validator("metadata")
    @classmethod
    def _metadata_binnen_de_perken(cls, waarde: dict[str, str]) -> dict[str, str]:
        if len(waarde) > MAX_METADATA_VELDEN:
            raise ValueError(f"Maximaal {MAX_METADATA_VELDEN} metadatavelden")
        for sleutel, inhoud in waarde.items():
            if len(sleutel) > MAX_METADATA_SLEUTEL or len(inhoud) > MAX_METADATA_WAARDE:
                raise ValueError(f"Metadataveld '{sleutel[:20]}' is te lang")
        # lat/lon gaan als getal de RDF in; een onparsebare waarde zou daar pas klappen
        for veld in ("lat", "lon"):
            if veld in waarde:
                try:
                    getal = float(waarde[veld])
                except ValueError as fout:
                    raise ValueError(f"'{veld}' moet een getal zijn") from fout
                grens = 90 if veld == "lat" else 180
                if not -grens <= getal <= grens:
                    raise ValueError(f"'{veld}' valt buiten het bereik")
        # velden die als URI naar buiten gaan, moeten een echte http(s)-URL zijn
        for veld, inhoud in waarde.items():
            if veld.endswith("Uri") and inhoud and not inhoud.startswith(("http://", "https://")):
                raise ValueError(f"'{veld}' moet een http(s)-URL zijn")
        return waarde


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
    gerelateerdAanTitel: str | None = None   # gekoppeld aan een andere jottem (V-9)


class ProjectIn(BaseModel):
    naam: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern="^[a-z0-9-]+$")
    beschrijving: str | None = None
    oproep: str | None = None
    periode: str | None = None
    afbeelding: str | None = None          # S3-sleutel in de thumbs-bucket
    datasetLicentie: str | None = Field(default=None, max_length=200, pattern=HTTP_URL)
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
    website: str | None = Field(default=None, max_length=400, pattern=HTTP_URL)
    # publiek contactadres als publisher in de datasetbeschrijving (verplicht)
    email: str = Field(max_length=320, pattern=r"^\S+@\S+\.\S+$")
    # optionele organisatie-identificatie (bijv. ISIL of KvK-nummer)
    identifier: str | None = Field(default=None, max_length=200)
    # optionele plaats (GeoNames via het Termennetwerk) voor schema:spatialCoverage
    spatialUri: str | None = Field(default=None, max_length=400, pattern=HTTP_URL)
    spatialNaam: str | None = Field(default=None, max_length=200)
    kleurPrimair: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    kleurSecundair: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    kleurAchtergrond: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    logo: str | None = None      # S3-sleutel in de thumbs-bucket (huisstijl/<slug>/...)
    favicon: str | None = None


class OrganisatieUit(OrganisatieIn):
    organisatieId: int
    email: str | None = None    # bestaande organisaties kunnen nog leeg zijn
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


class BeeldVraag(BaseModel):
    """Verwijst naar één beeld: een geüpload origineel of een externe bron.

    Beide controles vóór het indienen (herkenbare personen en de suggesties) werken op
    hetzelfde beeld, en sinds de uploadflow ook voor een beeldbank-permalink en een
    foto-URL de volgorde doorloopt, moeten ze allebei kunnen kiezen.
    """
    mediaId: uuid.UUID | None = None
    externeBron: ExterneBronVraag | None = None

    @model_validator(mode="after")
    def eis_een_bron(self):
        if not self.mediaId and not self.externeBron:
            raise ValueError("geef een mediaId of een externeBron")
        return self


# oude naam, nog in gebruik als responsemodel-partner van /herkenbaar-check
HerkenbaarCheckVraag = BeeldVraag


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
    organisatieLogoUrl: str | None = None
    # plaats van de organisatie: startpunt voor de zichtveldkaart (standpunt fotograaf)
    organisatieLat: float | None = None
    organisatieLon: float | None = None
    # huisstijl van de organisatie: primair kleurt de annotaties, secundair de knoppen
    organisatieKleurPrimair: str | None = None
    organisatieKleurSecundair: str | None = None
    project: str
    projectSlug: str
    projectId: uuid.UUID
    metadata: dict[str, str]
    afbeeldingUrl: str | None
    thumbnailUrl: str | None = None      # kleine variant, o.a. voor lijstjes
    breedte: int | None = None          # afmetingen van het bronbeeld (o.a. voor og:image)
    hoogte: int | None = None
    bron: str = "upload"                # upload | iiif | url
    bronUrl: str | None = None          # permalink/manifest of foto-URL bij externe bron
    iiifService: str | None = None      # IIIF Image API-basis zodra het derivaat er is
    iiifManifest: str | None = None
    publicatieDatum: datetime | None
    wijzigingsDatum: datetime
    # inzender: naam en profielfoto alleen als die publiek mag (Gebruiker.naamPubliek)
    uploaderNaam: str | None = None
    uploaderAfbeeldingUrl: str | None = None
    annotatiesUrl: str | None = None    # publieke AnnoRepo-container (W3C)
    canvas: str | None = None           # canvas-IRI voor vlak-annotaties
    verrijkingen: list["VerrijkingUit"] = []   # ingeschakelde CTA's van het project (V-2)
    # jottems die hetzelfde object tonen (V-9); alleen gepubliceerde, beide richtingen
    gerelateerd: list["GerelateerdeJottem"] = []


class VerrijkingUit(BaseModel):
    sleutel: str
    label: str
    cta: str
    motivation: str
    doel: str                            # heel | vlak | upload


class SteekwoordSuggestie(BaseModel):
    label: str
    uri: str | None = None              # term-URI uit de CHT of de AAT
    score: float | None = None


class SuggestiesAntwoord(BaseModel):
    """Voorstellen bij het uploaden (V-10); alles mag leeg zijn."""
    titel: str | None = None
    genre: str | None = None
    steekwoorden: list[SteekwoordSuggestie] = []
    model: str | None = None            # welke modellen het voorstel maakten (V-6)


class GerelateerdeJottem(BaseModel):
    """Een jottem die hetzelfde object toont (V-9); getoond bij allebei de jottems."""
    mediaId: uuid.UUID
    titel: str
    thumbnailUrl: str | None = None
    url: str                              # duurzame link naar de gerelateerde jottem


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
    kleurSecundair: str | None = None
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
    kleurSecundair: str | None = None
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
