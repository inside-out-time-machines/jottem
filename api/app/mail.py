"""Mailversturing met de MJML/Jinja2-templates uit api/templates/mail.

Per notificatie drie sjablonen: nl/<slug>.subject.j2, nl/<slug>.txt.j2 en (gecompileerd
door build.sh) dist/nl/<slug>.html.j2. Verzonden als multipart/alternative.
"""
import smtplib
from email.message import EmailMessage
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from .config import settings
from .models import Organisatie, Project

TEMPLATES = Path(__file__).resolve().parent.parent / "templates" / "mail"

_omgeving = Environment(
    loader=FileSystemLoader([TEMPLATES / "nl", TEMPLATES / "dist" / "nl"]),
    autoescape=select_autoescape(["html", "j2"]),
)


def basis_context(db: Session, organisatie_id: int | None, project_id=None) -> dict:
    context: dict = {"platformUrl": settings().publieke_basis_url,
                     "organisatie": {"naam": "Jottem", "kleurPrimair": "#d85a30", "logoUrl": None}}
    if organisatie_id:
        organisatie = db.get(Organisatie, organisatie_id)
        if organisatie:
            context["organisatie"] = {
                "naam": organisatie.naam,
                "kleurPrimair": organisatie.kleurPrimair or "#d85a30",
                "logoUrl": organisatie.logo,
            }
    if project_id:
        project = db.get(Project, project_id)
        if project:
            context["projectNaam"] = project.naam
    return context


def verstuur(slug: str, aan: str, context: dict) -> None:
    cfg = settings()
    onderwerp = _omgeving.get_template(f"{slug}.subject.j2").render(**context).strip()
    tekst = _omgeving.get_template(f"{slug}.txt.j2").render(**context)

    bericht = EmailMessage()
    bericht["From"] = f'{context["organisatie"]["naam"]} <{cfg.mail_afzender}>'
    bericht["To"] = aan
    bericht["Subject"] = onderwerp
    bericht.set_content(tekst)
    try:
        html = _omgeving.get_template(f"{slug}.html.j2").render(**context)
        bericht.add_alternative(html, subtype="html")
    except Exception:  # noqa: BLE001 - zonder gebouwde dist volstaat de tekstversie
        pass

    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=15) as smtp:
        smtp.send_message(bericht)
