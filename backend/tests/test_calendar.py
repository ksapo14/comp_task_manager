from httpx import AsyncClient


async def test_task_crossing_midnight_appears_on_both_days(client: AsyncClient):
    created = await client.post(
        "/api/tasks",
        json={
            "title": "Late study",
            "duration_minutes": 60,
            "scheduled_start_time": "2026-07-01T23:30:00Z",
        },
    )
    assert created.status_code == 201

    first_day = await client.get("/api/calendar/blocks?start=2026-07-01&days=1")
    second_day = await client.get("/api/calendar/blocks?start=2026-07-02&days=1")

    assert [block["title"] for block in first_day.json()] == ["Late study"]
    assert [block["title"] for block in second_day.json()] == ["Late study"]
