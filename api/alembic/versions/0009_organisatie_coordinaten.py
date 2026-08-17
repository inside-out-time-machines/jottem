"""Coördinaten bij de organisatieplaats: opgehaald bij de GeoNames-URI en gebruikt
als startpunt van de kaarten (standpunt van de fotograaf, speld bij het uploaden).
Afgeleide data, dus niet bewerkbaar in de GUI; vullen gebeurt met `python -m app.geo`.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organisatie", sa.Column("spatialLat", sa.Float(), nullable=True))
    op.add_column("organisatie", sa.Column("spatialLon", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("organisatie", "spatialLon")
    op.drop_column("organisatie", "spatialLat")
