import copy
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.dependencies import AuthenticatedUser, get_current_user, get_store
from app.main import app


class FakeStore:
    def __init__(self):
        self.profile = None
        self.collections: dict[str, dict[str, dict]] = {}

    async def get_profile(self):
        return copy.deepcopy(self.profile)

    async def set_profile(self, data):
        self.profile = copy.deepcopy(data)
        return copy.deepcopy(data)

    async def list(self, collection):
        return [
            {**copy.deepcopy(value), "id": document_id}
            for document_id, value in self.collections.get(collection, {}).items()
        ]

    async def get(self, collection, document_id):
        value = self.collections.get(collection, {}).get(document_id)
        return {**copy.deepcopy(value), "id": document_id} if value else None

    async def set(self, collection, document_id, data):
        self.collections.setdefault(collection, {})[document_id] = copy.deepcopy(data)
        return {**copy.deepcopy(data), "id": document_id}

    async def create(self, collection, data):
        return await self.set(collection, str(uuid.uuid4()), data)

    async def update(self, collection, document_id, values):
        current = await self.get(collection, document_id)
        if not current:
            return None
        current.pop("id")
        current.update(copy.deepcopy(values))
        return await self.set(collection, document_id, current)

    async def delete(self, collection, document_id):
        values = self.collections.get(collection, {})
        if document_id not in values:
            return False
        del values[document_id]
        return True

    async def batch(self, sets=None, deletes=None):
        for collection, document_id, data in sets or []:
            self.collections.setdefault(collection, {})[document_id] = copy.deepcopy(data)
        for collection, document_id in deletes or []:
            self.collections.get(collection, {}).pop(document_id, None)


@pytest.fixture
def fake_store():
    return FakeStore()


@pytest.fixture
def current_user():
    return AuthenticatedUser(
        id="firebase-user-1",
        email="student@example.com",
        token="test-token",
    )


@pytest_asyncio.fixture
async def client(fake_store, current_user):
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_store] = lambda: fake_store
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client
    app.dependency_overrides.clear()
