"""Pydantic v2 request/response models — the API's validation layer (Python 3.10+)."""

import re
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

# A custom code must be URL-safe and unambiguous: letters, digits, hyphen, underscore.
CUSTOM_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,32}$")

# Codes that would collide with real API routes and can never be handed out.
RESERVED_CODES = frozenset({"api", "health", "docs", "redoc", "openapi.json", "static", "favicon.ico"})


class ShortenRequest(BaseModel):
    """Body of POST /api/shorten."""

    # HttpUrl rejects anything that is not a syntactically valid http(s) URL, which also
    # blocks javascript: and data: payloads that would otherwise become an open redirect.
    url: HttpUrl = Field(..., description="Absolute http(s) URL to shorten")

    custom_code: str | None = Field(
        default=None, description="Optional vanity code; generated randomly when omitted"
    )

    @field_validator("url")
    @classmethod
    def only_http_schemes(cls, value: HttpUrl) -> HttpUrl:
        """Defence in depth: reject any scheme other than http/https."""
        if value.scheme not in ("http", "https"):
            raise ValueError("URL must use the http or https scheme")
        return value

    @field_validator("custom_code")
    @classmethod
    def validate_custom_code(cls, value: str | None) -> str | None:
        """Enforce the character/length rules and keep reserved paths out of the code space."""
        if value is None:
            return None
        candidate = value.strip()
        if not CUSTOM_CODE_PATTERN.match(candidate):
            raise ValueError(
                "custom_code must be 3-32 characters and contain only letters, digits, - or _"
            )
        if candidate.lower() in RESERVED_CODES:
            raise ValueError(f"'{candidate}' is a reserved code")
        return candidate


class LinkResponse(BaseModel):
    """Representation of a stored link returned by the API."""

    # from_attributes lets FastAPI build this straight from the SQLAlchemy Link object.
    model_config = ConfigDict(from_attributes=True)

    code: str
    target_url: str
    short_url: str
    created_at: datetime
    visits: int

    @field_validator("created_at")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Always emit an explicit UTC offset.

        SQLite has no timezone type, so rows come back naive even though they were written
        as UTC (both the Python default and SQLite's CURRENT_TIMESTAMP are UTC). Without an
        offset, clients would parse the value as their own local time. Aware values (e.g.
        from PostgreSQL) are normalised to UTC so every response looks the same.
        """
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class ErrorResponse(BaseModel):
    """Uniform error body, so the frontend can always read `detail`."""

    detail: str
