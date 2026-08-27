"""FastAPI application: routes, CORS and startup wiring (Python 3.10+)."""

import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import services
from app.config import Settings, get_settings
from app.database import get_db, init_db
from app.schemas import ErrorResponse, LinkResponse, ShortenRequest

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Shorthands so the route signatures below stay readable.
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup. Swap for Alembic migrations in production."""
    try:
        init_db()
        logger.info("Database initialised")
    except SQLAlchemyError:
        # Fail loudly: serving traffic against a broken database only hides the problem.
        logger.exception("Database initialisation failed")
        raise
    yield


app = FastAPI(
    title="URL Shortener API",
    description="Shorten links, resolve them, and track click counts.",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness probe for deploy platforms and the frontend's connectivity check."""
    return {"status": "ok"}


@app.post(
    "/api/shorten",
    response_model=LinkResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    tags=["links"],
)
def shorten(payload: ShortenRequest, db: DbSession, config: AppSettings) -> LinkResponse:
    """Create a short link for `payload.url`, optionally under a caller-supplied code."""
    try:
        link = services.create_link(
            db=db,
            target_url=str(payload.url),
            settings=config,
            custom_code=payload.custom_code,
        )
    except services.CodeAlreadyExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except services.CodeGenerationError as exc:
        logger.error("Code generation exhausted: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not allocate a short code, please retry.",
        ) from exc
    except SQLAlchemyError as exc:
        # Never leak driver-level messages to the client; log them instead.
        logger.exception("Database error while creating a link")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error"
        ) from exc

    return LinkResponse(
        code=link.code,
        target_url=link.target_url,
        short_url=services.build_short_url(config.base_url, link.code),
        created_at=link.created_at,
        visits=link.visits,
    )


@app.get(
    "/api/links/{code}",
    response_model=LinkResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["links"],
)
def get_link(code: str, db: DbSession, config: AppSettings) -> LinkResponse:
    """Return stats for a single link without counting the lookup as a visit."""
    link = services.get_link_by_code(db, code)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Short link not found")

    return LinkResponse(
        code=link.code,
        target_url=link.target_url,
        short_url=services.build_short_url(config.base_url, link.code),
        created_at=link.created_at,
        visits=link.visits,
    )


@app.get(
    "/{code}",
    response_class=RedirectResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["redirect"],
)
def redirect_to_target(code: str, db: DbSession) -> RedirectResponse:
    """Resolve a short code and redirect the browser to the original URL.

    Declared last so it never shadows /health or the /api/* routes above.
    """
    link = services.get_link_by_code(db, code)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Short link not found")

    try:
        services.register_visit(db, code)
    except SQLAlchemyError:
        # A failed counter must not break the redirect itself — log and carry on.
        logger.exception("Failed to record visit for code %s", code)

    # 307 keeps the method and, unlike 301, is not cached forever by browsers — which
    # matters because the click counter needs to see every hit.
    return RedirectResponse(url=link.target_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
