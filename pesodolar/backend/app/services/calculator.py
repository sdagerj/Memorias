"""Motor de cálculo de tasas forward y devaluación implícita.

Usa Paridad Cubierta de Tasas de Interés (Covered Interest Rate Parity):
  F = S × (1 + r_COP × T/B) / (1 + r_USD × T/B)

Donde:
  S   = TRM spot (COP/USD)
  r_COP = IBR overnight (% nominal, base 360)
  r_USD = SOFR (% nominal, base 360)
  T   = días al vencimiento
  B   = base de días (360 convención COP)
"""

TENORS: dict[str, int] = {
    "3M":  91,
    "6M":  182,
    "12M": 365,
    "18M": 548,
}


def calc_forward(
    spot: float,
    r_cop: float,
    r_usd: float,
    days: int,
    base: int = 360,
) -> dict:
    """Calcula forward rate para un plazo dado."""
    f = spot * (1 + r_cop / 100 * days / base) / (1 + r_usd / 100 * days / base)
    puntos = f - spot
    dev_impl = (f / spot - 1) * (base / days) * 100   # % E.A.
    return {
        "forward":              round(f, 2),
        "puntos":               round(puntos, 2),
        "devaluacion_implicita": round(dev_impl, 4),
        "costo_anual":          round(r_cop - r_usd, 4),
    }


def calc_all_tenors(spot: float, r_cop: float, r_usd: float, base: int = 360) -> list[dict]:
    """Calcula forwards para todos los plazos estándar."""
    return [
        {"tenor": tenor, "dias": days, "spot": spot,
         **calc_forward(spot, r_cop, r_usd, days, base)}
        for tenor, days in TENORS.items()
    ]


def calc_banrep_projection(tasa_actual: float) -> dict[str, list[dict]]:
    """
    Proyección de tasa BanRep en 3 escenarios.
    Basado en expectativas de mercado y regla de Taylor simplificada.
    """
    trimestres = ["Q3 26", "Q4 26", "Q1 27", "Q2 27", "Q3 27", "Q4 27", "Q1 28"]

    # Recortes trimestrales acumulados por escenario (pp)
    recortes = {
        "base":  [0.00, -0.25, -0.50, -0.75, -1.00, -1.25, -1.50],
        "dove":  [0.00, -0.75, -1.50, -2.00, -2.25, -2.50, -2.75],
        "hawk":  [0.00, +0.25, +0.50, +0.25,  0.00, -0.25, -0.50],
    }

    return {
        escenario: [
            {"periodo": q, "valor": round(tasa_actual + delta, 2), "escenario": escenario}
            for q, delta in zip(trimestres, deltas)
        ]
        for escenario, deltas in recortes.items()
    }


def calc_usura_projection(usura_actual: float) -> list[dict]:
    """
    Proyección de tasa de usura trimestral.
    La SFC la calcula como 1.5 × IBC (promedio tasas activas certificadas).
    Con IBR bajando, la usura sigue con rezago de ~1-2 trimestres.
    """
    trimestres = ["Q3 26", "Q4 26", "Q1 27", "Q2 27", "Q3 27", "Q4 27", "Q1 28"]
    # Reducción gradual siguiendo la trayectoria esperada del IBR
    reducciones = [0.00, -1.24, -2.34, -3.24, -3.94, -4.44, -4.84]

    return [
        {"periodo": q, "valor": round(usura_actual + delta, 2), "escenario": "base"}
        for q, delta in zip(trimestres, reducciones)
    ]
