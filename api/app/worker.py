"""Celery-worker: verwerkt de Gebeurtenislog-outbox idempotent (zie systeemarchitectuur).

Celery beat pollt elke 10 seconden onverwerkte regels; per regel wordt (nu) de mail
verstuurd en verwerktOp gezet. Daarnaast: een dagelijkse bundeltaak voor de
attenderingsmails (notificaties 10/11, max één mail per dag) en de naamsync naar de
annotatieserver bij een profielwijziging. Latere iteraties haken hier de zoekindex-,
RDF-synchronisatie aan, plus de nachtelijke reconciliatiejob. De cache-purge van de
beeldketen loopt sinds de depublicatieroute mee in `_verwerk_regel`.
"""
import uuid
from datetime import datetime, timedelta, timezone

import redis
from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_ready
from sqlalchemy import select, update

from . import fuseki
from .config import settings
from .db import SessionLocal
from .mail import basis_context, verstuur
from .models import Gebeurtenislog, Gebruiker, Media, Project, nu

celery = Celery("jottem", broker=settings().valkey_url, backend=None)
celery.conf.beat_schedule = {
    "verwerk-outbox": {"task": "app.worker.verwerk_outbox", "schedule": 10.0},
    # attenderingen dagelijks bundelen (design: max één mail per dag), vooravond
    "attenderingen-bundel": {
        "task": "app.worker.verstuur_attenderingen",
        "schedule": crontab(hour=18, minute=0),
    },
    # annotatietellers voor de startpagina warm houden (die leest alleen uit de cache)
    "annotatietellingen": {
        "task": "app.worker.ververs_annotatietellingen",
        "schedule": 900.0,
    },
    # nachtelijke RDF-reconciliatie: alle projectgrafen herbouwen uit PostgreSQL
    # (reproduceerbaarheidsregel uit de data-architectuur)
    "rdf-hersync": {
        "task": "app.worker.hersync_rdf",
        "schedule": crontab(hour=4, minute=30),
    },
    # bewaartermijnen (requirements, privacy): volledige logpayloads 12 maanden, daarna
    # alleen type, tijdstip en id's; e-mailadres en reden van afgehandelde
    # verwijderverzoeken idem
    # moderatiedigest (mail 5, MO-4): één samenvatting per dag, alleen als er iets wacht
    "moderatiedigest": {
        "task": "app.worker.verstuur_moderatiedigest",
        "schedule": crontab(hour=8, minute=0),
    },
    "bewaartermijnen": {
        "task": "app.worker.pas_bewaartermijnen_toe",
        "schedule": crontab(hour=3, minute=30),
    },
}

BEWAARTERMIJN_DAGEN = 365
celery.conf.timezone = "Europe/Amsterdam"

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)


# Boven dit aantal pogingen laten we een regel los: hij blijft in het log staan met de
# laatste fout, zodat hij zichtbaar is in de monitoring, maar hij houdt de rij niet op.
MAX_POGINGEN = 5


