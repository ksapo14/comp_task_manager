import time
from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings
from .firestore import FirestoreREST

settings = get_settings()
bearer = HTTPBearer(auto_error=False)
_token_cache: dict[str, tuple[float, "AuthenticatedUser"]] = {}


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    token: str


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthenticatedUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Firebase ID token",
        )
    if not settings.vite_firebase_api_key or not settings.vite_firebase_project_id:
        raise HTTPException(status_code=503, detail="Firebase is not configured")

    token = credentials.credentials
    cached = _token_cache.get(token)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    if settings.firebase_auth_emulator_host:
        base = (
            f"http://{settings.firebase_auth_emulator_host}/"
            "identitytoolkit.googleapis.com/v1"
        )
    else:
        base = "https://identitytoolkit.googleapis.com/v1"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{base}/accounts:lookup",
                params={"key": settings.vite_firebase_api_key},
                json={"idToken": token},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Firebase Auth is unavailable") from exc
    if not response.is_success or not response.json().get("users"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase session",
        )
    account = response.json()["users"][0]
    user = AuthenticatedUser(
        id=account["localId"],
        email=account.get("email", ""),
        token=token,
    )
    if len(_token_cache) > 500:
        _token_cache.clear()
    _token_cache[token] = (time.monotonic() + 300, user)
    return user


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


def get_store(user: CurrentUser) -> FirestoreREST:
    return FirestoreREST(token=user.token, user_id=user.id)


Store = Annotated[FirestoreREST, Depends(get_store)]
