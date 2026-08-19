"""Beginschema van Jottem: bevroren momentopname.

Deze migratie riep oorspronkelijk `Base.metadata.create_all()` aan. Een lege database
kreeg daardoor meteen het *huidige* model, waarna migratie 0002 omviel op een kolom die al
bestond: een verse installatie en elk herstel uit back-up liepen daarop vast. De
opdrachten hieronder zijn daarom een bevroren weergave van het schema zoals het bij deze
revisie was; alles wat later kwam staat in 0002 en verder.

Revision ID: 0001
Revises:
Create Date: 2026-04-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gebruiker",
        sa.Column("gebruikersId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("sub", sa.String(255), nullable=True),
        sa.Column("naam", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("afbeelding", sa.String(400), nullable=True),
        sa.Column("naamPubliek", sa.Boolean(), nullable=False),
        sa.Column("attenderingen", sa.Boolean(), nullable=False),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_gebruiker_sub", "gebruiker", ["sub"], unique=True)
    op.create_index("ix_gebruiker_email", "gebruiker", ["email"], unique=True)
    op.create_table(
        "organisatie",
        sa.Column("organisatieId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("naam", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("beschrijving", sa.Text(), nullable=True),
        sa.Column("website", sa.String(400), nullable=True),
        sa.Column("favicon", sa.String(400), nullable=True),
        sa.Column("logo", sa.String(400), nullable=True),
        sa.Column("kleurPrimair", sa.String(9), nullable=True),
        sa.Column("kleurSecundair", sa.String(9), nullable=True),
        sa.Column("kleurAchtergrond", sa.String(9), nullable=True),
        sa.Column("naan", sa.String(20), nullable=True),
    )
    op.create_index("ix_organisatie_slug", "organisatie", ["slug"], unique=True)
    op.create_table(
        "gebruiker_rol",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("organisatieId", sa.Integer(), sa.ForeignKey("organisatie.organisatieId"), nullable=True),
        sa.Column("rol", sa.Enum("platformbeheerder", "organisatiebeheerder", "moderator", name="rol"), nullable=False),
        sa.UniqueConstraint("gebruikersId", "organisatieId", "rol"),
    )
    op.create_table(
        "project",
        sa.Column("projectId", sa.Uuid(), nullable=False, primary_key=True),
        sa.Column("organisatieId", sa.Integer(), sa.ForeignKey("organisatie.organisatieId"), nullable=False),
        sa.Column("naam", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("beschrijving", sa.Text(), nullable=True),
        sa.Column("oproep", sa.Text(), nullable=True),
        sa.Column("periode", sa.String(80), nullable=True),
        sa.Column("afbeelding", sa.String(400), nullable=True),
        sa.Column("datasetLicentie", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("terminologiebronnen", sa.JSON(), nullable=True),
        sa.UniqueConstraint("organisatieId", "slug"),
    )
    op.create_index("ix_project_slug", "project", ["slug"], unique=False)
    op.create_table(
        "gebeurtenislog",
        sa.Column("logId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("tijdstip", sa.DateTime(timezone=True), nullable=False),
        sa.Column("organisatieId", sa.Integer(), sa.ForeignKey("organisatie.organisatieId"), nullable=True),
        sa.Column("projectId", sa.Uuid(), sa.ForeignKey("project.projectId"), nullable=True),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("verwerktOp", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_gebeurtenislog_verwerktOp", "gebeurtenislog", ["verwerktOp"], unique=False)
    op.create_index("ix_gebeurtenislog_type", "gebeurtenislog", ["type"], unique=False)
    op.create_table(
        "media",
        sa.Column("mediaId", sa.Uuid(), nullable=False, primary_key=True),
        sa.Column("organisatieId", sa.Integer(), sa.ForeignKey("organisatie.organisatieId"), nullable=False),
        sa.Column("projectId", sa.Uuid(), sa.ForeignKey("project.projectId"), nullable=False),
        sa.Column("uploaderId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("titel", sa.String(300), nullable=False),
        sa.Column("beschrijving", sa.Text(), nullable=True),
        sa.Column("genre", sa.String(80), nullable=True),
        sa.Column("licentie", sa.String(200), nullable=True),
        sa.Column("objectKey", sa.String(500), nullable=False),
        sa.Column("mimeType", sa.String(100), nullable=True),
        sa.Column("breedte", sa.Integer(), nullable=True),
        sa.Column("hoogte", sa.Integer(), nullable=True),
        sa.Column("status", sa.Enum("nieuw", "goedgekeurd", "afgekeurd", "gedepubliceerd", name="media_status"), nullable=False),
        sa.Column("afkeurReden", sa.Text(), nullable=True),
        sa.Column("herkenbaar", sa.Boolean(), nullable=True),
        sa.Column("herkenbaarScore", sa.Float(), nullable=True),
        sa.Column("toestemming", sa.Enum("nvt", "ja", "nee", name="toestemming"), nullable=False),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
        sa.Column("publicatieDatum", sa.DateTime(timezone=True), nullable=True),
        sa.Column("wijzigingsDatum", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_media_status", "media", ["status"], unique=False)
    op.create_table(
        "favoriet",
        sa.Column("favorietId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("mediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("gebruikersId", "mediaId"),
    )
    op.create_table(
        "media_metadata",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("mediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("veld", sa.String(80), nullable=False),
        sa.Column("waarde", sa.Text(), nullable=False),
    )
    op.create_index("ix_media_metadata_veld", "media_metadata", ["veld"], unique=False)
    op.create_table(
        "melding",
        sa.Column("meldingId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("mediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=True),
        sa.Column("annotatieIri", sa.String(500), nullable=False),
        sa.Column("reden", sa.String(40), nullable=False),
        sa.Column("toelichting", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
        sa.Column("afhandelDatum", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "verwijderverzoek",
        sa.Column("verzoekId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("mediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("reden", sa.Text(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("toelichting", sa.Text(), nullable=True),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
        sa.Column("afhandelDatum", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("verwijderverzoek")
    op.drop_table("melding")
    op.drop_table("media_metadata")
    op.drop_table("favoriet")
    op.drop_table("media")
    op.drop_table("gebeurtenislog")
    op.drop_table("project")
    op.drop_table("gebruiker_rol")
    op.drop_table("organisatie")
    op.drop_table("gebruiker")
    # create_table maakte de enum-typen aan; die gaan hier weer weg
    sa.Enum(name="media_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="toestemming").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="rol").drop(op.get_bind(), checkfirst=True)
