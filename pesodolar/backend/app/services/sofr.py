"""Fetcher de SOFR (Secured Overnight Financing Rate) desde NY Federal Reserve."""

import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

NYFED_URL = "https://markets.newyorkfed.org/api/rates/sofr/last/1.json"
NYFED_HISTORY_URL = "https://markets.newyorkfed.org/api/rates/sofr/last/{days}.json"


async def fetch_sofr() -> Optional[dict]:
    """Obtiene el SOFR más reciente desde la API del NY Federal Reserve."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(NYFED_URL)
            resp.raise_for_status()
            data = resp.json()

        rates = data.get("refRates", [])
        if not rates:
            return None

        r = rates[0]
        return {
            "fecha": r["effectiveDate"],
            "valor": float(r["percentRate"]),
            "fuente": "newyorkfed.org",
        }

    except httpx.HTTPError as e:
        logger.error("SOFR fetch error: %s", e)
        return None


async def fetch_sofr_history(days: int = 30) -> list[dict]:
    """Obtiene histórico de SOFR para los últimos N días hábiles."""
    try:
        url = NYFED_HISTORY_URL.format(days=days)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        rates = data.get("refRates", [])
        return [
            {"fecha": r["effectiveDate"], "valor": float(r["percentRate"])}
            for r in reversed(rates)  # NY Fed los devuelve del más reciente al más antiguo
        ]

    except httpx.HTTPError as e:
        logger.error("SOFR history fetch error: %s", e)
        return []
