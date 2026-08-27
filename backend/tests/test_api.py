"""End-to-end API tests against an isolated SQLite database (pytest, Python 3.10+)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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


def test_custom_code_is_used_and_cannot_be_reused(client):
    first = client.post("/api/shorten", json={"url": "https://example.com", "custom_code": "my-link"})
    assert first.status_code == 201
    assert first.json()["code"] == "my-link"

    duplicate = client.post(
        "/api/shorten", json={"url": "https://other.com", "custom_code": "my-link"}
    )
    assert duplicate.status_code == 409


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
