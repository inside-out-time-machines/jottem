"""Seed voor de ontwikkelomgeving: SAMH + project Smaak van Gouda + testrollen.

Draaien met: python -m app.seed
"""
from sqlalchemy import select

from .db import SessionLocal
from .models import Gebruiker, GebruikerRol, Organisatie, Project, Rol


def zet_beheerder_klaar(db, organisatie_id: int, email: str) -> None:
    """Uitnodigingspatroon: rij zonder sub; de eerste OIDC-login koppelt op e-mail."""
    beheerder = db.scalar(select(Gebruiker).where(Gebruiker.email == email))
    if not beheerder:
        beheerder = Gebruiker(sub=None, naam=email.split("@")[0], email=email)
        db.add(beheerder)
        db.flush()
    for rol in (Rol.platformbeheerder, Rol.organisatiebeheerder, Rol.moderator):
        bestaand = db.scalar(
            select(GebruikerRol).where(
                GebruikerRol.gebruikersId == beheerder.gebruikersId,
                GebruikerRol.rol == rol,
            )
        )
        if not bestaand:
            db.add(GebruikerRol(
                gebruikersId=beheerder.gebruikersId,
                organisatieId=None if rol == Rol.platformbeheerder else organisatie_id,
                rol=rol,
            ))
    db.commit()
    print(f"seed: rollen klaargezet voor {email}")


def seed() -> None:
    db = SessionLocal()
    try:
        bestaande = db.scalar(select(Organisatie).where(Organisatie.slug == "samh"))
        if bestaande:
            zet_beheerder_klaar(db, bestaande.organisatieId, "bob.coret@gmail.com")
            # testaccount platformbeheerder (dev-bypass) ook op bestaande omgevingen
            piet = db.scalar(select(Gebruiker).where(Gebruiker.sub == "dev-piet"))
            if not piet:
                piet = Gebruiker(sub="dev-piet", naam="Piet Platformbeheerder", email="piet@dev.local")
                db.add(piet)
                db.flush()
                db.add(GebruikerRol(gebruikersId=piet.gebruikersId, organisatieId=None, rol=Rol.platformbeheerder))
                db.commit()
                print("seed: dev-piet (platformbeheerder) toegevoegd")
            print("seed: basisdata al aanwezig")
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
        platformbeheerder = Gebruiker(sub="dev-piet", naam="Piet Platformbeheerder", email="piet@dev.local")
        db.add_all([moderator, beheerder, uploader, platformbeheerder])
        db.flush()
        db.add_all([
            GebruikerRol(gebruikersId=moderator.gebruikersId, organisatieId=samh.organisatieId, rol=Rol.moderator),
            GebruikerRol(gebruikersId=beheerder.gebruikersId, organisatieId=samh.organisatieId, rol=Rol.organisatiebeheerder),
            GebruikerRol(gebruikersId=platformbeheerder.gebruikersId, organisatieId=None, rol=Rol.platformbeheerder),
        ])
        db.commit()
        print(f"seed: organisatie '{samh.naam}' + project '{project.naam}' + 3 testaccounts")
        zet_beheerder_klaar(db, samh.organisatieId, "bob.coret@gmail.com")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
