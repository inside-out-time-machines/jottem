"""Project.creatieDatum voor schema:dateCreated in de datasetbeschrijving.

Backfill voor bestaande projecten: het project.aangemaakt-moment uit het
Gebeurtenislog, anders de vroegste media-upload, anders nu.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=True))
    op.execute("""
        UPDATE project SET "creatieDatum" = COALESCE(
            (SELECT MIN(tijdstip) FROM gebeurtenislog
             WHERE gebeurtenislog."projectId" = project."projectId"
               AND gebeurtenislog.type = 'project.aangemaakt'),
            (SELECT MIN("creatieDatum") FROM media
             WHERE media."projectId" = project."projectId"),
            NOW()
        )
    """)
    op.alter_column("project", "creatieDatum", nullable=False)


def downgrade() -> None:
    op.drop_column("project", "creatieDatum")
