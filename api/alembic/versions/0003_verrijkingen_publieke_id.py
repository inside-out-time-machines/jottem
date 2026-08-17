"""Annoteerfunctionaliteit: Project.verrijkingen (V-1) en Gebruiker.publiekeId
(niet-raadbare creator-identiteit voor W3C-annotaties).

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-17
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("verrijkingen", sa.JSON(), nullable=True))
    op.add_column("gebruiker", sa.Column("publiekeId", sa.Uuid(), nullable=True))
    op.add_column("gebruiker", sa.Column("mailToken", sa.Uuid(), nullable=True))
    # bestaande gebruikers krijgen elk eigen uuids
    verbinding = op.get_bind()
    for (gid,) in verbinding.execute(sa.text('SELECT "gebruikersId" FROM gebruiker')):
        verbinding.execute(
            sa.text('UPDATE gebruiker SET "publiekeId" = :pid, "mailToken" = :mid '
                    'WHERE "gebruikersId" = :gid'),
            {"pid": str(uuid.uuid4()), "mid": str(uuid.uuid4()), "gid": gid},
        )
    op.alter_column("gebruiker", "publiekeId", nullable=False)
    op.alter_column("gebruiker", "mailToken", nullable=False)
    op.create_index("ix_gebruiker_publiekeId", "gebruiker", ["publiekeId"], unique=True)
    op.create_index("ix_gebruiker_mailToken", "gebruiker", ["mailToken"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_gebruiker_mailToken", table_name="gebruiker")
    op.drop_index("ix_gebruiker_publiekeId", table_name="gebruiker")
    op.drop_column("gebruiker", "mailToken")
    op.drop_column("gebruiker", "publiekeId")
    op.drop_column("project", "verrijkingen")
