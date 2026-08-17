"""Externe fotobronnen: Media.bron/bronUrl/externeIiifService, objectKey optioneel
(beeldbank-permalinks met IIIF en directe foto-URL's; alleen verwijzing, geen kopie).

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("media", sa.Column("bron", sa.String(20), nullable=False, server_default="upload"))
    op.add_column("media", sa.Column("bronUrl", sa.String(1000), nullable=True))
    op.add_column("media", sa.Column("externeIiifService", sa.String(500), nullable=True))
    op.alter_column("media", "objectKey", nullable=True)


def downgrade() -> None:
    op.alter_column("media", "objectKey", nullable=False)
    op.drop_column("media", "externeIiifService")
    op.drop_column("media", "bronUrl")
    op.drop_column("media", "bron")
