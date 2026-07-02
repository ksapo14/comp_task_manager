from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter

from ..dependencies import CurrentUser, Store
from ..profile import ensure_profile
from ..roadmap import apply_blocked_state
from ..scheduler import ensure_utc, recurring_course_blocks, schedule_tasks
from ..schemas import (
    CalendarBlock,
    CourseRead,
    ScheduleRequest,
    ScheduleResult,
    TaskRead,
)

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/blocks", response_model=list[CalendarBlock])
async def calendar_blocks(
    user: CurrentUser,
    store: Store,
    start: date,
    days: int = 7,
) -> list[CalendarBlock]:
    days = min(max(days, 1), 42)
    range_start = datetime.combine(start, time.min, timezone.utc)
    range_end = range_start + timedelta(days=days)
    courses = [
        CourseRead.model_validate(item) for item in await store.list("courses")
    ]
    tasks = apply_blocked_state(
        [TaskRead.model_validate(item) for item in await store.list("tasks")]
    )
    events = await store.list("external_events")
    blocks = [
        CalendarBlock(
            id=f"{course.id}:{block_start.isoformat()}",
            title=f"{course.code} · {course.name}",
            kind="course",
            start=block_start,
            end=block_end,
            color=course.color,
            locked=True,
        )
        for block_start, block_end, course in recurring_course_blocks(
            courses, start, days
        )
    ]
    blocks.extend(
        CalendarBlock(
            id=task.id,
            title=task.title,
            kind="task",
            start=ensure_utc(task.scheduled_start_time),
            end=ensure_utc(task.scheduled_start_time)
            + timedelta(minutes=task.duration_minutes),
            color="#14b8a6",
        )
        for task in tasks
        if task.scheduled_start_time
        and not task.is_completed
        and not task.is_blocked
        and ensure_utc(task.scheduled_start_time) < range_end
        and ensure_utc(task.scheduled_start_time)
        + timedelta(minutes=task.duration_minutes)
        > range_start
    )
    blocks.extend(
        CalendarBlock(
            id=event["id"],
            title=event["title"],
            kind="external",
            start=datetime.fromisoformat(event["start_time"]),
            end=datetime.fromisoformat(event["end_time"]),
            color="#8b5cf6",
            locked=True,
        )
        for event in events
        if datetime.fromisoformat(event["start_time"]) < range_end
        and datetime.fromisoformat(event["end_time"]) > range_start
    )
    return sorted(blocks, key=lambda block: block.start)


@router.post("/auto-schedule", response_model=ScheduleResult)
async def auto_schedule(
    payload: ScheduleRequest,
    user: CurrentUser,
    store: Store,
) -> ScheduleResult:
    profile = await ensure_profile(user, store)
    start_date = payload.start_date or datetime.now(timezone.utc).date()
    range_start = datetime.combine(start_date, time.min, timezone.utc)
    range_end = range_start + timedelta(days=payload.horizon_days)
    courses = [
        CourseRead.model_validate(item) for item in await store.list("courses")
    ]
    tasks = apply_blocked_state(
        [TaskRead.model_validate(item) for item in await store.list("tasks")]
    )
    blocked_ids = [
        task.id
        for task in tasks
        if not task.scheduled_start_time
        and not task.is_completed
        and task.is_blocked
    ]
    unscheduled = [
        task
        for task in tasks
        if not task.scheduled_start_time
        and not task.is_completed
        and not task.is_blocked
    ]
    scheduled_tasks = [
        task
        for task in tasks
        if task.scheduled_start_time
        and not task.is_completed
        and ensure_utc(task.scheduled_start_time) < range_end
        and ensure_utc(task.scheduled_start_time)
        + timedelta(minutes=task.duration_minutes)
        > range_start
    ]
    events = await store.list("external_events")
    busy = [
        (block_start, block_end)
        for block_start, block_end, _ in recurring_course_blocks(
            courses, start_date, payload.horizon_days
        )
    ]
    busy.extend(
        (
            ensure_utc(task.scheduled_start_time),
            ensure_utc(task.scheduled_start_time)
            + timedelta(minutes=task.duration_minutes),
        )
        for task in scheduled_tasks
        if task.scheduled_start_time
    )
    busy.extend(
        (
            datetime.fromisoformat(event["start_time"]),
            datetime.fromisoformat(event["end_time"]),
        )
        for event in events
        if datetime.fromisoformat(event["start_time"]) < range_end
        and datetime.fromisoformat(event["end_time"]) > range_start
    )
    scheduled, missed = schedule_tasks(
        unscheduled,
        profile,
        start_date,
        payload.horizon_days,
        busy,
    )
    for task in scheduled:
        await store.update(
            "tasks",
            task.id,
            {"scheduled_start_time": task.scheduled_start_time},
        )
    return ScheduleResult(
        scheduled=scheduled,
        unscheduled_task_ids=[*blocked_ids, *missed],
    )
