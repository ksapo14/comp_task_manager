from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time, timezone
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from .config import get_settings

settings = get_settings()


def encode_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, enum.Enum):
        return {"stringValue": value.value}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return {"timestampValue": value.astimezone(timezone.utc).isoformat()}
    if isinstance(value, (date, time)):
        return {"stringValue": value.isoformat()}
    if isinstance(value, list):
        return {"arrayValue": {"values": [encode_value(item) for item in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": encode_fields(value)}}
    return {"stringValue": str(value)}


def encode_fields(data: dict[str, Any]) -> dict[str, Any]:
    return {key: encode_value(value) for key, value in data.items()}


def decode_value(value: dict[str, Any]) -> Any:
    if "nullValue" in value:
        return None
    if "booleanValue" in value:
        return value["booleanValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "timestampValue" in value:
        return value["timestampValue"]
    if "stringValue" in value:
        return value["stringValue"]
    if "arrayValue" in value:
        return [decode_value(item) for item in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return decode_fields(value["mapValue"].get("fields", {}))
    return None


def decode_fields(fields: dict[str, Any]) -> dict[str, Any]:
    return {key: decode_value(value) for key, value in fields.items()}


class FirestoreREST:
    def __init__(self, token: str, user_id: str):
        self.token = token
        self.user_id = user_id
        self.database_path = (
            f"projects/{settings.vite_firebase_project_id}/databases/(default)"
        )
        if settings.firestore_emulator_host:
            self.base_url = (
                f"http://{settings.firestore_emulator_host}/v1/projects/"
                f"{settings.vite_firebase_project_id}/databases/(default)/documents"
            )
        else:
            self.base_url = (
                "https://firestore.googleapis.com/v1/projects/"
                f"{settings.vite_firebase_project_id}/databases/(default)/documents"
            )

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def document_url(
        self,
        collection: str | None = None,
        document_id: str | None = None,
    ) -> str:
        path = f"users/{quote(self.user_id, safe='')}"
        if collection:
            path += f"/{quote(collection, safe='')}"
        if document_id:
            path += f"/{quote(document_id, safe='')}"
        return f"{self.base_url}/{path}"

    def document_name(self, collection: str, document_id: str) -> str:
        return (
            f"{self.database_path}/documents/users/{self.user_id}/"
            f"{collection}/{document_id}"
        )

    async def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.request(method, url, headers=self.headers, **kwargs)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Firestore is unavailable") from exc
        if response.status_code == 404:
            return response
        if not response.is_success:
            detail = response.json().get("error", {}).get(
                "message", "Firestore request failed"
            )
            status_code = 403 if response.status_code in {401, 403} else 502
            raise HTTPException(status_code=status_code, detail=detail)
        return response

    async def get_profile(self) -> dict[str, Any] | None:
        response = await self.request("GET", self.document_url())
        if response.status_code == 404:
            return None
        return decode_fields(response.json().get("fields", {}))

    async def set_profile(self, data: dict[str, Any]) -> dict[str, Any]:
        response = await self.request(
            "PATCH",
            self.document_url(),
            json={"fields": encode_fields(data)},
        )
        return decode_fields(response.json().get("fields", {}))

    async def list(self, collection: str) -> list[dict[str, Any]]:
        response = await self.request(
            "GET",
            self.document_url(collection),
            params={"pageSize": 300},
        )
        if response.status_code == 404:
            return []
        items = []
        for document in response.json().get("documents", []):
            item = decode_fields(document.get("fields", {}))
            item["id"] = document["name"].rsplit("/", 1)[-1]
            items.append(item)
        return items

    async def get(self, collection: str, document_id: str) -> dict[str, Any] | None:
        response = await self.request("GET", self.document_url(collection, document_id))
        if response.status_code == 404:
            return None
        item = decode_fields(response.json().get("fields", {}))
        item["id"] = document_id
        return item

    async def set(
        self,
        collection: str,
        document_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        response = await self.request(
            "PATCH",
            self.document_url(collection, document_id),
            json={"fields": encode_fields(data)},
        )
        item = decode_fields(response.json().get("fields", {}))
        item["id"] = document_id
        return item

    async def create(self, collection: str, data: dict[str, Any]) -> dict[str, Any]:
        return await self.set(collection, str(uuid.uuid4()), data)

    async def update(
        self,
        collection: str,
        document_id: str,
        values: dict[str, Any],
    ) -> dict[str, Any] | None:
        current = await self.get(collection, document_id)
        if not current:
            return None
        current.pop("id", None)
        current.update(values)
        return await self.set(collection, document_id, current)

    async def delete(self, collection: str, document_id: str) -> bool:
        if not await self.get(collection, document_id):
            return False
        await self.request("DELETE", self.document_url(collection, document_id))
        return True

    async def batch(
        self,
        sets: list[tuple[str, str, dict[str, Any]]] | None = None,
        deletes: list[tuple[str, str]] | None = None,
    ) -> None:
        writes = [
            {
                "update": {
                    "name": self.document_name(collection, document_id),
                    "fields": encode_fields(data),
                }
            }
            for collection, document_id, data in sets or []
        ]
        writes.extend(
            {
                "delete": self.document_name(collection, document_id),
            }
            for collection, document_id in deletes or []
        )
        if not writes:
            return
        if len(writes) > 500:
            raise HTTPException(status_code=409, detail="Too many related records")
        await self.request("POST", f"{self.base_url}:commit", json={"writes": writes})
