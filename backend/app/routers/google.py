import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..config import get_settings
from ..dependencies import CurrentUser, Store
from ..profile import ensure_profile
from ..schemas import GoogleCallback, GoogleStatus, GoogleSyncResult, TaskRead

router = APIRouter(prefix="/google", tags=["google-calendar"])
settings = get_settings()
SCOPES = ["https://www.googleapis.com/auth/calendar"]
sync_locks: dict[str, asyncio.Lock] = {}


def client_config() -> dict[str, Any]:
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def configured() -> bool:
    return bool(
        settings.google_client_id
        and settings.google_client_secret
        and settings.oauth_state_secret
    )


def create_oauth_state(user_id: str) -> str:
    payload = {
        "exp": int(time.time()) + 600,
        "nonce": secrets.token_urlsafe(16),
        "user_id": user_id,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).rstrip(b"=")
    signature = hmac.new(
        settings.oauth_state_secret.encode(),
        encoded,
        hashlib.sha256,
    ).digest()
    return (
        f"{encoded.decode()}."
        f"{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"
    )


def verify_oauth_state(state: str, user_id: str) -> None:
    try:
        encoded, supplied_signature = state.split(".", 1)
        expected_signature = hmac.new(
            settings.oauth_state_secret.encode(),
            encoded.encode(),
            hashlib.sha256,
        ).digest()
        signature = base64.urlsafe_b64decode(
            supplied_signature + "=" * (-len(supplied_signature) % 4)
        )
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError
        payload = json.loads(
            base64.urlsafe_b64decode(
                encoded + "=" * (-len(encoded) % 4)
            )
        )
        if payload.get("user_id") != user_id or payload.get("exp", 0) < time.time():
            raise ValueError
    except (
        TypeError,
        ValueError,
        UnicodeDecodeError,
        binascii.Error,
        json.JSONDecodeError,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state",
        ) from None


def credential_dict(credentials: Credentials) -> dict[str, Any]:
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "scopes": credentials.scopes,
    }


@router.get("/status", response_model=GoogleStatus)
async def google_status(
    user: CurrentUser,
    store: Store,
) -> GoogleStatus:
    profile = await ensure_profile(user, store)
    profile_data = await store.get_profile() or {}
    credentials = profile_data.get("google_credentials")
    url = None
    if configured() and not credentials:
        state = create_oauth_state(profile.id)
        flow = Flow.from_client_config(client_config(), scopes=SCOPES)
        flow.redirect_uri = settings.google_redirect_uri
        url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
    return GoogleStatus(
        configured=configured(),
        connected=bool(credentials),
        authorization_url=url,
    )


