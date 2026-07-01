import enum
from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field, HttpUrl, model_validator


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class UserRead(BaseModel):
    id: str
    email: EmailStr
    preferred_start_time: time
    preferred_end_time: time
    created_at: datetime


class UserUpdate(BaseModel):
    preferred_start_time: time
    preferred_end_time: time

    @model_validator(mode="after")
    def validate_hours(self) -> "UserUpdate":
        if self.preferred_end_time == self.preferred_start_time:
            raise ValueError("Start and end time must be different")
        return self


class CourseBase(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    professor: str = Field(default="", max_length=150)
    location: str = Field(default="", max_length=255)
    schedule_rrule: str = Field(
        description="FREQ=WEEKLY;BYDAY=MO,WE;START=13:00;END=14:15"
    )
    color: str = Field(default="#71717a", pattern=r"^#[0-9A-Fa-f]{6}$")


class CourseCreate(CourseBase):
    pass


class CourseUpdate(CourseBase):
    pass


class CourseRead(CourseBase):
    id: str
    user_id: str
    created_at: datetime


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    duration_minutes: int = Field(default=30, ge=5, le=720)
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    scheduled_start_time: datetime | None = None
    course_id: str | None = None
    is_completed: bool = False
    is_routine: bool = False


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=720)
    priority: Priority | None = None
    due_date: datetime | None = None
    scheduled_start_time: datetime | None = None
    course_id: str | None = None
    is_completed: bool | None = None


class TaskRead(TaskBase):
    id: str
    user_id: str
    created_at: datetime
    google_event_id: str | None = None


class RoutineRequest(BaseModel):
    names: list[str] = Field(min_length=1, max_length=10)


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    course_id: str | None = None
    color: str = Field(default="#14b8a6", pattern=r"^#[0-9A-Fa-f]{6}$")


class HabitRead(HabitCreate):
    id: str
    user_id: str
    created_at: datetime
    completion_history: list[date] = []


class HabitToggle(BaseModel):
    completed_on: date


class JournalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content_markdown: str = ""
    course_id: str | None = None


class JournalUpdate(JournalCreate):
    pass


class JournalRead(JournalCreate):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class CalendarBlock(BaseModel):
    id: str
    title: str
    kind: str
    start: datetime
    end: datetime
    color: str
    locked: bool = False


class ScheduleRequest(BaseModel):
    start_date: date | None = None
    horizon_days: int = Field(default=7, ge=1, le=30)


class ScheduleResult(BaseModel):
    scheduled: list[TaskRead]
    unscheduled_task_ids: list[str]


class FocusLinkCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    url: HttpUrl


class FocusLinkRead(BaseModel):
    id: str
    label: str
    url: str
    position: int


class GoogleStatus(BaseModel):
    configured: bool
    connected: bool
    authorization_url: str | None = None


class GoogleSyncResult(BaseModel):
    pulled: int
    pushed: int
