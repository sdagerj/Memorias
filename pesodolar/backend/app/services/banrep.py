"""Fetchers de datos del Banco de la República y fuentes colombianas."""

import httpx
import logging
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# TRM via datos abiertos Colombia (Socrata API — sin autenticación requerida)
DATOS_GOV_TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json"

# IBR via datos.gov.co
DATOS_GOV_IBR = "https://www.datos.gov.co/resource/gnxs-g4gm.json"


async def fetch_trm(target_date: Optional[date] = None) -> Optional[dict]:
    """
    Obtiene la TRM más reciente desde datos.gov.co.
    Retorna None si no hay datos disponibles.
    """
    if target_date is None:
        target_date = date.today()

    # Busca los últimos 5 días hábiles para cubrir fines de semana y festivos
    desde = target_date - timedelta(days=7)

    params = {
        "$where": f"vigenciadesde >= '{desde.isoformat()}'",
        "$order": "vigenciadesde DESC",
        "$limit": "5",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(DATOS_GOV_TRM, params=params)
            resp.raise_for_status()
            data = resp.json()

        if not data:
            logger.warning("TRM: sin datos desde datos.gov.co para %s", target_date)
            return None

        latest = data[0]
        return {
            "fecha": latest["vigenciadesde"][:10],
            "valor": float(latest["valor"]),
            "fuente": "datos.gov.co / BanRep",
        }

    except httpx.HTTPError as e:
        logger.error("TRM fetch error: %s", e)
        return None


async def fetch_trm_history(days: int = 365) -> list[dict]:
    """Obtiene histórico de TRM para los últimos N días."""
    desde = date.today() - timedelta(days=days)

    params = {
        "$where": f"vigenciadesde >= '{desde.isoformat()}'",
        "$order": "vigenciadesde ASC",
        "$limit": str(days + 10),
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(DATOS_GOV_TRM, params=params)
            resp.raise_for_status()
            data = resp.json()

        return [
            {"fecha": r["vigenciadesde"][:10], "valor": float(r["valor"])}
            for r in data
        ]

    except httpx.HTTPError as e:
        logger.error("TRM history fetch error: %s", e)
        return []


async def fetch_ibr() -> Optional[dict]:
    """
    Intenta obtener IBR desde datos.gov.co.
    Si no está disponible, retorna None (el sistema usa el valor configurado).
    """
    params = {
        "$order": "vigencia DESC",
        "$limit": "1",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(DATOS_GOV_IBR, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data:
            r = data[0]
            return {
                "fecha": r.get("vigencia", date.today().isoformat())[:10],
                "overnight": float(r.get("overnight", 0)) if r.get("overnight") else None,
                "un_mes":    float(r.get("un_mes", 0))    if r.get("un_mes")    else None,
                "tres_meses": float(r.get("tres_meses", 0)) if r.get("tres_meses") else None,
                "seis_meses": float(r.get("seis_meses", 0)) if r.get("seis_meses") else None,
                "doce_meses": float(r.get("doce_meses", 0)) if r.get("doce_meses") else None,
            }

    except httpx.HTTPError as e:
        logger.warning("IBR fetch error (usando valor configurado): %s", e)

    return None
