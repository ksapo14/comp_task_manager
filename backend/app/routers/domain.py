from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Response

from ..dependencies import CurrentUser, Store
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
    RoutineRequest,
    TaskCreate,
    TaskRead,
    TaskUpdate,
)

router = APIRouter(tags=["workspace"])


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


@router.get("/tasks", response_model=list[TaskRead])
async def list_tasks(
    user: CurrentUser,
    store: Store,
    course_id: str | None = None,
    completed: bool | None = None,
) -> list[TaskRead]:
    tasks = [TaskRead.model_validate(item) for item in await store.list("tasks")]
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
    await owned_course(payload.course_id, store)
    item = await store.create(
        "tasks",
        {
            **payload.model_dump(mode="json"),
            "user_id": user.id,
            "google_event_id": None,
            "created_at": now(),
        },
    )
    return TaskRead.model_validate(item)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    user: CurrentUser,
    store: Store,
) -> TaskRead:
    values = payload.model_dump(mode="json", exclude_unset=True)
    if "course_id" in values:
        await owned_course(values["course_id"], store)
    item = await store.update("tasks", task_id, values)
    if not item:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskRead.model_validate(item)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    user: CurrentUser,
    store: Store,
) -> Response:
    if not await store.delete("tasks", task_id):
        raise HTTPException(status_code=404, detail="Task not found")
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
    if not await store.delete("journals", journal_id):
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return Response(status_code=204)


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