def _verwerk_regel(db, regel: Gebeurtenislog) -> None:
    """De eigenlijke afhandeling van één outbox-regel."""
    payload = regel.payload or {}
    # 1. derivaat (idempotent) - vóór de mail, zodat een falende beeldbewerking
    #    geen dubbele mails veroorzaakt bij een retry
    if regel.type == "jottem.goedgekeurd" and payload.get("mediaId"):
        from .derivaten import maak_derivaat
        maak_derivaat(uuid.UUID(payload["mediaId"]))
        # de (lege) annotatiecontainer aanmaken: de containerlink wordt bij
        # publicatie al geadverteerd (detail, IIIF-manifest) en mag geen 404 zijn
        maak_annotatiecontainer(db, payload["mediaId"])
    # 1b. depublicatie: het beeld uit de keten halen. Alleen de status omzetten liet
    #     het derivaat in de bucket en de kopie in Varnish staan, zodat de foto na een
    #     gehonoreerd verwijderverzoek nog dagenlang zichtbaar was (MO-5)
    if regel.type == "jottem.gedepubliceerd" and payload.get("mediaId"):
        from .beeldcache import schoon_beeldketen
        schoon_beeldketen(uuid.UUID(payload["mediaId"]))
    # 1c. wissen (MO-5): origineel, derivaat en annotaties weg, daarna de payloads van de
    #     inmiddels verwerkte regels over deze jottem inkorten (zie app/wissen.py)
    if regel.type == "jottem.gewist" and payload.get("mediaId"):
        from . import wissen
        media_id = uuid.UUID(payload["mediaId"])
        print(f"wissen: mediaId={media_id} {wissen.wis_opslag(media_id)}")
        wissen.schoon_logpayloads(db, media_id, behalve=regel.logId)
    # koppelingen (V-9): de afgeleide linking-annotaties gelijktrekken met de database,
    # aan beide kanten, zowel bij publiceren als bij depubliceren
    if regel.type in ("jottem.goedgekeurd", "jottem.gedepubliceerd") and payload.get("mediaId"):
        from . import relaties
        relaties.sync_beide_kanten(db, uuid.UUID(payload["mediaId"]))
    # 2. mail
    mail = payload.get("mail")
    if mail:
        context = basis_context(db, regel.organisatieId, regel.projectId)
        context.update(mail.get("context", {}))
        verstuur(mail["template"], mail["aan"], context)
    # 3. (vervallen) naamsync: de annotatieserver bevat geen namen meer; die worden bij het
    #    lezen ingevuld (app/namen.py). "gebruiker-naam-gewijzigd" blijft als logregel.


@worker_ready.connect
def _bij_start(**_):
    """Direct na het starten de tellers vullen: anders toont de startpagina tot de
    eerste geplande ronde 0 annotaties."""
    ververs_annotatietellingen.delay()


@celery.task(name="app.worker.ververs_annotatietellingen")
def ververs_annotatietellingen() -> int:
    """Vul de Valkey-cache met het aantal annotaties per actief project.

    De publieke startpagina leest alleen uit die cache: één bezoeker met een koude cache
    zou anders een HTTP-aanroep per gepubliceerde jottem naar de annotatieserver
    ontketenen. Hier gebeurt dat gecontroleerd, één keer per kwartier.
    """
    from . import anno
    from .models import Media, MediaStatus

    db = SessionLocal()
    bijgewerkt = 0
    try:
        for project in db.scalars(select(Project).where(Project.status == "actief")):
            media_ids = db.scalars(
                select(Media.mediaId).where(Media.projectId == project.projectId,
                                            Media.status == MediaStatus.goedgekeurd)
            ).all()
            try:
                totaal = sum(len(anno.alle_annotaties(str(m))) for m in media_ids)
                _valkey.setex(f"annotaties:aantal:{project.projectId}", 1800, totaal)
                bijgewerkt += 1
            except Exception as fout:  # noqa: BLE001 - een teller is geen kritiek pad
                print(f"annotatietelling mislukt voor {project.projectId}: {fout}")
    finally:
        db.close()
    return bijgewerkt


