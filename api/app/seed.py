"""Seed voor de ontwikkelomgeving: SAMH + project Smaak van Gouda + testrollen.

Draaien met: python -m app.seed
"""
from sqlalchemy import select

from .db import SessionLocal
from .models import Gebruiker, GebruikerRol, Organisatie, Project, Rol


def seed() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(Organisatie).where(Organisatie.slug == "samh")):
            print("seed: al aanwezig, niets te doen")
            return
        samh = Organisatie(
            naam="Streekarchief Midden-Holland",
            slug="samh",
            beschrijving="Het streekarchief voor Gouda en omgeving.",
            website="https://www.samh.nl/",
            kleurPrimair="#2f5d50",
        )
        db.add(samh)
        db.flush()
        project = Project(
            organisatieId=samh.organisatieId,
            naam="Smaak van Gouda",
            slug="smaak-van-gouda",
            beschrijving="Verhalen achter de verdwenen restaurants, cafés en snackbars van Gouda.",
            oproep="Heb je foto's, menukaarten of herinneringen aan een Goudse eetzaak? Deel ze!",
            datasetLicentie="https://creativecommons.org/licenses/by/4.0/",
            terminologiebronnen=["cht"],
        )
        db.add(project)

        # testaccounts voor de dev-bypass (JOTTEM_DEV_AUTH=1): sub = dev-<naam>
        moderator = Gebruiker(sub="dev-mona", naam="Mona Moderator", email="mona@dev.local")
        beheerder = Gebruiker(sub="dev-otto", naam="Otto Organisatiebeheerder", email="otto@dev.local")
        uploader = Gebruiker(sub="dev-anna", naam="Anna Uploader", email="anna@dev.local")
        db.add_all([moderator, beheerder, uploader])
        db.flush()
        db.add_all([
            GebruikerRol(gebruikersId=moderator.gebruikersId, organisatieId=samh.organisatieId, rol=Rol.moderator),
            GebruikerRol(gebruikersId=beheerder.gebruikersId, organisatieId=samh.organisatieId, rol=Rol.organisatiebeheerder),
        ])
        db.commit()
        print(f"seed: organisatie '{samh.naam}' + project '{project.naam}' + 3 testaccounts")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
