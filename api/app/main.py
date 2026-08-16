"""Jottem backend-API (FastAPI) - EUPL-1.2, zie LICENSE in de repowortel."""
import redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import s3
from .config import settings
from .db import engine
from .routers import jottem, mijn, moderatie, organisatiebeheer, upload

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

app.include_router(upload.router)
app.include_router(organisatiebeheer.router)
app.include_router(moderatie.router)
app.include_router(jottem.router)
app.include_router(mijn.router)


@app.get("/healthz", tags=["Systeem"])
async def healthz():
    status: dict[str, str] = {}
    try:
        with engine.connect() as verbinding:
            verbinding.execute(text("SELECT 1"))
        status["database"] = "ok"
    except Exception as fout:  # noqa: BLE001 - health rapporteert, faalt niet
        status["database"] = f"fout: {fout}"
    try:
        redis.Redis.from_url(settings().valkey_url).ping()
        status["valkey"] = "ok"
    except Exception as fout:  # noqa: BLE001
        status["valkey"] = f"fout: {fout}"
    try:
        s3.intern().head_bucket(Bucket=settings().s3_bucket_originals)
        status["s3"] = "ok"
    except Exception as fout:  # noqa: BLE001
        status["s3"] = f"fout: {fout}"
    gezond = all(w == "ok" for w in status.values())
    return {"status": "ok" if gezond else "degraded", "componenten": status}