@router.post("/callback", response_model=GoogleStatus)
async def google_callback(
    payload: GoogleCallback,
    user: CurrentUser,
    store: Store,
) -> GoogleStatus:
    if not configured():
        raise HTTPException(status_code=503, detail="Google Calendar is not configured")
    verify_oauth_state(payload.state, user.id)
    flow = Flow.from_client_config(
        client_config(),
        scopes=SCOPES,
        state=payload.state,
    )
    flow.redirect_uri = settings.google_redirect_uri
    try:
        await asyncio.to_thread(flow.fetch_token, code=payload.code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Google authorization failed") from exc

    profile = await store.get_profile()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    profile["google_credentials"] = credential_dict(flow.credentials)
    await store.set_profile(profile)
    return GoogleStatus(configured=True, connected=True)


def parse_google_time(payload: dict[str, str]) -> datetime:
    if "dateTime" in payload:
        return datetime.fromisoformat(payload["dateTime"].replace("Z", "+00:00"))
    return datetime.fromisoformat(payload["date"]).replace(tzinfo=timezone.utc)


def google_event_id(task_id: str) -> str:
    """Return a stable Google-compatible ID so repeated inserts are idempotent."""
    digest = hashlib.sha256(task_id.encode()).hexdigest()
    return f"compass{digest[:32]}"


def run_google_sync(
    credentials_data: dict[str, Any],
    tasks: list[TaskRead],
) -> tuple[list, list[tuple[str, str]], dict[str, Any], int]:
    credential_values = {
        key: value
        for key, value in credentials_data.items()
        if key not in {"client_id", "client_secret"}
    }
    credentials = Credentials(
        **credential_values,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    now = datetime.now(timezone.utc)
    events = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=(now - timedelta(days=7)).isoformat(),
            timeMax=(now + timedelta(days=60)).isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
        .get("items", [])
    )
    managed_by_task: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        task_id = (
            event.get("extendedProperties", {})
            .get("private", {})
            .get("compass_task_id")
        )
        if task_id:
            managed_by_task.setdefault(task_id, []).append(event)

    linked: list[tuple[str, str]] = []
    created_count = 0
    for task in tasks:
        start = task.scheduled_start_time
        if not start:
            continue

        matches = managed_by_task.get(task.id, [])
        if matches:
            chosen = next(
                (
                    event
                    for event in matches
                    if event.get("id") == task.google_event_id
                ),
                matches[0],
            )
            for duplicate in matches:
                if duplicate.get("id") != chosen.get("id"):
                    service.events().delete(
                        calendarId="primary",
                        eventId=duplicate["id"],
                    ).execute()
            if task.google_event_id != chosen["id"]:
                linked.append((task.id, chosen["id"]))
            continue

        # A stored ID means the task was already exported, even if it falls outside
        # the time window fetched above.
        if task.google_event_id:
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        body = {
            "id": google_event_id(task.id),
            "summary": task.title,
            "description": task.description,
            "start": {"dateTime": start.isoformat()},
            "end": {
                "dateTime": (start + timedelta(minutes=task.duration_minutes)).isoformat()
            },
            "extendedProperties": {"private": {"compass_task_id": task.id}},
        }
        try:
            created = service.events().insert(
                calendarId="primary",
                body=body,
            ).execute()
            created_count += 1
        except HttpError as exc:
            if getattr(exc.resp, "status", None) != 409:
                raise
            # Another sync inserted the deterministic ID first.
            created = service.events().get(
                calendarId="primary",
                eventId=body["id"],
            ).execute()
            private = created.get("extendedProperties", {}).get("private", {})
            if private.get("compass_task_id") != task.id:
                raise
        linked.append((task.id, created["id"]))
    return events, linked, credential_dict(credentials), created_count


def stored_event_changed(
    existing: dict[str, Any],
    values: dict[str, Any],
) -> bool:
    def normalize_time(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    return any(
        (
            existing.get("provider") != values["provider"],
            existing.get("title") != values["title"],
            normalize_time(existing.get("start_time")) != values["start_time"],
            normalize_time(existing.get("end_time")) != values["end_time"],
            existing.get("raw_payload") != values["raw_payload"],
        )
    )


@router.post("/sync", response_model=GoogleSyncResult)
async def sync_google(
    user: CurrentUser,
    store: Store,
) -> GoogleSyncResult:
    if not configured():
        raise HTTPException(status_code=503, detail="Google Calendar is not configured")
    lock = sync_locks.setdefault(user.id, asyncio.Lock())
    async with lock:
        return await sync_google_locked(store)


async def sync_google_locked(store: Store) -> GoogleSyncResult:
    profile = await store.get_profile() or {}
    credentials = profile.get("google_credentials")
    if not credentials:
        raise HTTPException(status_code=409, detail="Connect Google Calendar first")
    tasks = [
        TaskRead.model_validate(item)
        for item in await store.list("tasks")
        if item.get("scheduled_start_time") and not item.get("is_completed", False)
    ]
    try:
        events, linked, refreshed_credentials, pushed = await asyncio.to_thread(
            run_google_sync,
            credentials,
            tasks,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Google Calendar sync failed") from exc

    pulled = 0
    existing_events = await store.list("external_events")
    by_external_id = {event["external_id"]: event for event in existing_events}
    for event in events:
        private = event.get("extendedProperties", {}).get("private", {})
        if private.get("compass_task_id") or "start" not in event or "end" not in event:
            continue
        values = {
            "provider": "google",
            "external_id": event["id"],
            "title": event.get("summary", "Busy"),
            "start_time": parse_google_time(event["start"]),
            "end_time": parse_google_time(event["end"]),
            "raw_payload": event,
        }
        existing = by_external_id.get(event["id"])
        if existing:
            if not stored_event_changed(existing, values):
                continue
            await store.update("external_events", existing["id"], values)
        else:
            await store.create("external_events", values)
        pulled += 1

    for task_id, event_id in linked:
        await store.update("tasks", task_id, {"google_event_id": event_id})
    if credentials != refreshed_credentials:
        profile["google_credentials"] = refreshed_credentials
        await store.set_profile(profile)
    return GoogleSyncResult(pulled=pulled, pushed=pushed)
