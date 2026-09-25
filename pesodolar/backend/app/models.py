from sqlalchemy import Column, Float, String, Date, DateTime, func
from .database import Base


class TRM(Base):
    __tablename__ = "trm"

    fecha = Column(Date, primary_key=True, index=True)
    valor = Column(Float, nullable=False)
    fuente = Column(String, default="datos.gov.co")
    created_at = Column(DateTime, server_default=func.now())


class IBR(Base):
    __tablename__ = "ibr"

    fecha = Column(Date, primary_key=True, index=True)
    overnight = Column(Float)
    un_mes = Column(Float)
    tres_meses = Column(Float)
    seis_meses = Column(Float)
    doce_meses = Column(Float)
    fuente = Column(String, default="banrep.gov.co")


class SOFR(Base):
    __tablename__ = "sofr"

    fecha = Column(Date, primary_key=True, index=True)
    valor = Column(Float, nullable=False)
    fuente = Column(String, default="newyorkfed.org")


class BanRepRate(Base):
    """Tasa de intervención del Banco de la República"""
    __tablename__ = "banrep_rate"

    fecha = Column(Date, primary_key=True, index=True)
    valor = Column(Float, nullable=False)
    decision = Column(String)   # "sube", "baja", "mantiene"
    notas = Column(String)


class UsuraRate(Base):
    """Tasa de usura certificada por la SFC"""
    __tablename__ = "usura_rate"

    periodo = Column(String, primary_key=True)  # "Q3-2026"
    fecha_inicio = Column(Date, nullable=False, index=True)
    fecha_fin = Column(Date)
    valor = Column(Float, nullable=False)        # % E.A.
    modalidad = Column(String, default="consumo_ordinario")
