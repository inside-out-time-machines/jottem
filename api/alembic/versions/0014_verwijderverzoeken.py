"""Verwijderverzoeken-flow: soort per verzoek, statussen depubliceren/wissen, en de
wislijst van gewiste jottems (MO-5, BE-4 in het ontwerp).

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("verwijderverzoek", sa.Column("soort", sa.String(30), nullable=False,
                                                server_default="anders"))
    op.create_index("ix_verwijderverzoek_mediaId", "verwijderverzoek", ["mediaId"])
    op.create_table(
        "wislijst",
        sa.Column("mediaId", sa.Uuid(), primary_key=True),
        sa.Column("gewistOp", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("wislijst")
    op.drop_index("ix_verwijderverzoek_mediaId", table_name="verwijderverzoek")
    op.drop_column("verwijderverzoek", "soort")
