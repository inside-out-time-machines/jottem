"""Celery-worker: verwerkt de Gebeurtenislog-outbox idempotent (zie systeemarchitectuur).

Celery beat pollt elke 10 seconden onverwerkte regels; per regel wordt (nu) de mail
verstuurd en verwerktOp gezet. Daarnaast: een dagelijkse bundeltaak voor de
attenderingsmails (notificaties 10/11, max één mail per dag) en de naamsync naar de
annotatieserver bij een profielwijziging. Latere iteraties haken hier de zoekindex-,
RDF- en cache-purge-synchronisatie aan, plus de nachtelijke reconciliatiejob.
"""
import uuid
from datetime import datetime, timedelta, timezone

import redis
from celery import Celery
from celery.schedules import crontab
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
}
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
    # 2. mail
    mail = payload.get("mail")
    if mail:
        context = basis_context(db, regel.organisatieId, regel.projectId)
        context.update(mail.get("context", {}))
        verstuur(mail["template"], mail["aan"], context)
    # 3. naamsync: creator.name bijwerken in de annotatieserver (GE-2)
    if regel.type == "gebruiker-naam-gewijzigd" and regel.gebruikersId:
        sync_creator_naam(db, regel.gebruikersId)


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
            regel.pogingen = (regel.pogingen or 0) + 1
            try:
                _verwerk_regel(db, regel)
                regel.verwerktOp = nu()
                regel.laatsteFout = None
                verwerkt += 1
                db.commit()
            except Exception as fout:  # noqa: BLE001 - één regel mag de rij niet ophouden
                db.rollback()
                # de pogingenteller moet wél blijven staan, anders blijft hij eeuwig retryen
                db.execute(
                    update(Gebeurtenislog)
                    .where(Gebeurtenislog.logId == regel.logId)
                    .values(pogingen=(regel.pogingen or 1), laatsteFout=str(fout)[:2000])
                )
                db.commit()
                print(f"outbox: regel {regel.logId} ({regel.type}) mislukt "
                      f"(poging {regel.pogingen}/{MAX_POGINGEN}): {fout}")

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


def sync_creator_naam(db, gebruikers_id: int) -> int:
    """Werk creator.name bij in alle annotaties van een gebruiker in AnnoRepo,
    na een naam- of naamPubliek-wijziging (idempotent)."""
    from . import anno

    gebruiker = db.get(Gebruiker, gebruikers_id)
    if not gebruiker:
        return 0
    creator_iri = f"urn:uuid:{gebruiker.publiekeId}"
    naam = gebruiker.naam if gebruiker.naamPubliek else "Een deelnemer"
    media_ids = {
        (regel.payload or {}).get("mediaId")
        for regel in db.scalars(
            select(Gebeurtenislog).where(
                Gebeurtenislog.type == "annotatie-aangemaakt",
                Gebeurtenislog.gebruikersId == gebruikers_id,
            )
        )
    }
    bijgewerkt = 0
    for media_id in filter(None, media_ids):
        for annotatie in anno.alle_annotaties(media_id):
            if (annotatie.get("creator") or {}).get("id") != creator_iri:
                continue
            if annotatie["creator"].get("name") == naam:
                continue
            annotatie["creator"]["name"] = naam
            iri = annotatie["id"]
            annotatie.pop("id", None)
            try:
                anno.vervang_annotatie(iri, annotatie)
                bijgewerkt += 1
            except Exception:  # noqa: BLE001 - volgende run probeert opnieuw
                pass
    return bijgewerkt


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
