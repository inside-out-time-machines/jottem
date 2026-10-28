"""Schrijven naar Authentik: accounts aanmaken voor uitgenodigde projectleden (OB-8).

De uitnodigingsmail van een besloten project linkt naar de wachtwoord-vergeten-flow, en
die werkt alleen voor een bestaand account. Daarom maakt de API bij uitnodigen het
account aan (actief, zonder wachtwoord; de herstelflow zet het wachtwoord). Dit is de
enige plek waar de backend naar Authentik schrijft; autorisatie blijft in de database.
Fouten blokkeren de uitnodiging nooit: ze worden gelogd en in het Gebeurtenislog vermeld.
"""
import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)

# padcomponent in Authentik waaronder de via uitnodiging aangemaakte accounts staan
PAD = "jottem/uitgenodigd"


def _client() -> httpx.Client:
    cfg = settings()
    return httpx.Client(
        base_url=cfg.authentik_api_url.rstrip("/") + "/api/v3",
        headers={"Authorization": f"Bearer {cfg.authentik_api_token}",
                 "Accept": "application/json"},
        timeout=10.0,
    )


def zorg_voor_account(email: str, naam: str) -> str:
    """Zorgt dat er in Authentik een account op dit e-mailadres bestaat.

    Retourneert "bestond", "aangemaakt", "overgeslagen" (geen token geconfigureerd) of
    "mislukt" (met de reden in het logbestand).
    """
    if not settings().authentik_api_token:
        log.info("Authentik-token ontbreekt; geen account aangemaakt voor %s", email)
        return "overgeslagen"
    try:
        with _client() as client:
            antwoord = client.get("/core/users/", params={"email": email, "page_size": 1})
            antwoord.raise_for_status()
            if antwoord.json().get("pagination", {}).get("count", 0) > 0:
                return "bestond"
            antwoord = client.post("/core/users/", json={
                "username": email,
                "name": naam,
                "email": email,
                "is_active": True,
                "path": PAD,
                "attributes": {"bron": "jottem-uitnodiging"},
            })
            antwoord.raise_for_status()
            return "aangemaakt"
    except httpx.HTTPError as fout:
        log.warning("Authentik-account voor %s niet aangemaakt: %s", email, fout)
        return "mislukt"
