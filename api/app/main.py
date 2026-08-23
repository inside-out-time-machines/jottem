"""Jottem backend-API (FastAPI) - EUPL-1.2, zie LICENSE in de repowortel."""
import redis
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import s3
from .config import settings
from .db import engine
from .routers import (
    annotaties, dataset, jottem, mijn, moderatie, ns, opendata, organisatiebeheer,
    projectbeheer, publiek, termennetwerk, upload,
)

# De dev-bypass (X-Dev-Sub) omzeilt authenticatie volledig. Buiten een dev-omgeving mag
# de API daar niet mee starten: liever hard falen dan stilzwijgend openstaan.
if settings().dev_auth and settings().omgeving != "dev":
    raise RuntimeError(
        "JOTTEM_DEV_AUTH staat aan terwijl JOTTEM_OMGEVING niet 'dev' is; "
        "de dev-bypass is dan een authenticatie-omweg. Zet dev_auth uit."
    )

app = FastAPI(
    title="Jottem API",
    version="0.1.0",
    description="Backend van het Jottem-platform (MVP-fundament). "
                "Volgt de beheer-API uit het ontwerp; zie design.iotm.nl.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings().publieke_basis_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Open data is voor iedereen: IIIF-manifests en -collections, W3C-annotaties, RDF,
# RSS en de datacatalogus moeten door externe viewers (Universal Viewer, Mirador)
# en harvesters vanuit de browser op te halen zijn. De IIIF-specificatie schrijft
# daarvoor Access-Control-Allow-Origin: * voor; de overige endpoints blijven via de
# CORSMiddleware hierboven beperkt tot de eigen frontend.
OPEN_DATA_EINDEN = ("/annotations", "/activity-stream", "/rss", "/datacatalog", ".nt.gz")


def _is_open_data(pad: str) -> bool:
    # /ns/ hoort er nadrukkelijk bij: een JSON-LD-verwerker in de browser dereferencet de
    # naamsruimte en de frames, en loopt zonder deze regel op CORS stuk terwijl curl 200 geeft
    return ("/iiif/" in pad or pad.endswith(OPEN_DATA_EINDEN)
            or pad.startswith(("/jottem/", "/ns/")) or pad == "/organisaties")


@app.middleware("http")
async def open_data_cors(request: Request, call_next):
    # bij een preflight telt de methode die de browser wil gebruiken: beheeracties
    # (PUT/POST/DELETE, ook op /jottem/-paden) horen bij de CORSMiddleware hierboven,
    # die ze alleen voor de eigen frontend toestaat
    doel = (request.headers.get("access-control-request-method", "").upper()
            if request.method == "OPTIONS" else request.method)
    if doel not in ("GET", "HEAD", "OPTIONS", "") or not _is_open_data(request.url.path):
        return await call_next(request)
    if request.method == "OPTIONS":
        # preflight zelf beantwoorden, zodat ook viewers die met extra headers
        # fetchen (en dus preflighten) niet op de origin-lijst stuklopen
        return Response(status_code=204, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": request.headers.get(
                "access-control-request-headers", "*"),
            "Access-Control-Max-Age": "600",
        })
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    # `*` en allow-credentials sluiten elkaar uit; open data heeft geen credentials nodig
    if "access-control-allow-credentials" in response.headers:
        del response.headers["Access-Control-Allow-Credentials"]
    return response

app.include_router(upload.router)
app.include_router(organisatiebeheer.router)
app.include_router(projectbeheer.router)
app.include_router(termennetwerk.router)
app.include_router(dataset.router)
app.include_router(moderatie.router)
app.include_router(jottem.router)
app.include_router(mijn.router)
app.include_router(publiek.router)
app.include_router(annotaties.router)
app.include_router(opendata.router)
app.include_router(ns.router)


@app.get("/healthz", tags=["Systeem"])
async def healthz():
    """Publiek bereikbaar, dus alleen ok/fout per component.

    De uitzonderingstekst noemt interne hostnamen, poorten en drivergegevens; die hoort in
    het logboek, niet in het antwoord.
    """
    status: dict[str, str] = {}
    try:
        with engine.connect() as verbinding:
            verbinding.execute(text("SELECT 1"))
        status["database"] = "ok"
    except Exception as fout:  # noqa: BLE001 - health rapporteert, faalt niet
        print(f"healthz: database niet bereikbaar: {fout}")
        status["database"] = "fout"
    try:
        redis.Redis.from_url(settings().valkey_url).ping()
        status["valkey"] = "ok"
    except Exception as fout:  # noqa: BLE001
        print(f"healthz: valkey niet bereikbaar: {fout}")
        status["valkey"] = "fout"
    try:
        s3.intern().head_bucket(Bucket=settings().s3_bucket_originals)
        status["s3"] = "ok"
    except Exception as fout:  # noqa: BLE001
        print(f"healthz: object storage niet bereikbaar: {fout}")
        status["s3"] = "fout"
    gezond = all(w == "ok" for w in status.values())
    return {"status": "ok" if gezond else "degraded", "componenten": status}
