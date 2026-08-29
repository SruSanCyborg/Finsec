"""Sirius Line Core API — FastAPI backend over Neon PostgreSQL.

The single source of truth. CLI, GUI, Web and Automation are all clients of
this API; none talk to the scan engine or the database directly.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load backend/.env BEFORE importing app modules: config.py reads env vars at
# import time (CLERK_SECRET_KEY, DATABASE_URL, ...), so this must run first.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core import db
from .core.config import API_V1_PREFIX, ALLOWED_ORIGINS
from .core.schema import SCHEMA_SQL
from .routers import findings, governance, meta, projects, reports, scans, workspace
from .seed import seed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sirius")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
    await seed()
    logger.info("sirius Core API ready (Neon connected)")
    yield
    await db.close_pool()


app = FastAPI(
    title="sirius Core API",
    version="0.4.0",
    description="Shared contract for all sirius surfaces (cli, gui, web, auto).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans.router, prefix=API_V1_PREFIX)
app.include_router(findings.router, prefix=API_V1_PREFIX)
app.include_router(governance.router, prefix=API_V1_PREFIX)
app.include_router(reports.router, prefix=API_V1_PREFIX)
app.include_router(projects.router, prefix=API_V1_PREFIX)
app.include_router(meta.router, prefix=API_V1_PREFIX)
app.include_router(meta.router, prefix="")  # /health + /healthz at root (CLI probes /healthz)
app.include_router(workspace.router, prefix=API_V1_PREFIX)


# CLI (packages/cli) probes GET /healthz at the origin root — alias it.
@app.get("/healthz")
async def healthz_root() -> dict:
    return await meta.health()


@app.get("/readyz")
async def readyz_root() -> dict:
    return await meta.health()


@app.get("/")
async def root() -> dict:
    return {
        "service": "sirius Core API",
        "docs": "/docs",
        "health": f"{API_V1_PREFIX}/healthz",
        "note": "CLI, GUI, Web and Automation are all clients of this API.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
