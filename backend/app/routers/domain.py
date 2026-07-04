import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Response

from ..dependencies import CurrentUser, Store
from ..roadmap import apply_blocked_state, dependency_graph_has_cycle, task_is_blocked
from ..scheduler import parse_course_rule
from ..schemas import (
    CourseCreate,
    CourseRead,
    CourseUpdate,
    FocusLinkCreate,
    FocusLinkRead,
    HabitCreate,
    HabitRead,
    HabitToggle,
    JournalCreate,
    JournalRead,
    JournalUpdate,
    MilestoneCreate,
    MilestoneRead,
    MilestoneReorder,
    MilestoneUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    RoutineRequest,
    SchoolFlashcardDeck,
    SchoolFocusMatrix,
    SchoolTimeline,
    SchoolWorkspaceRead,
    TaskCreate,
    TaskRead,
    TaskType,
    TaskUpdate,
)

router = APIRouter(tags=["workspace"])

SCHOOL_WORKSPACE_COLLECTION = "school_workspace"


def now() -> datetime:
    return datetime.now(timezone.utc)


async def owned_course(
    course_id: str | None,
    store: Store,
) -> dict | None:
    if not course_id:
        return None
    course = await store.get("courses", course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


async def owned_project(project_id: str | None, store: Store) -> dict | None:
    if not project_id:
        return None
    project = await store.get("projects", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def owned_milestone(milestone_id: str | None, store: Store) -> dict | None:
    if not milestone_id:
        return None
    milestone = await store.get("milestones", milestone_id)
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return milestone


def task_models(items: list[dict]) -> list[TaskRead]:
    return apply_blocked_state([TaskRead.model_validate(item) for item in items])


async def validate_task_relationships(
    task_id: str,
    values: dict,
    tasks: list[TaskRead],
    store: Store,
) -> None:
    await owned_course(values.get("course_id"), store)
    project = await owned_project(values.get("project_id"), store)
    milestone = await owned_milestone(values.get("milestone_id"), store)
    if milestone and (
        not project or milestone["project_id"] != values.get("project_id")
    ):
        raise HTTPException(
            status_code=409,
            detail="Milestone must belong to the selected project",
        )

    blocker_ids = values.get("blocked_by_task_ids", [])
    if len(blocker_ids) != len(set(blocker_ids)):
        raise HTTPException(status_code=409, detail="Task blockers must be unique")
    if task_id in blocker_ids:
        raise HTTPException(status_code=409, detail="A task cannot block itself")
    task_ids = {task.id for task in tasks}
    if missing := [blocker_id for blocker_id in blocker_ids if blocker_id not in task_ids]:
        raise HTTPException(
            status_code=404,
            detail=f"Blocking task not found: {missing[0]}",
        )
    if dependency_graph_has_cycle(task_id, blocker_ids, tasks):
        raise HTTPException(
            status_code=409,
            detail="Task dependencies cannot contain a cycle",
        )


def spike_template(title: str) -> str:
    return (
        f"## Research question\n\nWhat must be learned before **{title}** can proceed?\n\n"
        "## Findings\n\n\n## Architecture sketch\n\n```text\n\n```\n\n"
        "## API notes\n\n"
    )


@router.get("/courses", response_model=list[CourseRead])
async def list_courses(user: CurrentUser, store: Store) -> list[CourseRead]:
    courses = [
        CourseRead.model_validate(item) for item in await store.list("courses")
    ]
    return sorted(courses, key=lambda course: course.code)


@router.post("/courses", response_model=CourseRead, status_code=201)
async def create_course(
    payload: CourseCreate,
    user: CurrentUser,
    store: Store,
) -> CourseRead:
    parse_course_rule(payload.schedule_rrule)
    item = await store.create(
        "courses",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "created_at": now(),
        },
    )
    return CourseRead.model_validate(item)


@router.put("/courses/{course_id}", response_model=CourseRead)
async def update_course(
    course_id: str,
    payload: CourseUpdate,
    user: CurrentUser,
    store: Store,
) -> CourseRead:
    current = await owned_course(course_id, store)
    assert current
    parse_course_rule(payload.schedule_rrule)
    current.update(payload.model_dump(mode="json"))
    current.pop("id", None)
    item = await store.set("courses", course_id, current)
    return CourseRead.model_validate(item)


@router.delete("/courses/{course_id}", status_code=204)
async def delete_course(
    course_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await store.delete("courses", course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return Response(status_code=204)


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(user: CurrentUser, store: Store) -> list[ProjectRead]:
    projects = [
        ProjectRead.model_validate(item) for item in await store.list("projects")
    ]
    return sorted(projects, key=lambda project: project.created_at)


@router.post("/projects", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    user: CurrentUser,
    store: Store,
) -> ProjectRead:
    item = await store.create(
        "projects",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "created_at": now(),
        },
    )
    return ProjectRead.model_validate(item)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    user: CurrentUser,
    store: Store,
) -> ProjectRead:
    if not await owned_project(project_id, store):
        raise HTTPException(status_code=404, detail="Project not found")
    item = await store.update(
        "projects",
        project_id,
        payload.model_dump(mode="json"),
    )
    assert item
    return ProjectRead.model_validate(item)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await owned_project(project_id, store):
        raise HTTPException(status_code=404, detail="Project not found")
    milestones = await store.list("milestones")
    tasks = await store.list("tasks")
    project_milestone_ids = {
        milestone["id"]
        for milestone in milestones
        if milestone.get("project_id") == project_id
    }
    task_updates: list[tuple[str, str, dict]] = []
    for task in tasks:
        if (
            task.get("project_id") != project_id
            and task.get("milestone_id") not in project_milestone_ids
        ):
            continue
        task_id = task.pop("id")
        task["project_id"] = None
        task["milestone_id"] = None
        task_updates.append(("tasks", task_id, task))
    await store.batch(
        sets=task_updates,
        deletes=[
            ("projects", project_id),
            *[
                ("milestones", milestone_id)
                for milestone_id in project_milestone_ids
            ],
        ],
    )
    return Response(status_code=204)


@router.get("/milestones", response_model=list[MilestoneRead])
async def list_milestones(
    user: CurrentUser,
    store: Store,
    project_id: str | None = None,
) -> list[MilestoneRead]:
    milestones = [
        MilestoneRead.model_validate(item)
        for item in await store.list("milestones")
    ]
    if project_id:
        milestones = [
            milestone for milestone in milestones if milestone.project_id == project_id
        ]
    return sorted(milestones, key=lambda milestone: milestone.created_at)


@router.post("/milestones", response_model=MilestoneRead, status_code=201)
async def create_milestone(
    payload: MilestoneCreate,
    user: CurrentUser,
    store: Store,
) -> MilestoneRead:
    await owned_project(payload.project_id, store)
    item = await store.create(
        "milestones",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "created_at": now(),
        },
    )
    return MilestoneRead.model_validate(item)


