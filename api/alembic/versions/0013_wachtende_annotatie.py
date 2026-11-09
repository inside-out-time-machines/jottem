"""Wachtende annotaties: vlak-annotaties bij jottems met herkenbare personen die eerst door
een moderator worden vrijgegeven (MO-7 in het ontwerp).

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wachtende_annotatie",
        sa.Column("wachtendeAnnotatieId", sa.Integer(), primary_key=True),
        sa.Column("mediaId", sa.Uuid(), sa.ForeignKey("media.mediaId"), nullable=False),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("annotatie", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="wachtend"),
        sa.Column("annotatieIri", sa.String(500), nullable=True),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=True),
        sa.Column("afhandelDatum", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_wachtende_annotatie_mediaId", "wachtende_annotatie", ["mediaId"])


def downgrade() -> None:
    op.drop_index("ix_wachtende_annotatie_mediaId", table_name="wachtende_annotatie")
    op.drop_table("wachtende_annotatie")
