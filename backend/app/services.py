"""Business logic for creating and resolving short links (Python 3.10+)."""

import secrets
import string

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Link

# base62 alphabet — safe in a URL path and free of the punctuation that needs escaping.
ALPHABET = string.ascii_letters + string.digits


class CodeAlreadyExistsError(Exception):
    """Raised when a requested custom code is already taken."""


class CodeGenerationError(Exception):
    """Raised when no free random code was found within the configured attempt budget."""


def generate_code(length: int) -> str:
    """Return a cryptographically random base62 code of `length` characters."""
    # secrets (not random) so codes are not predictable from one another.
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def get_link_by_code(db: Session, code: str) -> Link | None:
    """Look up a link by its short code, or return None when it does not exist."""
    return db.execute(select(Link).where(Link.code == code)).scalar_one_or_none()


def create_link(db: Session, target_url: str, settings: Settings, custom_code: str | None = None) -> Link:
    """Persist a new short link.

    Raises:
        CodeAlreadyExistsError: the caller asked for a custom code that is taken.
        CodeGenerationError: every generated candidate collided with an existing row.
    """
    if custom_code is not None:
        return _insert_link(db, code=custom_code, target_url=target_url, on_conflict_raises=True)

    # Retry on collision. The UNIQUE index is the real arbiter, so this stays correct
    # even when two workers generate the same code at the same instant.
    last_error: IntegrityError | None = None
    for _ in range(settings.code_max_attempts):
        code = generate_code(settings.code_length)
        try:
            return _insert_link(db, code=code, target_url=target_url, on_conflict_raises=False)
        except IntegrityError as exc:
            last_error = exc
            continue

    raise CodeGenerationError(
        f"Could not allocate a unique code in {settings.code_max_attempts} attempts"
    ) from last_error


def _insert_link(db: Session, code: str, target_url: str, on_conflict_raises: bool) -> Link:
    """Insert one row, translating a UNIQUE violation into the appropriate exception."""
    link = Link(code=code, target_url=target_url)
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        # The session is poisoned after a failed flush; roll back before doing anything else.
        db.rollback()
        if on_conflict_raises:
            raise CodeAlreadyExistsError(f"Code '{code}' is already in use") from None
        raise  # let create_link's retry loop handle a random-code collision
    db.refresh(link)
    return link


def register_visit(db: Session, code: str) -> None:
    """Increment the click counter for `code`.

    Uses a single UPDATE ... SET visits = visits + 1 statement so concurrent redirects
    cannot lose counts the way a read-modify-write in Python would.
    """
    db.execute(update(Link).where(Link.code == code).values(visits=Link.visits + 1))
    db.commit()


def build_short_url(base_url: str, code: str) -> str:
    """Join the configured public base URL with a code, tolerating a trailing slash."""
    return f"{base_url.rstrip('/')}/{code}"