@router.patch("/milestones/{milestone_id}", response_model=MilestoneRead)
async def update_milestone(
    milestone_id: str,
    payload: MilestoneUpdate,
    user: CurrentUser,
    store: Store,
) -> MilestoneRead:
    if not await owned_milestone(milestone_id, store):
        raise HTTPException(status_code=404, detail="Milestone not found")
    item = await store.update(
        "milestones",
        milestone_id,
        payload.model_dump(mode="json", exclude_unset=True),
    )
    assert item
    return MilestoneRead.model_validate(item)


@router.post("/milestones/reorder", response_model=list[MilestoneRead])
async def reorder_milestones(
    payload: MilestoneReorder,
    user: CurrentUser,
    store: Store,
) -> list[MilestoneRead]:
    await owned_project(payload.project_id, store)
    milestones = [
        milestone
        for milestone in await store.list("milestones")
        if milestone.get("project_id") == payload.project_id
    ]
    milestone_ids = [milestone["id"] for milestone in milestones]
    if (
        len(payload.milestone_ids) != len(set(payload.milestone_ids))
        or set(payload.milestone_ids) != set(milestone_ids)
    ):
        raise HTTPException(
            status_code=409,
            detail="Timeline order must include every project milestone exactly once",
        )
    if any(not milestone.get("target_date") for milestone in milestones):
        raise HTTPException(
            status_code=409,
            detail="Every milestone needs a date before the timeline can be reordered",
        )
    date_slots = sorted(milestone["target_date"] for milestone in milestones)
    by_id = {milestone["id"]: milestone for milestone in milestones}
    sets: list[tuple[str, str, dict]] = []
    reordered: list[MilestoneRead] = []
    for milestone_id, target_date in zip(payload.milestone_ids, date_slots):
        milestone = by_id[milestone_id]
        milestone.pop("id", None)
        milestone["target_date"] = target_date
        sets.append(("milestones", milestone_id, milestone))
        reordered.append(
            MilestoneRead.model_validate({**milestone, "id": milestone_id})
        )
    await store.batch(sets=sets)
    return reordered


