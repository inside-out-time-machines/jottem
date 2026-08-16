"""Initieel schema: het volledige ERD uit de data-architectuur.

Revision ID: 0001
Revises:
Create Date: 2026-08-16
"""
from alembic import op

from app.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
