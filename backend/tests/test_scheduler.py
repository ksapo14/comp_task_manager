from datetime import date, datetime, time, timezone

from app.scheduler import recurring_course_blocks, schedule_tasks
from app.schemas import CourseRead, Priority, TaskRead, UserRead


def test_course_blocks_are_recurring_and_locked_in_busy_time():
    monday = date(2026, 6, 29)
    course = CourseRead(
        id="course",
        user_id="user",
        code="CS301",
        name="Algorithms",
        schedule_rrule="FREQ=WEEKLY;BYDAY=MO,WE;START=09:00;END=10:15",
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    blocks = recurring_course_blocks([course], monday, 3)
    assert len(blocks) == 2
    assert blocks[0][0].weekday() == 0
    assert blocks[1][0].weekday() == 2


def test_scheduler_prioritizes_high_priority_and_avoids_class():
    monday = date(2026, 6, 29)
    user = UserRead(
        id="user",
        email="student@example.com",
        preferred_start_time=time(9),
        preferred_end_time=time(12, 30),
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    high = TaskRead(
        id="high",
        user_id="user",
        title="High priority",
        priority=Priority.high,
        duration_minutes=60,
        due_date=datetime(2026, 7, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    low = TaskRead(
        id="low",
        user_id="user",
        title="Low priority",
        priority=Priority.low,
        duration_minutes=60,
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    busy = [
        (
            datetime(2026, 6, 29, 9, tzinfo=timezone.utc),
            datetime(2026, 6, 29, 10, 15, tzinfo=timezone.utc),
        )
    ]
    scheduled, missed = schedule_tasks([low, high], user, monday, 1, busy)
    assert missed == []
    assert scheduled[0].id == "high"
    assert high.scheduled_start_time == datetime(2026, 6, 29, 10, 15, tzinfo=timezone.utc)
    assert low.scheduled_start_time == datetime(2026, 6, 29, 11, 15, tzinfo=timezone.utc)


def test_scheduler_supports_overnight_working_hours():
    monday = date(2026, 6, 29)
    user = UserRead(
        id="user",
        email="student@example.com",
        preferred_start_time=time(23),
        preferred_end_time=time(1),
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    task = TaskRead(
        id="late",
        user_id="user",
        title="Late task",
        duration_minutes=60,
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )

    scheduled, missed = schedule_tasks([task], user, monday, 1, [])

    assert missed == []
    assert scheduled[0].scheduled_start_time == datetime(
        2026, 6, 29, 23, tzinfo=timezone.utc
    )


def test_scheduler_prefers_a_slot_with_a_break():
    monday = date(2026, 6, 29)
    user = UserRead(
        id="user",
        email="student@example.com",
        preferred_start_time=time(9),
        preferred_end_time=time(12),
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    task = TaskRead(
        id="task",
        user_id="user",
        title="Focused task",
        duration_minutes=60,
        created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    busy = [
        (
            datetime(2026, 6, 29, 10, 15, tzinfo=timezone.utc),
            datetime(2026, 6, 29, 10, 45, tzinfo=timezone.utc),
        )
    ]

    schedule_tasks([task], user, monday, 1, busy)

    assert task.scheduled_start_time == datetime(2026, 6, 29, 9, tzinfo=timezone.utc)
