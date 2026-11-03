from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date

from ..database import get_db
from ..models import TRM, SOFR
from ..schemas import ForwardResponse, ForwardTenor, ForwardCalcRequest
from ..services.calculator import calc_all_tenors
from ..config import settings

router = APIRouter(prefix="/forward", tags=["Forward"])


@router.get("/", response_model=ForwardResponse)
async def get_forward_rates(db: AsyncSession = Depends(get_db)):
    """
    Curva forward COP/USD para plazos estándar (3M, 6M, 12M, 18M)
    usando la TRM spot más reciente e IBR/SOFR vigentes.
    """
    trm_row = (await db.execute(select(TRM).order_by(desc(TRM.fecha)).limit(1))).scalar_one_or_none()
    sofr_row = (await db.execute(select(SOFR).order_by(desc(SOFR.fecha)).limit(1))).scalar_one_or_none()

    spot = trm_row.valor if trm_row else 4300.0
    r_cop = settings.ibr_overnight
    r_usd = sofr_row.valor if sofr_row else 4.33

    tenores = calc_all_tenors(spot, r_cop, r_usd)

    return ForwardResponse(
        fecha=date.today(),
        spot=spot,
        r_cop=r_cop,
        r_usd=r_usd,
        tenores=[ForwardTenor(**t) for t in tenores],
    )


@router.post("/calculate", response_model=ForwardResponse)
async def calculate_forward(req: ForwardCalcRequest):
    """
    Calcula forwards con parámetros personalizados.
    Útil para simulaciones con distintos escenarios de tasas.
    """
    tenores = calc_all_tenors(req.spot, req.r_cop, req.r_usd, req.base)

    return ForwardResponse(
        fecha=date.today(),
        spot=req.spot,
        r_cop=req.r_cop,
        r_usd=req.r_usd,
        tenores=[ForwardTenor(**t) for t in tenores],
    )
