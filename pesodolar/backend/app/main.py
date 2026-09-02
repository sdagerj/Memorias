"""PesoDólar API — Monitor FX Colombia

Endpoints:
  GET  /api/dashboard          — todos los datos en una llamada
  GET  /api/trm/today          — TRM del día
  GET  /api/trm/history        — histórico TRM
  GET  /api/forward/           — curva forward estándar
  POST /api/forward/calculate  — forward con parámetros custom
  GET  /api/rates/sofr         — SOFR vigente
  GET  /api/rates/ibr          — IBR vigente
  GET  /api/rates/banrep/projection — proyección BanRep
  GET  /api/rates/usura        — tasa de usura + proyección
  POST /api/admin/ingest       — forzar ingesta manual
"""

import logging
from contextlib import asynccontextmanager
from datetime import date
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from .database import init_db, get_db
from .models import TRM, SOFR
from .schemas import DashboardResponse, TRMOut
from .routers import trm, forward, rates
from .scheduler import start_scheduler, stop_scheduler, ingestar_todo
from .services.calculator import calc_all_tenors
from .schemas import ForwardResponse, ForwardTenor
from .config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Base de datos inicializada")
    # Ingesta inicial si la DB está vacía
    await ingestar_todo()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="PesoDólar API",
    description="Monitor de tasa de cambio COP/USD, forwards y tasas de referencia Colombia",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trm.router, prefix="/api")
app.include_router(forward.router, prefix="/api")
app.include_router(rates.router, prefix="/api")


@app.get("/api/dashboard", response_model=DashboardResponse, tags=["Dashboard"])
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    """
    Endpoint principal — devuelve todos los datos necesarios para el dashboard
    en una sola llamada, minimizando round-trips del frontend.
    """
    # Últimas dos TRM para calcular variación diaria
    trm_rows = (await db.execute(
        select(TRM).order_by(desc(TRM.fecha)).limit(2)
    )).scalars().all()

    sofr_row = (await db.execute(
        select(SOFR).order_by(desc(SOFR.fecha)).limit(1)
    )).scalar_one_or_none()

    trm_hoy = trm_rows[0] if trm_rows else None
    trm_ayer = trm_rows[1] if len(trm_rows) > 1 else None

    variacion_diaria = None
    variacion_diaria_pct = None
    if trm_hoy and trm_ayer:
        variacion_diaria = round(trm_hoy.valor - trm_ayer.valor, 2)
        variacion_diaria_pct = round((trm_hoy.valor / trm_ayer.valor - 1) * 100, 4)

    variacion_ytd = None
    if trm_hoy:
        variacion_ytd = round((trm_hoy.valor / settings.trm_dic_2025 - 1) * 100, 4)

    r_usd = sofr_row.valor if sofr_row else 4.33
    r_cop = settings.ibr_overnight
    spot = trm_hoy.valor if trm_hoy else None

    forward_data = None
    if spot:
        tenores = calc_all_tenors(spot, r_cop, r_usd)
        forward_data = ForwardResponse(
            fecha=date.today(),
            spot=spot,
            r_cop=r_cop,
            r_usd=r_usd,
            tenores=[ForwardTenor(**t) for t in tenores],
        )

    return DashboardResponse(
        trm_hoy=TRMOut.model_validate(trm_hoy) if trm_hoy else None,
        trm_ayer=TRMOut.model_validate(trm_ayer) if trm_ayer else None,
        variacion_diaria=variacion_diaria,
        variacion_diaria_pct=variacion_diaria_pct,
        variacion_ytd_pct=variacion_ytd,
        banrep_rate=settings.banrep_rate,
        ibr_overnight=r_cop,
        sofr=r_usd,
        diferencial_tasas=round(r_cop - r_usd, 4),
        forward=forward_data,
        usura_vigente=32.44,
    )


@app.post("/api/admin/ingest", tags=["Admin"])
async def force_ingest():
    """Fuerza una ingesta manual inmediata (útil para pruebas o días festivos)."""
    await ingestar_todo()
    return {"status": "ok", "message": "Ingesta completada"}


@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}
