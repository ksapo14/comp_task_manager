from datetime import datetime, timedelta, timezone

import pytest


@pytest.mark.asyncio
async def test_school_workspace_defaults_are_empty(client):
    response = await client.get("/api/school-workspace")

    assert response.status_code == 200
    assert response.json() == {
        "flashcards": {
            "cards": [],
            "mastered_count": 0,
            "review_count": 0,
        },
        "focus": {
            "tasks": [],
        },
        "timeline": {
            "semester_start": None,
            "semester_end": None,
            "milestones": [],
        },
    }


@pytest.mark.asyncio
async def test_school_modules_persist_independently(client):
    card_payload = {
        "cards": [
            {
                "id": "card-1",
                "course": "Algorithms",
                "question": "What is an invariant?",
                "answer": "A property preserved by every iteration.",
            }
        ],
        "mastered_count": 3,
        "review_count": 1,
    }
    focus_payload = {
        "tasks": [
            {
                "id": "task-1",
                "title": "Review graphs",
                "course": "Algorithms",
                "status": "progress",
            }
        ],
    }

    card_response = await client.put(
        "/api/school-workspace/flashcards",
        json=card_payload,
    )
    focus_response = await client.put(
        "/api/school-workspace/focus",
        json=focus_payload,
    )

    assert card_response.status_code == 200
    assert focus_response.status_code == 200
    assert (await client.get("/api/school-workspace/flashcards")).json() == card_payload
    assert (await client.get("/api/school-workspace/focus")).json() == focus_payload


@pytest.mark.asyncio
async def test_school_timeline_rejects_an_inverted_semester(client):
    start = datetime.now(timezone.utc)
    response = await client.put(
        "/api/school-workspace/timeline",
        json={
            "semester_start": start.isoformat(),
            "semester_end": (start - timedelta(days=1)).isoformat(),
            "milestones": [],
        },
    )

    assert response.status_code == 422
