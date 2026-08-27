"""Application settings, loaded from environment variables / .env (Python 3.10+)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be overridden by an env var of the same name."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQLAlchemy connection string. SQLite keeps the project zero-setup; swap in
    # postgresql+psycopg://... for a real deployment without touching other code.
    database_url: str = "sqlite:///./urlshortener.db"

    # Public origin of THIS backend, used to build the short link returned to clients.
    base_url: str = "http://localhost:8000"

    # Comma-separated list of browser origins allowed to call the API (the Next.js dev server).
    cors_origins: str = "http://localhost:3000"

    # Length of a generated short code. 7 base62 chars ~= 3.5e12 combinations.
    code_length: int = 7

    # How many times to retry generation when a random code already exists.
    code_max_attempts: int = 5

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse `cors_origins` into a clean list, dropping empty entries from trailing commas."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance so the .env file is parsed only once per process."""
    return Settings()
