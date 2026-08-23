"""Configuratie via omgevingsvariabelen (.env buiten git, zie deploy/.env.example)."""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # basis
    omgeving: str = "dev"                      # dev | productie
    publieke_basis_url: str = "https://dev.iotm.nl"
    api_basis_url: str = "https://api.dev.iotm.nl"

    # database / cache
    # Geen bruikbare standaardwaarden voor credentials: een ontbrekende omgevingsvariabele
    # hoort de start te breken, niet stilletjes een zwakke waarde te gebruiken.
    database_url: str
    valkey_url: str = "redis://valkey:6379/0"

    # object storage (S3; tijdelijk MinIO, later externe dienst - zelfde protocol)
    s3_endpoint: str = "http://minio:9000"
    s3_endpoint_publiek: str = "https://s3.dev.iotm.nl"
    s3_access_key: str = "jottem"
    s3_secret_key: str
    s3_bucket_originals: str = "originals"
    s3_bucket_derivaten: str = "derivatives"
    s3_bucket_thumbs: str = "thumbs"

    # IIIF (Cantaloupe achter Varnish)
    iiif_basis_url: str = "https://iiif.dev.iotm.nl"

    # Herkenbaar API (interne container)
    herkenbaar_url: str = "http://herkenbaar:4050"
    # Suggesties API (interne container): titel, categorie en steekwoorden bij het
    # uploaden. Leeg betekent uit; dan stelt het platform niets voor (V-5).
    suggesties_url: str = ""

    # annotatieserver (AnnoRepo): intern schrijven met api-key, publiek lezen
    anno_url: str = "http://annorepo:8080"
    anno_basis_url: str = "https://anno.dev.iotm.nl"
    anno_api_key: str

    # RDF/SPARQL (Fuseki): intern schrijven, publiek alleen /sparql via Traefik
    fuseki_url: str = "http://fuseki:3030/ds"
    data_basis_url: str = "https://data.dev.iotm.nl"

    # authenticatie (Authentik OIDC)
    oidc_issuer: str = "https://auth.dev.iotm.nl/application/o/jottem/"
    oidc_client_id: str = "jottem-web"
    # e-mailadres dat bij een lege database platformbeheerder wordt (uitnodigingspatroon);
    # leeg = geen bootstrap. Stond eerder hardgecodeerd in seed.py en werd bij elke start
    # opnieuw gezet, waardoor een ingetrokken rol vanzelf terugkwam.
    bootstrap_beheerder: str = ""

    # dev-bypass: alleen actief als dev_auth=1; NOOIT in productie
    dev_auth: bool = False
    # sterke factor (amr) afdwingen voor beheer-/moderatierollen; alleen in dev tijdelijk
    # uitzetbaar zolang TOTP/passkey-enrollment in Authentik nog niet is ingericht
    amr_verplicht: bool = True

    # mail
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    mail_afzender: str = "noreply@iotm.nl"

    # autorisatie-cache
    rollen_cache_ttl: int = 60

    model_config = {"env_prefix": "JOTTEM_", "env_file": ".env", "extra": "ignore"}


@lru_cache
def settings() -> Settings:
    return Settings()
