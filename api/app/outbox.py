"""Gebeurtenislog als transactional outbox (zie systeemarchitectuur).

log() wordt aangeroepen BINNEN de transactie van de mutatie zelf; de worker verwerkt
onverwerkte regels idempotent en zet verwerktOp.
"""
import uuid

from sqlalchemy.orm import Session

from .models import Gebeurtenislog


def log(
    db: Session,
    type_: str,
    *,
    organisatie_id: int | None = None,
    project_id: uuid.UUID | None = None,
    gebruikers_id: int | None = None,
    payload: dict | None = None,
) -> Gebeurtenislog:
    regel = Gebeurtenislog(
        type=type_,
        organisatieId=organisatie_id,
        projectId=project_id,
        gebruikersId=gebruikers_id,
        payload=payload or {},
    )
    db.add(regel)
    return regel
