"""Uploadwijzen per project: Project.uploadWijzen (JSON-lijst met sleutels uit
UPLOAD_WIJZEN; NULL = alle wijzen aan, de standaard).

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("uploadWijzen", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("project", "uploadWijzen")
