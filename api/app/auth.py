"""Authenticatie en autorisatie.

Authentik (OIDC) doet uitsluitend authenticatie; de database (GebruikerRol) is de leidende
bron voor rollen. Deze middleware valideert per request het access-token (JWKS), koppelt de
`sub` aan een Gebruiker-rij en laadt de rollen, kort gecachet in Valkey (TTL, met
invalidatie bij rolwijziging). Voor beheer-/moderatie-endpoints wordt via `amr` een sterke
factor (TOTP of passkey) geëist. Zie de systeemarchitectuur.

Dev-bypass: alleen met JOTTEM_DEV_AUTH=1 accepteert de API de headers X-Dev-Sub,
X-Dev-Naam en X-Dev-Email (voor smoke-tests zonder browserflow). De bypass levert géén
sterke factor: hij passeert de amr-poort alleen zolang dev_auth aanstaat, en de API
weigert te starten als dat buiten een dev-omgeving gebeurt (zie main.py).
"""
import json
from dataclasses import dataclass, field

import jwt
import redis
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Gebruiker, GebruikerRol, Rol

_valkey = redis.Redis.from_url(settings().valkey_url, decode_responses=True)
_jwks_client: jwt.PyJWKClient | None = None

STERKE_FACTOREN = {"mfa", "otp", "totp", "webauthn", "hwk", "swk"}


@dataclass
class Principal:
    gebruiker: Gebruiker
    rollen: list[dict] = field(default_factory=list)  # [{"rol": ..., "organisatieId": ...}]
    amr: list[str] = field(default_factory=list)

    def heeft_rol(self, rol: Rol, organisatie_id: int | None = None) -> bool:
        for r in self.rollen:
            if r["rol"] == Rol.platformbeheerder.value:
                return True
            if r["rol"] == rol.value and (organisatie_id is None or r["organisatieId"] == organisatie_id):
                return True
        return False


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(
            settings().oidc_issuer.rstrip("/") + "/jwks/", cache_keys=True
        )
    return _jwks_client


def _rollen_cache_key(gebruikers_id: int) -> str:
    return f"rollen:{gebruikers_id}"


def rollen_van(db: Session, gebruiker: Gebruiker) -> list[dict]:
    """Rollen uit de database, met korte Valkey-cache (TTL uit config)."""
    sleutel = _rollen_cache_key(gebruiker.gebruikersId)
    try:
        gecached = _valkey.get(sleutel)
        if gecached is not None:
            return json.loads(gecached)
    except redis.RedisError:
        pass
    rollen = [
        {"rol": r.rol.value, "organisatieId": r.organisatieId}
        for r in db.scalars(select(GebruikerRol).where(GebruikerRol.gebruikersId == gebruiker.gebruikersId))
    ]
    try:
        _valkey.setex(sleutel, settings().rollen_cache_ttl, json.dumps(rollen))
    except redis.RedisError:
        pass
    return rollen


def invalideer_rollen_cache(gebruikers_id: int) -> None:
    """Direct aan te roepen bij elke rolwijziging via de beheer-API."""
    try:
        _valkey.delete(_rollen_cache_key(gebruikers_id))
    except redis.RedisError:
        pass


def _gebruiker_voor_sub(db: Session, sub: str, naam: str, email: str,
                        email_geverifieerd: bool = False) -> Gebruiker:
    gebruiker = db.scalar(select(Gebruiker).where(Gebruiker.sub == sub))
    if gebruiker:
        return gebruiker
    # Eerste login: koppelen aan een uitgenodigde rij mag alleen als de identiteitsprovider
    # het e-mailadres heeft geverifieerd. Anders zou iemand die zich met andermans adres
    # registreert (bij een social login die het adres niet controleert) de klaargezette
    # rollen van die persoon erven.
    gebruiker = (db.scalar(select(Gebruiker).where(Gebruiker.email == email,
                                                   Gebruiker.sub.is_(None)))
                 if email_geverifieerd and email else None)
    if gebruiker:
        gebruiker.sub = sub
    else:
        gebruiker = Gebruiker(sub=sub, naam=naam or email, email=email)
        db.add(gebruiker)
    db.commit()
    return gebruiker


async def principal(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_dev_sub: str | None = Header(default=None),
    x_dev_naam: str | None = Header(default=None),
    x_dev_email: str | None = Header(default=None),
) -> Principal:
    cfg = settings()

    if cfg.dev_auth and x_dev_sub:
        # de bypass bestaat alleen voor de dev-omgeving; buiten dev weigert de API te starten
        # (zie main.py), dus hier hoeft alleen de amr-leugen weg: geen sterke factor cadeau
        gebruiker = _gebruiker_voor_sub(
            db, x_dev_sub, x_dev_naam or x_dev_sub,
            x_dev_email or f"{x_dev_sub}@dev.local", email_geverifieerd=True)
        return Principal(gebruiker=gebruiker, rollen=rollen_van(db, gebruiker),
                         amr=["dev-bypass"])

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Niet ingelogd")
    token = authorization.removeprefix("Bearer ")
    try:
        sleutel = _jwks().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, sleutel.key, algorithms=["RS256", "ES256"],
            audience=cfg.oidc_client_id, issuer=cfg.oidc_issuer,
        )
    except jwt.PyJWTError as fout:
        raise HTTPException(401, f"Ongeldig token: {fout}") from fout

    gebruiker = _gebruiker_voor_sub(
        db, claims["sub"], claims.get("name") or claims.get("preferred_username", ""),
        claims.get("email", ""), email_geverifieerd=claims.get("email_verified") is True,
    )
    return Principal(gebruiker=gebruiker, rollen=rollen_van(db, gebruiker), amr=claims.get("amr", []))


def eis_rol(rol: Rol):
    """Dependency-factory: eist de rol én (conform design) een sterke factor via amr.

    Bewust organisatie-onafhankelijk: de organisatie hoort bij de resource uit het pad en
    wordt door de route zelf gecontroleerd (`p.heeft_rol(rol, organisatie.organisatieId)`).
    Eerder kwam die uit de querystring, wat een aanroeper de indruk gaf dat de scope al
    was afgedwongen terwijl de client hem zelf koos.
    """
    async def controle(p: Principal = Depends(principal)) -> Principal:
        if not p.heeft_rol(rol):
            raise HTTPException(403, f"Rol '{rol.value}' vereist")
        cfg = settings()
        sterk = bool(set(a.lower() for a in p.amr) & STERKE_FACTOREN)
        # de dev-bypass levert bewust géén sterke factor meer; hij mag alleen in een
        # dev-omgeving de poort passeren, en daar weigert de API te starten als dat niet zo is
        if cfg.amr_verplicht and not sterk and not (cfg.dev_auth and "dev-bypass" in p.amr):
            raise HTTPException(403, "Sterke factor (TOTP of passkey) vereist voor deze rol")
        return p
    return controle
