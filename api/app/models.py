"""Datamodel conform het ERD in de data-architectuur (design.iotm.nl).

De database is de leidende bron voor rollen (GebruikerRol); het Gebeurtenislog is tevens
de transactional outbox (payload + verwerktOp), zie de systeemarchitectuur.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def nu() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Rol(str, enum.Enum):
    platformbeheerder = "platformbeheerder"
    organisatiebeheerder = "organisatiebeheerder"
    moderator = "moderator"


class MediaStatus(str, enum.Enum):
    nieuw = "nieuw"
    goedgekeurd = "goedgekeurd"
    afgekeurd = "afgekeurd"
    gedepubliceerd = "gedepubliceerd"


class Toestemming(str, enum.Enum):
    nvt = "nvt"          # geen herkenbare personen gedetecteerd
    ja = "ja"            # toestemmingsverklaring afgelegd
    nee = "nee"          # uploader diende bewust in zonder verklaring (vlag voor moderator)


class Organisatie(Base):
    __tablename__ = "organisatie"

    organisatieId: Mapped[int] = mapped_column(Integer, primary_key=True)
    naam: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    beschrijving: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(String(400))
    favicon: Mapped[str | None] = mapped_column(String(400))
    logo: Mapped[str | None] = mapped_column(String(400))
    kleurPrimair: Mapped[str | None] = mapped_column(String(9))
    kleurSecundair: Mapped[str | None] = mapped_column(String(9))
    kleurAchtergrond: Mapped[str | None] = mapped_column(String(9))
    naan: Mapped[str | None] = mapped_column(String(20))  # gereserveerd voor de ARK-fase

    projecten: Mapped[list["Project"]] = relationship(back_populates="organisatie")


class Project(Base):
    __tablename__ = "project"

    projectId: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisatieId: Mapped[int] = mapped_column(ForeignKey("organisatie.organisatieId"))
    naam: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), index=True)
    beschrijving: Mapped[str | None] = mapped_column(Text)
    oproep: Mapped[str | None] = mapped_column(Text)
    periode: Mapped[str | None] = mapped_column(String(80))
    afbeelding: Mapped[str | None] = mapped_column(String(400))
    datasetLicentie: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="actief")  # actief | afgerond
    terminologiebronnen: Mapped[list | None] = mapped_column(JSON, default=list)
    # ingeschakelde verrijkingen (V-1): lijst van sleutels uit app.verrijkingen;
    # None = alle MVP-verrijkingen aan (de standaard)
    verrijkingen: Mapped[list | None] = mapped_column(JSON)
    datasetAangemeld: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # NDE Datasetregister

    organisatie: Mapped[Organisatie] = relationship(back_populates="projecten")

    __table_args__ = (UniqueConstraint("organisatieId", "slug"),)


class Gebruiker(Base):
    __tablename__ = "gebruiker"

    gebruikersId: Mapped[int] = mapped_column(Integer, primary_key=True)
    sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    # niet-raadbare publieke identiteit, gebruikt als creator-IRI (urn:uuid:...) in annotaties
    publiekeId: Mapped[uuid.UUID] = mapped_column(unique=True, index=True, default=uuid.uuid4)
    # geheim token voor de uitschakellink in attenderingsmails (werkt zonder inloggen);
    # bewust een ander uuid dan publiekeId, want die is publiek zichtbaar in annotaties
    mailToken: Mapped[uuid.UUID] = mapped_column(unique=True, index=True, default=uuid.uuid4)
    naam: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    afbeelding: Mapped[str | None] = mapped_column(String(400))
    naamPubliek: Mapped[bool] = mapped_column(Boolean, default=True)
    attenderingen: Mapped[bool] = mapped_column(Boolean, default=True)
    creatieDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)


class GebruikerRol(Base):
    """Leidende bron voor autorisatie; Authentik doet uitsluitend authenticatie."""
    __tablename__ = "gebruiker_rol"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gebruikersId: Mapped[int] = mapped_column(ForeignKey("gebruiker.gebruikersId"))
    organisatieId: Mapped[int | None] = mapped_column(ForeignKey("organisatie.organisatieId"))
    rol: Mapped[Rol] = mapped_column(Enum(Rol, name="rol"))

    __table_args__ = (UniqueConstraint("gebruikersId", "organisatieId", "rol"),)


class Media(Base):
    __tablename__ = "media"

    mediaId: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisatieId: Mapped[int] = mapped_column(ForeignKey("organisatie.organisatieId"))
    projectId: Mapped[uuid.UUID] = mapped_column(ForeignKey("project.projectId"))
    uploaderId: Mapped[int] = mapped_column(ForeignKey("gebruiker.gebruikersId"))
    titel: Mapped[str] = mapped_column(String(300))
    beschrijving: Mapped[str | None] = mapped_column(Text)
    genre: Mapped[str | None] = mapped_column(String(80))          # CHT-waardelijst
    licentie: Mapped[str | None] = mapped_column(String(200))      # bevestigde projectlicentie
    # herkomst van het beeld: upload (S3-origineel), iiif (externe beeldbank met
    # IIIF-manifest/info.json) of url (directe foto-URL); extern = alleen verwijzing
    bron: Mapped[str] = mapped_column(String(20), default="upload")
    bronUrl: Mapped[str | None] = mapped_column(String(1000))          # manifest-/info.json-/foto-URL
    externeIiifService: Mapped[str | None] = mapped_column(String(500))  # image service-basis
    objectKey: Mapped[str | None] = mapped_column(String(500))     # sleutel in bucket originals (alleen upload)
    mimeType: Mapped[str | None] = mapped_column(String(100))
    breedte: Mapped[int | None] = mapped_column(Integer)
    hoogte: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[MediaStatus] = mapped_column(Enum(MediaStatus, name="media_status"), default=MediaStatus.nieuw, index=True)
    afkeurReden: Mapped[str | None] = mapped_column(Text)
    herkenbaar: Mapped[bool | None] = mapped_column(Boolean)       # Herkenbaar API-signaal
    herkenbaarScore: Mapped[float | None] = mapped_column(Float)
    toestemming: Mapped[Toestemming] = mapped_column(Enum(Toestemming, name="toestemming"), default=Toestemming.nvt)
    creatieDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)
    publicatieDatum: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    wijzigingsDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu, onupdate=nu)

    metadataRijen: Mapped[list["MediaMetadata"]] = relationship(back_populates="media")


class MediaMetadata(Base):
    """Vrije metadata-rijen (adres, jaren, geo-speld als lat/lon, archiefbron, ...)."""
    __tablename__ = "media_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mediaId: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.mediaId"))
    veld: Mapped[str] = mapped_column(String(80), index=True)
    waarde: Mapped[str] = mapped_column(Text)

    media: Mapped[Media] = relationship(back_populates="metadataRijen")


class Favoriet(Base):
    __tablename__ = "favoriet"

    favorietId: Mapped[int] = mapped_column(Integer, primary_key=True)
    gebruikersId: Mapped[int] = mapped_column(ForeignKey("gebruiker.gebruikersId"))
    mediaId: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.mediaId"))
    creatieDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)

    __table_args__ = (UniqueConstraint("gebruikersId", "mediaId"),)


class Verwijderverzoek(Base):
    __tablename__ = "verwijderverzoek"

    verzoekId: Mapped[int] = mapped_column(Integer, primary_key=True)
    mediaId: Mapped[uuid.UUID] = mapped_column(ForeignKey("media.mediaId"))
    reden: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | gehonoreerd | afgewezen
    toelichting: Mapped[str | None] = mapped_column(Text)
    creatieDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)
    afhandelDatum: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Melding(Base):
    """Rapportage van een annotatie of reactie (spam/ongepast) door bezoekers."""
    __tablename__ = "melding"

    meldingId: Mapped[int] = mapped_column(Integer, primary_key=True)
    mediaId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media.mediaId"))
    annotatieIri: Mapped[str] = mapped_column(String(500))
    reden: Mapped[str] = mapped_column(String(40))
    toelichting: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="nieuw")  # nieuw | verwijderd | verborgen | afgewezen
    creatieDatum: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)
    afhandelDatum: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Gebeurtenislog(Base):
    """Gebeurtenislog en transactional outbox in één (zie systeemarchitectuur):
    mutaties schrijven hier binnen dezelfde transactie een regel; workers verwerken
    idempotent (mail, en later zoekindex/RDF/cache-purge) en zetten verwerktOp."""
    __tablename__ = "gebeurtenislog"

    logId: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(80), index=True)
    tijdstip: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=nu)
    organisatieId: Mapped[int | None] = mapped_column(ForeignKey("organisatie.organisatieId"))
    projectId: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("project.projectId"))
    gebruikersId: Mapped[int | None] = mapped_column(ForeignKey("gebruiker.gebruikersId"))
    payload: Mapped[dict | None] = mapped_column(JSON)
    verwerktOp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
