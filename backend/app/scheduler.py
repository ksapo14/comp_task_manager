from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException

from .schemas import CourseRead, Priority, TaskRead, UserRead

DAY_CODES = {0: "MO", 1: "TU", 2: "WE", 3: "TH", 4: "FR", 5: "SA", 6: "SU"}


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_course_rule(rule: str) -> tuple[set[str], time, time]:
    try:
        parts = dict(part.split("=", 1) for part in rule.split(";"))
        if parts.get("FREQ") != "WEEKLY":
            raise ValueError
        days = set(parts["BYDAY"].split(","))
        start = time.fromisoformat(parts["START"])
        end = time.fromisoformat(parts["END"])
        if not days or end <= start:
            raise ValueError
        return days, start, end
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "schedule_rrule must match "
                "FREQ=WEEKLY;BYDAY=MO,WE;START=13:00;END=14:15"
            ),
        ) from exc


def recurring_course_blocks(
    courses: list[CourseRead], start_date: date, horizon_days: int
) -> list[tuple[datetime, datetime, CourseRead]]:
    blocks: list[tuple[datetime, datetime, CourseRead]] = []
    for course in courses:
        days, start_time, end_time = parse_course_rule(course.schedule_rrule)
        for offset in range(horizon_days):
            day = start_date + timedelta(days=offset)
            if DAY_CODES[day.weekday()] in days:
                blocks.append(
                    (
                        datetime.combine(day, start_time, timezone.utc),
                        datetime.combine(day, end_time, timezone.utc),
                        course,
                    )
                )
    return blocks


def overlaps(
    start: datetime, end: datetime, busy: list[tuple[datetime, datetime]]
) -> bool:
    return any(start < busy_end and end > busy_start for busy_start, busy_end in busy)


def break_rank(
    start: datetime,
    end: datetime,
    work_start: datetime,
    work_end: datetime,
    busy: list[tuple[datetime, datetime]],
) -> int:
    previous_end = max(
        (
            busy_end
            for _, busy_end in busy
            if work_start <= busy_end <= start
        ),
        default=work_start,
    )
    next_start = min(
        (
            busy_start
            for busy_start, _ in busy
            if end <= busy_start <= work_end
        ),
        default=work_end,
    )
    largest_break = max(start - previous_end, next_start - end)
    if largest_break >= timedelta(hours=1):
        return 3
    if largest_break >= timedelta(minutes=30):
        return 2
    if largest_break >= timedelta(minutes=15):
        return 1
    return 0


def best_daily_slot(
    duration: timedelta,
    work_start: datetime,
    work_end: datetime,
    busy: list[tuple[datetime, datetime]],
    due_date: datetime | None,
) -> datetime | None:
    candidates: list[tuple[int, datetime]] = []
    cursor = work_start
    while cursor + duration <= work_end:
        candidate_end = cursor + duration
        if due_date and cursor > ensure_utc(due_date):
            break
        if not overlaps(cursor, candidate_end, busy):
            candidates.append(
                (
                    break_rank(cursor, candidate_end, work_start, work_end, busy),
                    cursor,
                )
            )
        cursor += timedelta(minutes=15)
    if not candidates:
        return None
    return min(candidates, key=lambda candidate: (-candidate[0], candidate[1]))[1]


def schedule_tasks(
    tasks: list[TaskRead],
    user: UserRead,
    start_date: date,
    horizon_days: int,
    busy: list[tuple[datetime, datetime]],
) -> tuple[list[TaskRead], list[str]]:
    priority_rank = {Priority.high: 0, Priority.medium: 1, Priority.low: 2}
    far_future = datetime.max.replace(tzinfo=timezone.utc)
    ordered = sorted(
        tasks,
        key=lambda task: (
            priority_rank[task.priority],
            ensure_utc(task.due_date) if task.due_date else far_future,
            -task.duration_minutes,
        ),
    )
    scheduled: list[TaskRead] = []
    missed: list[str] = []

    for task in ordered:
        duration = timedelta(minutes=task.duration_minutes)
        placed = False
        for offset in range(horizon_days):
            day = start_date + timedelta(days=offset)
            work_start = datetime.combine(day, user.preferred_start_time, timezone.utc)
            work_end = datetime.combine(day, user.preferred_end_time, timezone.utc)
            if user.preferred_end_time <= user.preferred_start_time:
                work_end += timedelta(days=1)
            current_time = datetime.now(timezone.utc)
            if work_start <= current_time < work_end:
                rounded_minutes = ((current_time.minute + 14) // 15) * 15
                work_start = current_time.replace(second=0, microsecond=0, minute=0)
                work_start += timedelta(minutes=rounded_minutes)
            slot = best_daily_slot(
                duration,
                work_start,
                work_end,
                busy,
                task.due_date,
            )
            if slot:
                task.scheduled_start_time = slot
                busy.append((slot, slot + duration))
                busy.sort(key=lambda block: block[0])
                scheduled.append(task)
                placed = True
            if placed:
                break
        if not placed:
            missed.append(task.id)

    return scheduled, missed
