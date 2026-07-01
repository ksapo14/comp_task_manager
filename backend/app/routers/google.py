import asyncio
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..config import get_settings
from ..dependencies import CurrentUser, Store
from ..firestore import FirestoreREST
from ..profile import ensure_profile
from ..schemas import GoogleStatus, GoogleSyncResult, TaskRead

router = APIRouter(prefix="/google", tags=["google-calendar"])
settings = get_settings()
SCOPES = ["https://www.googleapis.com/auth/calendar"]
oauth_states: dict[str, tuple[float, str, str]] = {}
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
    return bool(settings.google_client_id and settings.google_client_secret)


def credential_dict(credentials: Credentials) -> dict[str, Any]:
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
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
        state = secrets.token_urlsafe(32)
        now = time.monotonic()
        for key, value in list(oauth_states.items()):
            if value[0] <= now:
                oauth_states.pop(key, None)
        oauth_states[state] = (now + 600, profile.id, user.token)
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


@router.get("/callback", include_in_schema=False)
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    if not configured():
        raise HTTPException(status_code=503, detail="Google Calendar is not configured")
    state_data = oauth_states.pop(state, None)
    if not state_data or state_data[0] <= time.monotonic():
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    _, user_id, firebase_token = state_data
    flow = Flow.from_client_config(client_config(), scopes=SCOPES, state=state)
    flow.redirect_uri = settings.google_redirect_uri
    try:
        await asyncio.to_thread(flow.fetch_token, code=code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Google authorization failed") from exc

    store = FirestoreREST(token=firebase_token, user_id=user_id)
    profile = await store.get_profile()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    profile["google_credentials"] = credential_dict(flow.credentials)
    await store.set_profile(profile)
    return RedirectResponse(f"{settings.frontend_url}/settings?google=connected")


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
    credentials = Credentials(**credentials_data)
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
