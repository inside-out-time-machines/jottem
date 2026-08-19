"""Outbox met pogingenteller en dood-brievenbus, plus de ontbrekende indexen.

Twee dingen die pas onder belasting pijn doen:
1. De outbox verwerkte een batch in één transactie zonder foutafhandeling per regel: één
   onverwerkbare regel blokkeerde alle mail, voor altijd. Met `pogingen` en `laatsteFout`
   kan de worker per regel falen, opnieuw proberen en uiteindelijk loslaten.
2. Elke listing filtert op `media.projectId` of `media.organisatieId`; PostgreSQL indexeert
   foreign keys niet automatisch, dus dat waren allemaal sequentiële scans.

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-19
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gebeurtenislog",
                  sa.Column("pogingen", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("gebeurtenislog", sa.Column("laatsteFout", sa.Text(), nullable=True))
    op.create_index("ix_media_project_status", "media", ["projectId", "status"])
    op.create_index("ix_media_organisatie_status", "media", ["organisatieId", "status"])
    op.create_index("ix_media_uploader", "media", ["uploaderId"])
    op.create_index("ix_media_metadata_media", "media_metadata", ["mediaId"])
    op.create_index("ix_gebruiker_rol_gebruiker", "gebruiker_rol", ["gebruikersId"])


def downgrade() -> None:
    op.drop_index("ix_gebruiker_rol_gebruiker", table_name="gebruiker_rol")
    op.drop_index("ix_media_metadata_media", table_name="media_metadata")
    op.drop_index("ix_media_uploader", table_name="media")
    op.drop_index("ix_media_organisatie_status", table_name="media")
    op.drop_index("ix_media_project_status", table_name="media")
    op.drop_column("gebeurtenislog", "laatsteFout")
    op.drop_column("gebeurtenislog", "pogingen")