@celery.task(name="app.worker.verwerk_outbox")
def verwerk_outbox() -> int:
    """Verwerk onverwerkte outbox-regels; retourneert het aantal verwerkte regels.

    Per regel afhandelen en committen. Eerder ging de hele batch in één transactie: één
    onverwerkbare regel (verwijderde media, tijdelijk onbereikbare SMTP) brak de lus vóór
    `verwerktOp` was gezet, waarna dezelfde regels elke tien seconden opnieuw kwamen en
    er nooit meer mail uitging.
    """
    db = SessionLocal()
    verwerkt = 0
    try:
        regels = db.scalars(
            select(Gebeurtenislog)
            .where(Gebeurtenislog.verwerktOp.is_(None),
                   Gebeurtenislog.pogingen < MAX_POGINGEN)
            .order_by(Gebeurtenislog.logId)
            .limit(50)
            .with_for_update(skip_locked=True)
        ).all()
        for regel in regels:
            # het opgehoogde getal vóór de poging vastleggen: na een rollback leest de
            # sessie de oude waarde terug, en dan blijft de teller eeuwig op 1 staan
            log_id, poging = regel.logId, (regel.pogingen or 0) + 1
            regel.pogingen = poging
            try:
                _verwerk_regel(db, regel)
                regel.verwerktOp = nu()
                regel.laatsteFout = None
                verwerkt += 1
                db.commit()
            except Exception as fout:  # noqa: BLE001 - één regel mag de rij niet ophouden
                db.rollback()
                db.execute(
                    update(Gebeurtenislog)
                    .where(Gebeurtenislog.logId == log_id)
                    .values(pogingen=poging, laatsteFout=str(fout)[:2000])
                )
                db.commit()
                print(f"outbox: regel {log_id} ({regel.type}) mislukt "
                      f"(poging {poging}/{MAX_POGINGEN}): {fout}")

        # 4. RDF-sync: geraakte projectgrafen herbouwen (outbox-regel uit de
        #    data-architectuur; ook annotatiemutaties raken dateModified)
        geraakt = {
            regel.projectId for regel in regels
            if regel.projectId and regel.type.startswith(("jottem", "annotatie", "dataset"))
        }
        for project_id in geraakt:
            project = db.get(Project, project_id)
            if project:
                try:
                    fuseki.sync_project_graaf(db, project)
                except Exception:  # noqa: BLE001 - de nachtelijke hersync repareert
                    pass
    finally:
        db.close()
    return verwerkt


@celery.task(name="app.worker.hersync_rdf")
def hersync_rdf() -> int:
    """Herbouw alle projectgrafen in Fuseki uit PostgreSQL (nachtelijk) en zorg dat
    elke gepubliceerde jottem zijn annotatiecontainer heeft (vangnet)."""
    from .models import MediaStatus

    db = SessionLocal()
    aantal = 0
    try:
        for project in db.scalars(select(Project)):
            try:
                aantal += fuseki.sync_project_graaf(db, project)
            except Exception:  # noqa: BLE001
                pass
        for media_id in db.scalars(select(Media.mediaId).where(
                Media.status == MediaStatus.goedgekeurd)):
            maak_annotatiecontainer(db, str(media_id))
    finally:
        db.close()
    return aantal


@celery.task(name="app.worker.migreer_annotatiecontext")
def migreer_annotatiecontext() -> dict:
    """Zet de jottem-prefix in bestaande annotaties op de naamsruimte van deze omgeving.

    Eenmalig te draaien na een verhuizing van de naamsruimte of van het domein. Niet in de
    nachtelijke planning: dit is een gegevensmigratie, geen onderhoud.

    Elke annotatie wordt op haar eigen IRI gelezen en niet uit de containerlijst: daar
    heeft de annotatieserver `@context` al uit gehaald, en zo'n item terugschrijven is
    precies de fout die de naamsync ooit maakte (zie anno.vervang_annotatie).
    """
    from . import anno, ns
    from .models import Media

    goed = anno.context()
    db = SessionLocal()
    geteld = {"bekeken": 0, "bijgewerkt": 0, "mislukt": 0}
    try:
        for media_id in db.scalars(select(Media.mediaId)):
            for kort in anno.alle_annotaties(str(media_id)):
                iri = kort.get("id")
                if not iri:
                    continue
                geteld["bekeken"] += 1
                try:
                    volledig = anno.haal_annotatie(iri)
                    if volledig.get("@context") == goed:
                        continue
                    zonder_id = {s: w for s, w in volledig.items() if s != "id"}
                    # de context is hier aanwezig maar verouderd, en vervang_annotatie
                    # vult alleen een ontbrekende context aan; dus expliciet meegeven
                    anno.vervang_annotatie(iri, {**zonder_id, "@context": goed})
                    geteld["bijgewerkt"] += 1
                except Exception as fout:  # noqa: BLE001 - één annotatie mag de rest niet ophouden
                    geteld["mislukt"] += 1
                    print(f"migratie: {iri} mislukt: {fout}")
    finally:
        db.close()
    # de aggregaties staan vijf minuten in de cache; zonder flush lijkt de migratie mislukt
    for sleutel in _valkey.scan_iter("annotaties:*"):
        _valkey.delete(sleutel)
    print(f"migratie naar {ns.prefix()}: {geteld}")
    return geteld


