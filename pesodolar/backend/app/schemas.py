from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class TRMOut(BaseModel):
    fecha: date
    valor: float
    fuente: str = "datos.gov.co"

    model_config = {"from_attributes": True}


class IBROut(BaseModel):
    fecha: date
    overnight: Optional[float] = None
    un_mes: Optional[float] = None
    tres_meses: Optional[float] = None
    seis_meses: Optional[float] = None
    doce_meses: Optional[float] = None

    model_config = {"from_attributes": True}


class SOFROut(BaseModel):
    fecha: date
    valor: float

    model_config = {"from_attributes": True}


class ForwardTenor(BaseModel):
    tenor: str              # "3M", "6M", "12M", "18M"
    dias: int
    spot: float
    forward: float
    puntos: float
    devaluacion_implicita: float    # % E.A.
    costo_anual: float              # diferencial de tasas %


class ForwardResponse(BaseModel):
    fecha: date
    spot: float
    r_cop: float            # IBR % E.A.
    r_usd: float            # SOFR % N.A.
    tenores: list[ForwardTenor]


class DashboardResponse(BaseModel):
    trm_hoy: Optional[TRMOut]
    trm_ayer: Optional[TRMOut]
    variacion_diaria: Optional[float]           # COP
    variacion_diaria_pct: Optional[float]       # %
    variacion_ytd_pct: Optional[float]          # %
    banrep_rate: float
    ibr_overnight: float
    sofr: Optional[float]
    diferencial_tasas: float
    forward: Optional[ForwardResponse]
    usura_vigente: Optional[float]


class ForwardCalcRequest(BaseModel):
    spot: float = Field(..., gt=0, description="TRM spot COP/USD")
    r_cop: float = Field(..., gt=0, description="Tasa COP % E.A.")
    r_usd: float = Field(..., gt=0, description="Tasa USD % N.A.")
    base: int = Field(360, ge=360, le=365)


class ProjectionPoint(BaseModel):
    periodo: str
    valor: float
    escenario: str


class BanRepProjection(BaseModel):
    tasa_actual: float
    proyecciones: dict[str, list[ProjectionPoint]]   # base, dove, hawk


class UsuraProjection(BaseModel):
    vigente: Optional[float]
    proyecciones: list[ProjectionPoint]
