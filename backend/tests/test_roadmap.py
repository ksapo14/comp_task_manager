from httpx import AsyncClient


async def create_task(client: AsyncClient, title: str, **values):
    response = await client.post("/api/tasks", json={"title": title, **values})
    assert response.status_code == 201
    return response.json()


async def test_projects_and_milestones_group_and_safely_detach_tasks(
    client: AsyncClient,
):
    project_response = await client.post(
        "/api/projects",
        json={"name": "Compiler Lab"},
    )
    assert project_response.status_code == 201
    project = project_response.json()
    milestone_response = await client.post(
        "/api/milestones",
        json={
            "project_id": project["id"],
            "name": "Lexer",
            "target_date": "2026-07-15",
        },
    )
    assert milestone_response.status_code == 201
    milestone = milestone_response.json()
    task = await create_task(
        client,
        "Tokenize source",
        project_id=project["id"],
        milestone_id=milestone["id"],
    )

    deleted_milestone = await client.delete(f"/api/milestones/{milestone['id']}")
    assert deleted_milestone.status_code == 204
    detached_from_milestone = (await client.get("/api/tasks")).json()[0]
    assert detached_from_milestone["project_id"] == project["id"]
    assert detached_from_milestone["milestone_id"] is None

    deleted_project = await client.delete(f"/api/projects/{project['id']}")
    assert deleted_project.status_code == 204
    detached_from_project = (await client.get("/api/tasks")).json()[0]
    assert detached_from_project["id"] == task["id"]
    assert detached_from_project["project_id"] is None


async def test_milestone_timeline_reorder_moves_nodes_between_date_slots(
    client: AsyncClient,
):
    project = (
        await client.post("/api/projects", json={"name": "Compiler Lab"})
    ).json()
    lexer = (
        await client.post(
            "/api/milestones",
            json={
                "project_id": project["id"],
                "name": "Lexer",
                "target_date": "2026-07-10",
            },
        )
    ).json()
    parser = (
        await client.post(
            "/api/milestones",
            json={
                "project_id": project["id"],
                "name": "Parser",
                "target_date": "2026-07-20",
            },
        )
    ).json()

    reordered = await client.post(
        "/api/milestones/reorder",
        json={
            "project_id": project["id"],
            "milestone_ids": [parser["id"], lexer["id"]],
        },
    )

    assert reordered.status_code == 200
    assert [item["name"] for item in reordered.json()] == ["Parser", "Lexer"]
    assert [item["target_date"] for item in reordered.json()] == [
        "2026-07-10",
        "2026-07-20",
    ]


async def test_task_dependencies_lock_scheduling_and_prevent_cycles(
    client: AsyncClient,
):
    prerequisite = await create_task(client, "Design tokens")
    dependent = await create_task(
        client,
        "Build lexer",
        blocked_by_task_ids=[prerequisite["id"]],
    )
    assert dependent["is_blocked"] is True

    manual_schedule = await client.patch(
        f"/api/tasks/{dependent['id']}",
        json={"scheduled_start_time": "2026-07-02T10:00:00Z"},
    )
    assert manual_schedule.status_code == 409

    cycle = await client.patch(
        f"/api/tasks/{prerequisite['id']}",
        json={"blocked_by_task_ids": [dependent["id"]]},
    )
    assert cycle.status_code == 409

    scheduled = await client.post(
        "/api/calendar/auto-schedule",
        json={"start_date": "2026-07-01", "horizon_days": 1},
    )
    assert dependent["id"] in scheduled.json()["unscheduled_task_ids"]
    assert dependent["id"] not in {
        task["id"] for task in scheduled.json()["scheduled"]
    }


async def test_reopening_prerequisite_unschedules_dependent(client: AsyncClient):
    prerequisite = await create_task(client, "Choose API", is_completed=True)
    dependent = await create_task(
        client,
        "Implement client",
        blocked_by_task_ids=[prerequisite["id"]],
        scheduled_start_time="2026-07-02T10:00:00Z",
    )
    assert dependent["is_blocked"] is False

    reopened = await client.patch(
        f"/api/tasks/{prerequisite['id']}",
        json={"is_completed": False},
    )
    assert reopened.status_code == 200
    tasks = (await client.get("/api/tasks")).json()
    updated_dependent = next(task for task in tasks if task["id"] == dependent["id"])
    assert updated_dependent["is_blocked"] is True
    assert updated_dependent["scheduled_start_time"] is None


async def test_deleting_task_removes_dependency_references(client: AsyncClient):
    prerequisite = await create_task(client, "Prototype")
    dependent = await create_task(
        client,
        "Production implementation",
        blocked_by_task_ids=[prerequisite["id"]],
    )

    deleted = await client.delete(f"/api/tasks/{prerequisite['id']}")
    assert deleted.status_code == 204
    remaining = (await client.get("/api/tasks")).json()
    assert remaining[0]["id"] == dependent["id"]
    assert remaining[0]["blocked_by_task_ids"] == []
    assert remaining[0]["is_blocked"] is False


async def test_spike_creates_and_preserves_dedicated_journal(client: AsyncClient):
    spike = await create_task(client, "Research parser", task_type="spike")
    assert spike["spike_journal_id"]
    journals = (await client.get("/api/journals")).json()
    assert journals[0]["id"] == spike["spike_journal_id"]
    assert journals[0]["title"] == "Spike: Research parser"
    assert "## API notes" in journals[0]["content_markdown"]

    protected_delete = await client.delete(
        f"/api/journals/{spike['spike_journal_id']}"
    )
    assert protected_delete.status_code == 409

    converted = await client.patch(
        f"/api/tasks/{spike['id']}",
        json={"task_type": "standard"},
    )
    assert converted.status_code == 200
    assert converted.json()["spike_journal_id"] is None
    journal_still_exists = await client.get("/api/journals")
    assert len(journal_still_exists.json()) == 1