def maak_annotatiecontainer(db, media_id: str) -> None:
    """Best effort: bestaat de container niet, dan maakt de eerste annotatie hem alsnog."""
    import httpx

    from . import anno

    media = db.get(Media, uuid.UUID(media_id))
    if not media:
        return
    try:
        with httpx.Client(timeout=15) as client:
            anno.zorg_voor_container(client, media_id, f"Annotaties bij {media.titel}")
    except Exception:  # noqa: BLE001
        pass


@celery.task(name="app.worker.verstuur_attenderingen")
def verstuur_attenderingen() -> int:
    """Dagelijkse bundel van notificaties 10 (nieuwe annotatie/reactie op jouw jottem)
    en 11 (reactie op jouw annotatie); respecteert Gebruiker.attenderingen en levert de
    uitschakellink (mailToken) mee. Het venster loopt vanaf de vorige run (Valkey)."""
    db = SessionLocal()
    verstuurd = 0
    try:
        vorige = _valkey.get("attendering:laatste")
        sinds = (datetime.fromisoformat(vorige) if vorige
                 else datetime.now(timezone.utc) - timedelta(days=1))
        regels = db.scalars(
            select(Gebeurtenislog).where(
                Gebeurtenislog.type == "annotatie-aangemaakt",
                Gebeurtenislog.tijdstip > sinds,
            )
        ).all()

        # mail 10: per (uploader, jottem); mail 11: per (annotatiemaker, jottem)
        per_uploader: dict[tuple[int, str], int] = {}
        per_annoteerder: dict[tuple[int, str], int] = {}
        for regel in regels:
            payload = regel.payload or {}
            media_id = payload.get("mediaId")
            if not media_id:
                continue
            media = db.get(Media, uuid.UUID(media_id))
            if not media:
                continue
            if media.uploaderId != regel.gebruikersId:
                sleutel = (media.uploaderId, media_id)
                per_uploader[sleutel] = per_uploader.get(sleutel, 0) + 1
            doel = payload.get("doelGebruikersId")
            if doel and doel != regel.gebruikersId:
                sleutel = (doel, media_id)
                per_annoteerder[sleutel] = per_annoteerder.get(sleutel, 0) + 1

        def stuur(groep: dict[tuple[int, str], int], template: str) -> int:
            aantal_mails = 0
            for (gebruikers_id, media_id), aantal in groep.items():
                gebruiker = db.get(Gebruiker, gebruikers_id)
                media = db.get(Media, uuid.UUID(media_id))
                if not gebruiker or not media or not gebruiker.attenderingen:
                    continue
                context = basis_context(db, media.organisatieId, media.projectId)
                context.update({
                    "ontvangerNaam": gebruiker.naam,
                    "jottemTitel": media.titel,
                    "aantalNieuw": aantal,
                    "jottemUrl": f"{settings().publieke_basis_url}/jottem/{media_id}",
                    "annotatieUrl": f"{settings().publieke_basis_url}/jottem/{media_id}",
                    "uitschakelUrl": f"{settings().api_basis_url}/attenderingen/uit?token={gebruiker.mailToken}",
                })
                verstuur(template, gebruiker.email, context)
                aantal_mails += 1
            return aantal_mails

        verstuurd += stuur(per_uploader, "attendering-jottem")
        verstuurd += stuur(per_annoteerder, "attendering-annotatie")
        _valkey.set("attendering:laatste", datetime.now(timezone.utc).isoformat())
    finally:
        db.close()
    return verstuurd


