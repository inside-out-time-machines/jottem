"""Celery-worker: verwerkt de Gebeurtenislog-outbox idempotent (zie systeemarchitectuur).

Celery beat pollt elke 10 seconden onverwerkte regels; per regel wordt (nu) de mail
verstuurd en verwerktOp gezet. Latere iteraties haken hier de zoekindex-, RDF- en
cache-purge-synchronisatie aan, plus de nachtelijke reconciliatiejob.
"""
import uuid

from celery import Celery
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .mail import basis_context, verstuur
from .models import Gebeurtenislog, nu

celery = Celery("jottem", broker=settings().valkey_url, backend=None)
celery.conf.beat_schedule = {
    "verwerk-outbox": {"task": "app.worker.verwerk_outbox", "schedule": 10.0},
}
celery.conf.timezone = "Europe/Amsterdam"


@celery.task(name="app.worker.verwerk_outbox")
def verwerk_outbox() -> int:
    """Verwerk onverwerkte outbox-regels; retourneert het aantal verwerkte regels."""
    db = SessionLocal()
    verwerkt = 0
    try:
        regels = db.scalars(
            select(Gebeurtenislog)
            .where(Gebeurtenislog.verwerktOp.is_(None))
            .order_by(Gebeurtenislog.logId)
            .limit(50)
            .with_for_update(skip_locked=True)
        ).all()
        for regel in regels:
            payload = regel.payload or {}
            # 1. derivaat (idempotent) - vóór de mail, zodat een falende beeldbewerking
            #    geen dubbele mails veroorzaakt bij een retry
            if regel.type == "jottem.goedgekeurd" and payload.get("mediaId"):
                from .derivaten import maak_derivaat
                maak_derivaat(uuid.UUID(payload["mediaId"]))
            # 2. mail
            mail = payload.get("mail")
            if mail:
                context = basis_context(db, regel.organisatieId, regel.projectId)
                context.update(mail.get("context", {}))
                verstuur(mail["template"], mail["aan"], context)
            regel.verwerktOp = nu()
            verwerkt += 1
        db.commit()
    finally:
        db.close()
    return verwerkt