@router.delete("/milestones/{milestone_id}", status_code=204)
async def delete_milestone(
    milestone_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    milestone = await owned_milestone(milestone_id, store)
    assert milestone
    task_updates: list[tuple[str, str, dict]] = []
    for task in await store.list("tasks"):
        if task.get("milestone_id") != milestone_id:
            continue
        task_id = task.pop("id")
        task["project_id"] = milestone["project_id"]
        task["milestone_id"] = None
        task_updates.append(("tasks", task_id, task))
    await store.batch(
        sets=task_updates,
        deletes=[("milestones", milestone_id)],
    )
    return Response(status_code=204)


@router.get("/tasks", response_model=list[TaskRead])
async def list_tasks(
    user: CurrentUser,
    store: Store,
    course_id: str | None = None,
    completed: bool | None = None,
) -> list[TaskRead]:
    tasks = task_models(await store.list("tasks"))
    if course_id:
        tasks = [task for task in tasks if task.course_id == course_id]
    if completed is not None:
        tasks = [task for task in tasks if task.is_completed == completed]
    return sorted(
        tasks,
        key=lambda task: (
            task.is_completed,
            task.due_date or datetime.max.replace(tzinfo=timezone.utc),
            task.created_at,
        ),
    )


@router.post("/tasks", response_model=TaskRead, status_code=201)
async def create_task(
    payload: TaskCreate,
    user: CurrentUser,
    store: Store,
) -> TaskRead:
    task_id = str(uuid.uuid4())
    tasks = task_models(await store.list("tasks"))
    values = payload.model_dump(mode="json")
    await validate_task_relationships(task_id, values, tasks, store)
    candidate = TaskRead(
        id=task_id,
        user_id=user.id,
        created_at=now(),
        google_event_id=None,
        **values,
    )
    tasks_by_id = {task.id: task for task in tasks}
    candidate.is_blocked = task_is_blocked(candidate, tasks_by_id)
    if candidate.is_blocked and candidate.scheduled_start_time:
        raise HTTPException(
            status_code=409,
            detail="Blocked tasks cannot be scheduled",
        )
    task_data = {
        **values,
        "user_id": user.id,
        "google_event_id": None,
        "spike_journal_id": None,
        "created_at": candidate.created_at,
    }
    if candidate.task_type == TaskType.spike:
        journal_id = str(uuid.uuid4())
        timestamp = now()
        task_data["spike_journal_id"] = journal_id
        journal_data = {
            "title": f"Spike: {candidate.title}",
            "content_markdown": spike_template(candidate.title),
            "course_id": candidate.course_id,
            "user_id": user.id,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        await store.batch(
            sets=[
                ("tasks", task_id, task_data),
                ("journals", journal_id, journal_data),
            ],
        )
    else:
        await store.set("tasks", task_id, task_data)
    candidate.spike_journal_id = task_data["spike_journal_id"]
    return candidate


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    user: CurrentUser,
    store: Store,
) -> TaskRead:
    current = await store.get("tasks", task_id)
    if not current:
        raise HTTPException(status_code=404, detail="Task not found")
    current.pop("id", None)
    values = payload.model_dump(mode="json", exclude_unset=True)
    candidate_data = {**current, **values}
    tasks = task_models(await store.list("tasks"))
    await validate_task_relationships(task_id, candidate_data, tasks, store)
    candidate = TaskRead.model_validate({**candidate_data, "id": task_id})
    tasks_by_id = {task.id: task for task in tasks}
    tasks_by_id[task_id] = candidate
    candidate.is_blocked = task_is_blocked(candidate, tasks_by_id)
    if (
        candidate.is_blocked
        and values.get("scheduled_start_time") is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Blocked tasks cannot be scheduled",
        )
    if candidate.is_blocked:
        candidate_data["scheduled_start_time"] = None
        candidate.scheduled_start_time = None

    sets: list[tuple[str, str, dict]] = []
    if candidate.task_type == TaskType.spike and not candidate.spike_journal_id:
        journal_id = str(uuid.uuid4())
        timestamp = now()
        candidate_data["spike_journal_id"] = journal_id
        candidate.spike_journal_id = journal_id
        sets.append(
            (
                "journals",
                journal_id,
                {
                    "title": f"Spike: {candidate.title}",
                    "content_markdown": spike_template(candidate.title),
                    "course_id": candidate.course_id,
                    "user_id": user.id,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            )
        )
    elif candidate.task_type == TaskType.standard:
        candidate_data["spike_journal_id"] = None
        candidate.spike_journal_id = None

    post_tasks = [
        candidate if task.id == task_id else task
        for task in tasks
    ]
    post_by_id = {task.id: task for task in post_tasks}
    for task in post_tasks:
        if task.id == task_id or not task.scheduled_start_time:
            continue
        if task_is_blocked(task, post_by_id):
            stored = await store.get("tasks", task.id)
            if stored:
                stored.pop("id", None)
                stored["scheduled_start_time"] = None
                sets.append(("tasks", task.id, stored))
    sets.append(("tasks", task_id, candidate_data))
    await store.batch(sets=sets)
    return candidate


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await store.get("tasks", task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    sets: list[tuple[str, str, dict]] = []
    for task in await store.list("tasks"):
        blocker_ids = task.get("blocked_by_task_ids", [])
        if task_id not in blocker_ids:
            continue
        dependent_id = task.pop("id")
        task["blocked_by_task_ids"] = [
            blocker_id for blocker_id in blocker_ids if blocker_id != task_id
        ]
        sets.append(("tasks", dependent_id, task))
    await store.batch(sets=sets, deletes=[("tasks", task_id)])
    return Response(status_code=204)


@router.post("/tasks/routines", response_model=list[TaskRead], status_code=201)
async def create_routines(
    payload: RoutineRequest,
    user: CurrentUser,
    store: Store,
) -> list[TaskRead]:
    defaults = {
        "Wake up": (15, "high"),
        "Breakfast": (30, "medium"),
        "Lunch": (30, "medium"),
        "Dinner": (45, "medium"),
        "Sleep": (480, "high"),
    }
    tasks = [TaskRead.model_validate(item) for item in await store.list("tasks")]
    today = now().date()
    existing = {
        task.title
        for task in tasks
        if task.is_routine and task.created_at.date() == today
    }
    created: list[TaskRead] = []
    for name in payload.names:
        if name not in defaults or name in existing:
            continue
        duration, priority = defaults[name]
        item = await store.create(
            "tasks",
            {
                "user_id": user.id,
                "course_id": None,
                "title": name,
                "description": "",
                "duration_minutes": duration,
                "priority": priority,
                "due_date": None,
                "scheduled_start_time": None,
                "is_completed": False,
                "is_routine": True,
                "google_event_id": None,
                "created_at": now(),
            },
        )
        created.append(TaskRead.model_validate(item))
    return created


@router.get("/habits", response_model=list[HabitRead])
async def list_habits(
    user: CurrentUser,
    store: Store,
    days: int = Query(default=31, ge=7, le=366),
) -> list[HabitRead]:
    cutoff = date.today() - timedelta(days=days)
    habits = [
        HabitRead.model_validate(item) for item in await store.list("habits")
    ]
    for habit in habits:
        habit.completion_history = [
            completed for completed in habit.completion_history if completed >= cutoff
        ]
    return sorted(habits, key=lambda habit: habit.created_at)


@router.post("/habits", response_model=HabitRead, status_code=201)
async def create_habit(
    payload: HabitCreate,
    user: CurrentUser,
    store: Store,
) -> HabitRead:
    await owned_course(payload.course_id, store)
    item = await store.create(
        "habits",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "completion_history": [],
            "created_at": now(),
        },
    )
    return HabitRead.model_validate(item)


@router.post("/habits/{habit_id}/toggle", response_model=HabitRead)
async def toggle_habit(
    habit_id: str,
    payload: HabitToggle,
    user: CurrentUser,
    store: Store,
) -> HabitRead:
    current = await store.get("habits", habit_id)
    if not current:
        raise HTTPException(status_code=404, detail="Habit not found")
    key = payload.completed_on.isoformat()
    history = list(current.get("completion_history", []))
    if key in history:
        history.remove(key)
    else:
        history.append(key)
    current.pop("id", None)
    current["completion_history"] = history
    item = await store.set("habits", habit_id, current)
    return HabitRead.model_validate(item)


@router.delete("/habits/{habit_id}", status_code=204)
async def delete_habit(
    habit_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await store.delete("habits", habit_id):
        raise HTTPException(status_code=404, detail="Habit not found")
    return Response(status_code=204)


@router.get("/journals", response_model=list[JournalRead])
async def list_journals(user: CurrentUser, store: Store) -> list[JournalRead]:
    entries = [
        JournalRead.model_validate(item) for item in await store.list("journals")
    ]
    return sorted(entries, key=lambda entry: entry.updated_at, reverse=True)


@router.post("/journals", response_model=JournalRead, status_code=201)
async def create_journal(
    payload: JournalCreate,
    user: CurrentUser,
    store: Store,
) -> JournalRead:
    await owned_course(payload.course_id, store)
    timestamp = now()
    item = await store.create(
        "journals",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    )
    return JournalRead.model_validate(item)


@router.put("/journals/{journal_id}", response_model=JournalRead)
async def update_journal(
    journal_id: str,
    payload: JournalUpdate,
    user: CurrentUser,
    store: Store,
) -> JournalRead:
    await owned_course(payload.course_id, store)
    item = await store.update(
        "journals",
        journal_id,
        {**payload.model_dump(mode="json"), "updated_at": now()},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return JournalRead.model_validate(item)


@router.delete("/journals/{journal_id}", status_code=204)
async def delete_journal(
    journal_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    linked_spike = next(
        (
            task
            for task in task_models(await store.list("tasks"))
            if task.task_type == TaskType.spike
            and task.spike_journal_id == journal_id
        ),
        None,
    )
    if linked_spike:
        raise HTTPException(
            status_code=409,
            detail="Convert or delete the linked spike before deleting this entry",
        )
    if not await store.delete("journals", journal_id):
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return Response(status_code=204)


async def school_workspace_document(
    store: Store,
    document_id: str,
    model: type[SchoolFlashcardDeck | SchoolFocusMatrix | SchoolTimeline],
) -> SchoolFlashcardDeck | SchoolFocusMatrix | SchoolTimeline:
    item = await store.get(SCHOOL_WORKSPACE_COLLECTION, document_id)
    return model.model_validate(item or {})


@router.get("/school-workspace", response_model=SchoolWorkspaceRead)
async def get_school_workspace(
    user: CurrentUser,
    store: Store,
) -> SchoolWorkspaceRead:
    flashcards = await school_workspace_document(store, "flashcards", SchoolFlashcardDeck)
    focus = await school_workspace_document(store, "focus", SchoolFocusMatrix)
    timeline = await school_workspace_document(store, "timeline", SchoolTimeline)
    return SchoolWorkspaceRead(
        flashcards=flashcards,
        focus=focus,
        timeline=timeline,
    )


@router.get("/school-workspace/flashcards", response_model=SchoolFlashcardDeck)
async def get_school_flashcards(
    user: CurrentUser,
    store: Store,
) -> SchoolFlashcardDeck:
    item = await school_workspace_document(store, "flashcards", SchoolFlashcardDeck)
    return SchoolFlashcardDeck.model_validate(item)


@router.put("/school-workspace/flashcards", response_model=SchoolFlashcardDeck)
async def put_school_flashcards(
    payload: SchoolFlashcardDeck,
    user: CurrentUser,
    store: Store,
) -> SchoolFlashcardDeck:
    item = await store.set(
        SCHOOL_WORKSPACE_COLLECTION,
        "flashcards",
        payload.model_dump(),
    )
    return SchoolFlashcardDeck.model_validate(item)


@router.get("/school-workspace/focus", response_model=SchoolFocusMatrix)
async def get_school_focus(
    user: CurrentUser,
    store: Store,
) -> SchoolFocusMatrix:
    item = await school_workspace_document(store, "focus", SchoolFocusMatrix)
    return SchoolFocusMatrix.model_validate(item)


@router.put("/school-workspace/focus", response_model=SchoolFocusMatrix)
async def put_school_focus(
    payload: SchoolFocusMatrix,
    user: CurrentUser,
    store: Store,
) -> SchoolFocusMatrix:
    item = await store.set(
        SCHOOL_WORKSPACE_COLLECTION,
        "focus",
        payload.model_dump(),
    )
    return SchoolFocusMatrix.model_validate(item)


@router.get("/school-workspace/timeline", response_model=SchoolTimeline)
async def get_school_timeline(
    user: CurrentUser,
    store: Store,
) -> SchoolTimeline:
    item = await school_workspace_document(store, "timeline", SchoolTimeline)
    return SchoolTimeline.model_validate(item)


@router.put("/school-workspace/timeline", response_model=SchoolTimeline)
async def put_school_timeline(
    payload: SchoolTimeline,
    user: CurrentUser,
    store: Store,
) -> SchoolTimeline:
    item = await store.set(
        SCHOOL_WORKSPACE_COLLECTION,
        "timeline",
        payload.model_dump(),
    )
    return SchoolTimeline.model_validate(item)


@router.get("/focus-links", response_model=list[FocusLinkRead])
async def list_focus_links(
    user: CurrentUser,
    store: Store,
) -> list[FocusLinkRead]:
    links = [
        FocusLinkRead.model_validate(item)
        for item in await store.list("focus_links")
    ]
    return sorted(links, key=lambda link: link.position)


@router.post("/focus-links", response_model=FocusLinkRead, status_code=201)
async def create_focus_link(
    payload: FocusLinkCreate,
    user: CurrentUser,
    store: Store,
) -> FocusLinkRead:
    links = await store.list("focus_links")
    item = await store.create(
        "focus_links",
        {
            "label": payload.label,
            "url": str(payload.url),
            "position": len(links),
        },
    )
    return FocusLinkRead.model_validate(item)


@router.delete("/focus-links/{link_id}", status_code=204)
async def delete_focus_link(
    link_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await store.delete("focus_links", link_id):
        raise HTTPException(status_code=404, detail="Focus link not found")
    return Response(status_code=204)