@celery.task(name="app.worker.pas_bewaartermijnen_toe")
def pas_bewaartermijnen_toe() -> dict:
    """Kort logpayloads en verzoekgegevens in die ouder zijn dan de bewaartermijn."""
    from . import wissen
    from .models import Verwijderverzoek

    grens = nu() - timedelta(days=BEWAARTERMIJN_DAGEN)
    db = SessionLocal()
    geteld = {"logregels": 0, "verzoeken": 0}
    try:
        while True:
            regels = db.scalars(
                select(Gebeurtenislog).where(Gebeurtenislog.tijdstip < grens,
                                             Gebeurtenislog.verwerktOp.is_not(None))
                .order_by(Gebeurtenislog.logId).limit(500)
            ).all()
            te_doen = [r for r in regels if not (r.payload or {}).get("ingekort")]
            if not te_doen:
                break
            for regel in te_doen:
                regel.payload = wissen.kale_payload(regel.payload)
            geteld["logregels"] += len(te_doen)
            db.commit()
        for verzoek in db.scalars(select(Verwijderverzoek).where(
                Verwijderverzoek.status != "open", Verwijderverzoek.afhandelDatum < grens,
                Verwijderverzoek.email != "")):
            verzoek.email = ""
            verzoek.reden = "[ingekort na bewaartermijn]"
            geteld["verzoeken"] += 1
        db.commit()
    finally:
        db.close()
    return geteld


@celery.task(name="app.worker.herhaal_wislijst")
def herhaal_wislijst() -> dict:
    """Speel de wislijst opnieuw af. Verplicht na het terugzetten van een back-up: een
    back-up van vóór een wisbesluit brengt het gewiste materiaal anders terug.

    Handmatig: docker compose exec worker celery -A app.worker call app.worker.herhaal_wislijst
    """
    from . import wissen
    from .models import Wislijst

    db = SessionLocal()
    geteld = {"jottems": 0, "mislukt": 0}
    try:
        for regel in db.scalars(select(Wislijst)).all():
            media = db.get(Media, regel.mediaId)
            try:
                if media:
                    wissen.wis_database(db, media)
                    db.commit()
                wissen.wis_opslag(regel.mediaId)
                geteld["jottems"] += 1
            except Exception as fout:  # noqa: BLE001 - één jottem mag de rest niet ophouden
                db.rollback()
                geteld["mislukt"] += 1
                print(f"wislijst: {regel.mediaId} mislukt: {fout}")
    finally:
        db.close()
    return geteld


@celery.task(name="app.worker.verwijder_creator_namen")
def verwijder_creator_namen() -> dict:
    """Haal de namen uit bestaande annotaties (eenmalig, na de overstap op late binding).

    Elke annotatie wordt op haar eigen IRI gelezen en niet uit de containerlijst, om de
    context niet kwijt te raken (zie anno.vervang_annotatie en migreer_annotatiecontext).
    Handmatig: docker compose exec worker celery -A app.worker call app.worker.verwijder_creator_namen
    """
    from . import anno
    from .models import Media

    db = SessionLocal()
    geteld = {"bekeken": 0, "bijgewerkt": 0, "mislukt": 0}
    try:
        for media_id in db.scalars(select(Media.mediaId)):
            for kort in anno.alle_annotaties(str(media_id)):
                iri = kort.get("id")
                if not iri:
                    continue
                geteld["bekeken"] += 1
                try:
                    volledig = anno.haal_annotatie(iri)
                    creator = volledig.get("creator")
                    if not isinstance(creator, dict) or "name" not in creator:
                        continue
                    zonder = {s: w for s, w in volledig.items() if s != "id"}
                    zonder["creator"] = {k: v for k, v in creator.items() if k != "name"}
                    anno.vervang_annotatie(iri, zonder)
                    geteld["bijgewerkt"] += 1
                except Exception as fout:  # noqa: BLE001 - één annotatie mag de rest niet ophouden
                    geteld["mislukt"] += 1
                    print(f"creatornaam: {iri} mislukt: {fout}")
    finally:
        db.close()
    return geteld


