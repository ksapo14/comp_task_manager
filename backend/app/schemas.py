import enum
from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field, HttpUrl, model_validator


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskType(str, enum.Enum):
    standard = "standard"
    spike = "spike"


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


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)


class ProjectUpdate(ProjectCreate):
    pass


class ProjectRead(ProjectCreate):
    id: str
    user_id: str
    created_at: datetime


class MilestoneCreate(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=150)
    target_date: date


class MilestoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    target_date: date | None = None

    @model_validator(mode="after")
    def validate_change(self) -> "MilestoneUpdate":
        if self.name is None and self.target_date is None:
            raise ValueError("A milestone name or target date is required")
        return self


class MilestoneRead(BaseModel):
    id: str
    user_id: str
    project_id: str
    name: str
    target_date: date | None = None
    created_at: datetime


class MilestoneReorder(BaseModel):
    project_id: str
    milestone_ids: list[str] = Field(min_length=2, max_length=100)


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    duration_minutes: int = Field(default=30, ge=5, le=720)
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    scheduled_start_time: datetime | None = None
    course_id: str | None = None
    project_id: str | None = None
    milestone_id: str | None = None
    blocked_by_task_ids: list[str] = Field(default_factory=list, max_length=50)
    task_type: TaskType = TaskType.standard
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
    project_id: str | None = None
    milestone_id: str | None = None
    blocked_by_task_ids: list[str] | None = Field(default=None, max_length=50)
    task_type: TaskType | None = None
    is_completed: bool | None = None


class TaskRead(TaskBase):
    id: str
    user_id: str
    created_at: datetime
    google_event_id: str | None = None
    spike_journal_id: str | None = None
    is_blocked: bool = False


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


class SchoolTaskStatus(str, enum.Enum):
    todo = "todo"
    progress = "progress"
    completed = "completed"


class SchoolMilestoneKind(str, enum.Enum):
    exam = "Exam"
    project = "Project"
    deadline = "Deadline"


class SchoolFlashcard(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    course: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=4000)


class SchoolFlashcardDeck(BaseModel):
    cards: list[SchoolFlashcard] = Field(default_factory=list, max_length=200)
    mastered_count: int = Field(default=0, ge=0)
    review_count: int = Field(default=0, ge=0)


class SchoolFocusTask(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    course: str = Field(default="Independent", max_length=100)
    status: SchoolTaskStatus = SchoolTaskStatus.todo


class SchoolFocusMatrix(BaseModel):
    tasks: list[SchoolFocusTask] = Field(default_factory=list, max_length=300)


class SchoolTimelineMilestone(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    course: str = Field(min_length=1, max_length=100)
    kind: SchoolMilestoneKind
    date: datetime
    detail: str = Field(default="", max_length=2000)


class SchoolTimeline(BaseModel):
    semester_start: datetime | None = None
    semester_end: datetime | None = None
    milestones: list[SchoolTimelineMilestone] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_semester_dates(self) -> "SchoolTimeline":
        if (
            self.semester_start is not None
            and self.semester_end is not None
            and self.semester_end <= self.semester_start
        ):
            raise ValueError("Semester end must be after semester start")
        return self


class SchoolWorkspaceRead(BaseModel):
    flashcards: SchoolFlashcardDeck
    focus: SchoolFocusMatrix
    timeline: SchoolTimeline


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


class GoogleCallback(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class GoogleSyncResult(BaseModel):
    pulled: int
    pushed: int
