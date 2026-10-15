from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date

from ..database import get_db
from ..models import SOFR, IBR, UsuraRate
from ..schemas import SOFROut, IBROut, BanRepProjection, UsuraProjection
from ..services.calculator import calc_banrep_projection, calc_usura_projection
from ..config import settings

router = APIRouter(prefix="/rates", tags=["Tasas"])


@router.get("/sofr", response_model=SOFROut)
async def get_sofr(db: AsyncSession = Depends(get_db)):
    """SOFR más reciente disponible."""
    row = (await db.execute(select(SOFR).order_by(desc(SOFR.fecha)).limit(1))).scalar_one_or_none()
    if row:
        return row
    return SOFROut(fecha=date.today(), valor=settings.ibr_overnight - 4.29)


@router.get("/ibr", response_model=IBROut)
async def get_ibr(db: AsyncSession = Depends(get_db)):
    """IBR más reciente disponible."""
    row = (await db.execute(select(IBR).order_by(desc(IBR.fecha)).limit(1))).scalar_one_or_none()
    if row:
        return row
    return IBROut(
        fecha=date.today(),
        overnight=settings.ibr_overnight,
        un_mes=settings.ibr_overnight + 0.05,
        tres_meses=settings.ibr_overnight + 0.12,
        seis_meses=settings.ibr_overnight + 0.18,
        doce_meses=settings.ibr_overnight + 0.25,
    )


@router.get("/banrep/projection", response_model=BanRepProjection)
async def get_banrep_projection():
    """Proyección de tasa de intervención BanRep en 3 escenarios."""
    proyecciones = calc_banrep_projection(settings.banrep_rate)
    return BanRepProjection(
        tasa_actual=settings.banrep_rate,
        proyecciones=proyecciones,
    )


@router.get("/usura", response_model=UsuraProjection)
async def get_usura(db: AsyncSession = Depends(get_db)):
    """Tasa de usura vigente y proyección trimestral."""
    row = (await db.execute(
        select(UsuraRate).order_by(desc(UsuraRate.fecha_inicio)).limit(1)
    )).scalar_one_or_none()

    usura_actual = row.valor if row else 32.44
    proyecciones = calc_usura_projection(usura_actual)

    return UsuraProjection(vigente=usura_actual, proyecciones=proyecciones)
