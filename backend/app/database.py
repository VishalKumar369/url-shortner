"""Database engine, session factory and FastAPI session dependency (Python 3.10+)."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# SQLite refuses to share a connection across threads by default, but FastAPI runs
# sync endpoints in a threadpool. The flag is safe here because each request gets
# its own short-lived session. It is ignored by every other driver.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped session and guarantee it is closed, even if the endpoint raises."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create any missing tables. For a real deployment, replace this with Alembic migrations."""
    # Importing models registers them on Base.metadata before create_all runs.
    from app import models  # noqa: F401  (imported for the side effect of model registration)

    Base.metadata.create_all(bind=engine)
