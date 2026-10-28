"""Besloten projecten: Project.zichtbaarheid (openbaar | besloten, standaard openbaar) en
de ledenadministratie project_lid (OB-7/OB-8 in het ontwerp).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-28
"""
import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("zichtbaarheid", sa.String(20), nullable=False,
                                       server_default="openbaar"))
    op.create_table(
        "project_lid",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("projectId", sa.Uuid(), sa.ForeignKey("project.projectId"), nullable=False),
        sa.Column("gebruikersId", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=False),
        sa.Column("uitgenodigdDoor", sa.Integer(), sa.ForeignKey("gebruiker.gebruikersId"), nullable=True),
        sa.Column("creatieDatum", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("projectId", "gebruikersId"),
    )
    op.create_index("ix_project_lid_projectId", "project_lid", ["projectId"])
    op.create_index("ix_project_lid_gebruikersId", "project_lid", ["gebruikersId"])


def downgrade() -> None:
    op.drop_index("ix_project_lid_gebruikersId", table_name="project_lid")
    op.drop_index("ix_project_lid_projectId", table_name="project_lid")
    op.drop_table("project_lid")
    op.drop_column("project", "zichtbaarheid")
