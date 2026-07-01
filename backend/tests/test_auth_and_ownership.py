from httpx import AsyncClient


async def test_firebase_user_profile_is_created_on_first_request(client: AsyncClient):
    profile = await client.get("/api/auth/me")
    assert profile.status_code == 200
    assert profile.json()["id"] == "firebase-user-1"
    assert profile.json()["email"] == "student@example.com"
    assert profile.json()["preferred_start_time"] == "08:00:00"

    updated = await client.patch(
        "/api/auth/me",
        json={
            "preferred_start_time": "09:00",
            "preferred_end_time": "20:00",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["preferred_start_time"] == "09:00:00"

    overnight = await client.patch(
        "/api/auth/me",
        json={
            "preferred_start_time": "12:00",
            "preferred_end_time": "01:00",
        },
    )
    assert overnight.status_code == 200
    assert overnight.json()["preferred_end_time"] == "01:00:00"


async def test_task_crud_is_scoped_to_current_firebase_user(client: AsyncClient):
    created = await client.post(
        "/api/tasks",
        json={
            "title": "Private task",
            "duration_minutes": 30,
            "priority": "high",
        },
    )
    assert created.status_code == 201
    task = created.json()
    assert task["user_id"] == "firebase-user-1"

    visible = await client.get("/api/tasks")
    assert [item["id"] for item in visible.json()] == [task["id"]]

    updated = await client.patch(
        f"/api/tasks/{task['id']}",
        json={"is_completed": True},
    )
    assert updated.status_code == 200
    assert updated.json()["is_completed"] is True

    deleted = await client.delete(f"/api/tasks/{task['id']}")
    assert deleted.status_code == 204
