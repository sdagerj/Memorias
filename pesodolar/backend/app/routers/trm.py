from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date, timedelta
from typing import Optional

from ..database import get_db
from ..models import TRM
from ..schemas import TRMOut
from ..services import banrep

router = APIRouter(prefix="/trm", tags=["TRM"])


@router.get("/today", response_model=TRMOut)
async def get_trm_today(db: AsyncSession = Depends(get_db)):
    """TRM vigente del día (o último día hábil disponible)."""
    # Primero busca en la DB
    resultado = await db.execute(
        select(TRM).order_by(desc(TRM.fecha)).limit(1)
    )
    trm = resultado.scalar_one_or_none()

    if trm:
        return trm

    # Si no hay en DB, fetch directo
    datos = await banrep.fetch_trm()
    if not datos:
        raise HTTPException(status_code=503, detail="TRM no disponible en este momento")

    nuevo = TRM(fecha=date.fromisoformat(datos["fecha"]), valor=datos["valor"])
    db.add(nuevo)
    await db.commit()
    await db.refresh(nuevo)
    return nuevo


@router.get("/history", response_model=list[TRMOut])
async def get_trm_history(
    days: int = Query(365, ge=1, le=1825, description="Días de historia"),
    db: AsyncSession = Depends(get_db),
):
    """Histórico de TRM para los últimos N días."""
    desde = date.today() - timedelta(days=days)
    resultado = await db.execute(
        select(TRM).where(TRM.fecha >= desde).order_by(TRM.fecha.asc())
    )
    registros = resultado.scalars().all()

    if len(registros) < 5:
        # Seed inicial desde la API
        historia = await banrep.fetch_trm_history(days)
        for r in historia:
            existing = await db.get(TRM, date.fromisoformat(r["fecha"]))
            if not existing:
                db.add(TRM(fecha=date.fromisoformat(r["fecha"]), valor=r["valor"]))
        await db.commit()
        resultado = await db.execute(
            select(TRM).where(TRM.fecha >= desde).order_by(TRM.fecha.asc())
        )
        registros = resultado.scalars().all()

    return registros


@router.get("/{fecha}", response_model=TRMOut)
async def get_trm_by_date(fecha: date, db: AsyncSession = Depends(get_db)):
    """TRM para una fecha específica."""
    trm = await db.get(TRM, fecha)
    if not trm:
        raise HTTPException(status_code=404, detail=f"TRM no encontrada para {fecha}")
    return trm
