"""End-to-end API tests against an isolated SQLite database (pytest, Python 3.10+)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import services
from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def client(tmp_path):
    """Yield a TestClient bound to a throwaway SQLite file, one per test."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_shorten_returns_a_code_and_short_url(client):
    response = client.post("/api/shorten", json={"url": "https://example.com/a/long/path"})
    assert response.status_code == 201
    body = response.json()
    assert len(body["code"]) == 7
    assert body["short_url"].endswith(body["code"])
    assert body["visits"] == 0


def test_created_at_is_serialised_as_utc(client):
    # Timestamps must carry an explicit UTC offset on both create and lookup, or clients
    # would read them as local time.
    created = client.post("/api/shorten", json={"url": "https://example.com"}).json()
    looked_up = client.get(f"/api/links/{created['code']}").json()

    for body in (created, looked_up):
        assert body["created_at"].endswith("Z")
    assert created["created_at"] == looked_up["created_at"]


def test_random_codes_never_use_reserved_words(client, monkeypatch):
    # Force the generator's first draws to be reserved (in any case); the service must
    # skip them rather than hand out a code shadowed by a real route.
    draws = iter(["docs", "Health", "abc1234"])
    monkeypatch.setattr(services, "generate_code", lambda _length: next(draws))

    response = client.post("/api/shorten", json={"url": "https://example.com"})
    assert response.status_code == 201
    assert response.json()["code"] == "abc1234"


def test_custom_code_is_used_and_cannot_be_reused(client):
    first = client.post("/api/shorten", json={"url": "https://example.com", "custom_code": "my-link"})
    assert first.status_code == 201
    assert first.json()["code"] == "my-link"

    duplicate = client.post(
        "/api/shorten", json={"url": "https://other.com", "custom_code": "my-link"}
    )
    assert duplicate.status_code == 409


def test_url_length_limit_applies_to_the_stored_form(client):
    base = "https://example.com/"
    at_limit = base + "a" * (2048 - len(base))
    assert client.post("/api/shorten", json={"url": at_limit}).status_code == 201

    # One character over the column size.
    assert client.post("/api/shorten", json={"url": at_limit + "a"}).status_code == 422

    # Only ~720 characters as typed, but ~4,200 once "é" is percent-encoded for storage.
    expands = client.post("/api/shorten", json={"url": base + "é" * 700})
    assert expands.status_code == 422
    assert "2048" in expands.json()["detail"][0]["msg"]


@pytest.mark.parametrize(
    "target",
    [
        "http://localhost:8000/abc1234",  # exact BASE_URL origin
        "http://LOCALHOST:8000/abc1234",  # host comparison is case-insensitive
        "https://localhost:8000/loop",  # scheme is ignored
    ],
)
def test_links_to_the_shortener_itself_are_rejected(client, target):
    # With the default BASE_URL (http://localhost:8000) these would redirect back into
    # the shortener; a custom code pointing at itself would loop forever.
    response = client.post("/api/shorten", json={"url": target, "custom_code": "loop"})
    assert response.status_code == 422
    assert "shortener" in response.json()["detail"]


def test_same_host_on_another_port_is_allowed(client):
    # Only the shortener's own origin is blocked, not every service on that host.
    response = client.post("/api/shorten", json={"url": "http://localhost:3000/page"})
    assert response.status_code == 201


@pytest.mark.parametrize(
    "payload",
    [
        {"url": "not-a-url"},
        {"url": "javascript:alert(1)"},
        {"url": "https://example.com", "custom_code": "ab"},  # too short
        {"url": "https://example.com", "custom_code": "has spaces"},
        {"url": "https://example.com", "custom_code": "api"},  # reserved
    ],
)
def test_invalid_input_is_rejected(client, payload):
    assert client.post("/api/shorten", json=payload).status_code == 422


def test_redirect_and_visit_counting(client):
    code = client.post("/api/shorten", json={"url": "https://example.com/target"}).json()["code"]

    redirect = client.get(f"/{code}", follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers["location"] == "https://example.com/target"

    assert client.get(f"/api/links/{code}").json()["visits"] == 1


def test_unknown_code_returns_404(client):
    assert client.get("/nope123", follow_redirects=False).status_code == 404
    assert client.get("/api/links/nope123").status_code == 404
