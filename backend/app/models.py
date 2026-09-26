"""SQLAlchemy ORM models (Python 3.10+)."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Longest target URL we store: the practical browser URL ceiling. Shared with the request
# schema so validation and the column size can never drift apart.
MAX_TARGET_URL_LENGTH = 2048


def _utcnow() -> datetime:
    """Timezone-aware UTC timestamp; used as the Python-side default for created_at."""
    return datetime.now(timezone.utc)


class Link(Base):
    """A single shortened link and its click counter."""

    __tablename__ = "links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # The short code that appears in the URL, e.g. "aB3xY9z". Unique + indexed because
    # every redirect is a lookup on this column.
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)

    # The destination, as normalised by the request schema.
    target_url: Mapped[str] = mapped_column(String(MAX_TARGET_URL_LENGTH), nullable=False)

    # server_default keeps rows correct even if something inserts outside the ORM.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )

    visits: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"<Link code={self.code!r} target_url={self.target_url!r} visits={self.visits}>"