ESCALATIE_DAGEN = 21   # verwijderverzoek open langer dan dit: ook naar de organisatiebeheerders


@celery.task(name="app.worker.verstuur_moderatiedigest")
def verstuur_moderatiedigest() -> int:
    """Mail 5 (MO-4): per organisatie een samenvatting van wat er wacht, aan de moderatoren.

    Staat een verwijderverzoek langer dan ESCALATIE_DAGEN open, dan krijgen ook de
    organisatiebeheerders de mail: de wettelijke termijn is 30 dagen. Via de outbox, zodat
    een tijdelijk onbereikbare mailserver de mail niet laat verdwijnen.
    """
    from sqlalchemy import func
    from .models import (GebruikerRol, MediaStatus, Melding, Organisatie, Rol,
                         Verwijderverzoek, WachtendeAnnotatie)
    from .outbox import log

    db = SessionLocal()
    verstuurd = 0
    try:
        for organisatie in db.scalars(select(Organisatie)).all():
            org = organisatie.organisatieId
            wachtend = db.execute(
                select(Media.titel, Project.naam, Media.creatieDatum)
                .join(Project, Media.projectId == Project.projectId)
                .where(Media.organisatieId == org, Media.status == MediaStatus.nieuw)
                .order_by(Media.creatieDatum)
            ).all()
            meldingen = db.scalar(select(func.count()).select_from(Melding).join(
                Media, Melding.mediaId == Media.mediaId).where(
                Media.organisatieId == org, Melding.status == "nieuw")) or 0
            verzoeken = db.execute(select(Verwijderverzoek.creatieDatum).join(
                Media, Verwijderverzoek.mediaId == Media.mediaId).where(
                Media.organisatieId == org, Verwijderverzoek.status == "open")).scalars().all()
            vlakken = db.scalar(select(func.count()).select_from(WachtendeAnnotatie).join(
                Media, WachtendeAnnotatie.mediaId == Media.mediaId).where(
                Media.organisatieId == org, WachtendeAnnotatie.status == "wachtend")) or 0
            if not (wachtend or meldingen or verzoeken or vlakken):
                continue
            oudste = (nu() - min(verzoeken)).days if verzoeken else 0
            escalatie = oudste > ESCALATIE_DAGEN
            rollen = [Rol.moderator] + ([Rol.organisatiebeheerder] if escalatie else [])
            ontvangers = {g.gebruikersId: g for g in db.scalars(
                select(Gebruiker).join(GebruikerRol,
                                       GebruikerRol.gebruikersId == Gebruiker.gebruikersId)
                .where(GebruikerRol.organisatieId == org, GebruikerRol.rol.in_(rollen)))}
            context = {
                "aantalWachtend": len(wachtend),
                "wachtrij": [{"titel": t, "projectNaam": p,
                              "ingediendOp": d.strftime("%d-%m-%Y")} for t, p, d in wachtend[:20]],
                "aantalMeldingen": meldingen,
                "aantalVerzoeken": len(verzoeken),
                "aantalVlakken": vlakken,
                "oudsteVerzoekDagen": oudste,
                "escalatie": escalatie,
                "wachtrijUrl": f"{settings().publieke_basis_url}/moderatie",
            }
            for gebruiker in ontvangers.values():
                if not gebruiker.email:
                    continue
                log(db, "moderatie.digest", organisatie_id=org, gebruikers_id=gebruiker.gebruikersId,
                    payload={"mail": {"template": "moderatie-digest", "aan": gebruiker.email,
                                      "context": context | {"ontvangerNaam": gebruiker.naam}}})
                verstuurd += 1
            db.commit()
    finally:
        db.close()
    return verstuurd
