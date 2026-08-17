"""Optionele publisher-identifier (bijv. ISIL/KvK) en organisatieplaats voor
schema:spatialCoverage (GeoNames via het NDE Termennetwerk); beide op
organisatieniveau, alleen door de platformbeheerder te bewerken.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organisatie", sa.Column("identifier", sa.String(200), nullable=True))
    op.add_column("organisatie", sa.Column("spatialUri", sa.String(400), nullable=True))
    op.add_column("organisatie", sa.Column("spatialNaam", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("organisatie", "spatialNaam")
    op.drop_column("organisatie", "spatialUri")
    op.drop_column("organisatie", "identifier")
