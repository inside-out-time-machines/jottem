"""Publisher-contact: Organisatie.email (publiek e-mailadres in de datasetbeschrijving,
verplicht te vullen via het beheer).

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organisatie", sa.Column("email", sa.String(320), nullable=True))


def downgrade() -> None:
    op.drop_column("organisatie", "email")
