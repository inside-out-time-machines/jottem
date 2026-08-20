"""Koppeling tussen twee jottems die hetzelfde object tonen.

De nieuwe verrijking "zelfde object, andere foto" leidt niet tot een annotatie maar tot
een nieuwe jottem plus een relatie tussen de twee. Die relatie staat hier, in de database:
dat is de bron van waarheid waaruit de linking-annotatie en dcterms:relation in de RDF
worden afgeleid (V-9 in het verrijkingenhoofdstuk). Eén rij per koppeling; beide
richtingen worden bij het lezen samengevoegd, vandaar een index op allebei de kolommen.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-20
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_relatie",
        sa.Column("relatieId", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("bronMediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("doelMediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("aard", sa.String(length=40), nullable=False),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("bronMediaId", "doelMediaId", "aard"),
    )
    op.create_index("ix_media_relatie_bron", "media_relatie", ["bronMediaId"])
    op.create_index("ix_media_relatie_doel", "media_relatie", ["doelMediaId"])


def downgrade() -> None:
    op.drop_index("ix_media_relatie_doel", table_name="media_relatie")
    op.drop_index("ix_media_relatie_bron", table_name="media_relatie")
    op.drop_table("media_relatie")
