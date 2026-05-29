"""SSTG – Application Configuration"""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    APP_NAME: str = "Smart School Timetable Generator"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # SECURITY — set via Render environment variable, never commit a real value
    SECRET_KEY: str = "change-me-run-openssl-rand-hex-32"

    DATABASE_URL: str = "sqlite:///./sstg.db"

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours

    # Email (optional — only needed for PDF email delivery feature)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""
    EMAIL_FROM_NAME: str = "SSTG System"

    # School settings
    SCHOOL_NAME: str = "Greenfield Academy"
    ACADEMIC_YEAR: str = "2025/2026"
    PERIODS_PER_DAY: int = 8
    SCHOOL_DAYS: str = "Monday,Tuesday,Wednesday,Thursday,Friday"

    # ── Free API integrations ──────────────────────────────────────────────────
    # Google Gemini — free at https://aistudio.google.com/app/apikey
    # Free tier: 15 req/min, 1 million tokens/day (no credit card needed)
    GEMINI_API_KEY: str = ""

    # SendGrid — free at https://sendgrid.com (100 emails/day)
    # Better than raw SMTP — no port 587 issues on Render
    SENDGRID_API_KEY: str = ""

    # Country code for public holidays (ISO 3166-1 alpha-2)
    # Used by Nager.Date API (no key needed — completely free)
    HOLIDAY_COUNTRY: str = "ZA"  # ZA=South Africa, US, GB, KE, NG etc.

    # CORS — comma-separated list of allowed origins.
    # In Render, set this to your live frontend URL, e.g.:
    #   https://smartadmin-frontend.onrender.com
    # Use * to allow all origins (not recommended in production).
    CORS_ORIGINS: str = "*"

    @property
    def school_days_list(self) -> List[str]:
        return [d.strip() for d in self.SCHOOL_DAYS.split(",")]

    @property
    def cors_origins_list(self) -> List[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return origins


@lru_cache()
def get_settings() -> Settings:
    return Settings()
