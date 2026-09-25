from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./pesodolar.db"
    # Para PostgreSQL en producción:
    # database_url: str = "postgresql+asyncpg://user:pass@localhost/pesodolar"

    banrep_rate: float = 8.75       # Tasa de intervención BanRep vigente
    ibr_overnight: float = 8.62     # IBR overnight (se actualiza manualmente o via scraping)
    trm_dic_2025: float = 4386.12   # TRM cierre 31-dic-2025 para YTD

    schedule_hour: int = 9          # Hora de ingesta diaria (COT)
    schedule_minute: int = 30

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
