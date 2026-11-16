from fastapi.testclient import TestClient

from app import main
from app.main import MAX_CODE_LENGTH, app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_trace_returns_trace_json():
    response = client.post("/api/trace", json={"code": "x = 2\nprint(x * 3)\n"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"steps", "line_counts", "stdout", "error"}
    assert body["stdout"] == "6\n"
    assert body["error"] is None
    assert body["steps"][-1]["locals"] == {"x": 2}


def test_trace_reports_forbidden_code_with_200():
    # A rejected program is a normal result for the UI, not an HTTP error.
    response = client.post("/api/trace", json={"code": "import os\n"})
    assert response.status_code == 200
    assert response.json()["error"]["type"] == "ForbiddenCode"


def test_missing_code_field_is_422():
    assert client.post("/api/trace", json={}).status_code == 422


def test_code_too_long_is_422():
    response = client.post(
        "/api/trace", json={"code": "x" * (MAX_CODE_LENGTH + 1)})
    assert response.status_code == 422


def test_busy_server_returns_503(monkeypatch):
    class NoSlots:
        def acquire(self, blocking=True):
            return False

    monkeypatch.setattr(main, "_run_slots", NoSlots())
    response = client.post("/api/trace", json={"code": "x = 1\n"})
    assert response.status_code == 503


def test_cors_allows_local_frontend():
    response = client.options(
        "/api/trace",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_unknown_origin():
    response = client.post(
        "/api/trace", json={"code": "x = 1\n"},
        headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
