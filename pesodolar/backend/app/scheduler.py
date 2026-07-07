"""Tareas programadas de ingesta diaria de datos.

Corre todos los días hábiles a las 9:30 AM COT (UTC-5).
APScheduler se integra directamente con el ciclo de vida de FastAPI.
"""

import logging
from datetime import date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import AsyncSessionLocal
from .models import TRM, SOFR, IBR
from .services import banrep, sofr as sofr_svc
from .config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="America/Bogota")


async def ingestar_trm():
    """Fetch y persiste la TRM del día desde datos.gov.co."""
    datos = await banrep.fetch_trm()
    if not datos:
        logger.warning("Ingesta TRM: sin datos disponibles")
        return

    async with AsyncSessionLocal() as db:
        fecha = date.fromisoformat(datos["fecha"])
        existente = await db.get(TRM, fecha)
        if not existente:
            db.add(TRM(fecha=fecha, valor=datos["valor"]))
            await db.commit()
            logger.info("TRM ingresada: %s = %.2f", fecha, datos["valor"])
        else:
            logger.debug("TRM ya existe para %s", fecha)


async def ingestar_sofr():
    """Fetch y persiste el SOFR desde NY Fed."""
    datos = await sofr_svc.fetch_sofr()
    if not datos:
        logger.warning("Ingesta SOFR: sin datos disponibles")
        return

    async with AsyncSessionLocal() as db:
        fecha = date.fromisoformat(datos["fecha"])
        existente = await db.get(SOFR, fecha)
        if not existente:
            db.add(SOFR(fecha=fecha, valor=datos["valor"]))
            await db.commit()
            logger.info("SOFR ingresado: %s = %.4f%%", fecha, datos["valor"])


async def ingestar_ibr():
    """Fetch y persiste el IBR desde datos.gov.co."""
    datos = await banrep.fetch_ibr()
    if not datos:
        logger.debug("IBR: usando valor configurado")
        return

    async with AsyncSessionLocal() as db:
        fecha = date.fromisoformat(datos["fecha"])
        existente = await db.get(IBR, fecha)
        if not existente:
            db.add(IBR(fecha=fecha, **{k: v for k, v in datos.items() if k != "fecha"}))
            await db.commit()
            logger.info("IBR ingresado: %s", fecha)


async def ingestar_todo():
    """Punto de entrada de la ingesta diaria completa."""
    logger.info("=== Iniciando ingesta diaria ===")
    await ingestar_trm()
    await ingestar_sofr()
    await ingestar_ibr()
    logger.info("=== Ingesta diaria completada ===")


def start_scheduler():
    """Registra las tareas y arranca el scheduler."""
    scheduler.add_job(
        ingestar_todo,
        trigger=CronTrigger(
            hour=settings.schedule_hour,
            minute=settings.schedule_minute,
            day_of_week="mon-fri",    # solo días hábiles de semana
        ),
        id="ingesta_diaria",
        name="Ingesta diaria TRM + SOFR + IBR",
        replace_existing=True,
        misfire_grace_time=3600,      # si arranca tarde, ejecuta hasta 1h después
    )
    scheduler.start()
    logger.info(
        "Scheduler activo — próxima ingesta: %s",
        scheduler.get_job("ingesta_diaria").next_run_time,
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
