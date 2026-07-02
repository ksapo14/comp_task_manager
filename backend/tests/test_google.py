from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.routers import google
from app.schemas import TaskRead


class FakeCredentials:
    def __init__(self, **values):
        self.expired = False
        self.token = values.get("token")
        self.refresh_token = values.get("refresh_token")
        self.token_uri = values.get("token_uri")
        self.client_id = values.get("client_id")
        self.client_secret = values.get("client_secret")
        self.scopes = values.get("scopes")


class FakeRequest:
    def __init__(self, payload):
        self.payload = payload

    def execute(self):
        return self.payload


class FakeEvents:
    def __init__(self, events):
        self.items = events
        self.inserted = []
        self.deleted = []

    def list(self, **_kwargs):
        return FakeRequest({"items": self.items})

    def insert(self, **kwargs):
        self.inserted.append(kwargs["body"])
        return FakeRequest(kwargs["body"])

    def delete(self, **kwargs):
        self.deleted.append(kwargs["eventId"])
        return FakeRequest({})


class FakeService:
    def __init__(self, events):
        self.event_resource = FakeEvents(events)

    def events(self):
        return self.event_resource


def task(**values) -> TaskRead:
    return TaskRead(
        id="task-1",
        user_id="user-1",
        title="Write report",
        description="",
        duration_minutes=30,
        priority="medium",
        scheduled_start_time=datetime(2026, 7, 2, 14, tzinfo=timezone.utc),
        created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        **values,
    )


def credentials():
    return {
        "token": "token",
        "refresh_token": "refresh",
        "token_uri": "https://oauth2.googleapis.com/token",
        "scopes": ["calendar"],
    }


def test_sync_reuses_managed_event_and_removes_managed_duplicates(monkeypatch):
    managed = [
        {
            "id": "existing-1",
            "extendedProperties": {"private": {"compass_task_id": "task-1"}},
        },
        {
            "id": "existing-2",
            "extendedProperties": {"private": {"compass_task_id": "task-1"}},
        },
    ]
    service = FakeService(managed)
    monkeypatch.setattr(google, "Credentials", FakeCredentials)
    monkeypatch.setattr(google, "build", lambda *_args, **_kwargs: service)

    _, linked, _, pushed = google.run_google_sync(credentials(), [task()])

    assert linked == [("task-1", "existing-1")]
    assert pushed == 0
    assert service.event_resource.inserted == []
    assert service.event_resource.deleted == ["existing-2"]


def test_new_events_use_a_stable_google_id(monkeypatch):
    service = FakeService([])
    monkeypatch.setattr(google, "Credentials", FakeCredentials)
    monkeypatch.setattr(google, "build", lambda *_args, **_kwargs: service)

    _, linked, refreshed, pushed = google.run_google_sync(credentials(), [task()])

    expected_id = google.google_event_id("task-1")
    assert service.event_resource.inserted[0]["id"] == expected_id
    assert linked == [("task-1", expected_id)]
    assert pushed == 1
    assert "client_id" not in refreshed
    assert "client_secret" not in refreshed


def test_oauth_state_is_user_bound_and_expires(monkeypatch):
    monkeypatch.setattr(google.settings, "oauth_state_secret", "test-state-secret")
    current_time = google.time.time()
    state = google.create_oauth_state("user-1")

    google.verify_oauth_state(state, "user-1")
    with pytest.raises(HTTPException, match="Invalid or expired OAuth state"):
        google.verify_oauth_state(state, "user-2")

    monkeypatch.setattr(google.time, "time", lambda: current_time + 601)
    with pytest.raises(HTTPException, match="Invalid or expired OAuth state"):
        google.verify_oauth_state(state, "user-1")
