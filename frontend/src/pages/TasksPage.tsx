import { format } from "date-fns";
import {
  CalendarClock,
  Check,
  Circle,
  FileCode2,
  GripVertical,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  ActivityPulse,
  Button,
  Card,
  DetailModal,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type {
  Course,
  Milestone,
  Priority,
  Project,
  Task,
  TaskType,
} from "../types";

const blankForm = {
  title: "",
  description: "",
  duration_minutes: 45,
  priority: "medium" as Priority,
  due_date: "",
  course_id: "",
  project_id: "",
  milestone_id: "",
  blocked_by_task_ids: [] as string[],
  task_type: "standard" as TaskType,
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taskToSchedule, setTaskToSchedule] = useState<Task | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const user = useAuth((state) => state.user);

  async function load() {
    try {
      const [taskData, courseData, projectData, milestoneData] = await Promise.all([
        api<Task[]>("/tasks"),
        api<Course[]>("/courses"),
        api<Project[]>("/projects"),
        api<Milestone[]>("/milestones"),
      ]);
      setTasks(taskData);
      setCourses(courseData);
      setProjects(projectData);
      setMilestones(milestoneData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await api<Task>("/tasks", {
        method: "POST",
        body: {
          ...form,
          due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
          course_id: form.course_id || null,
          project_id: form.project_id || null,
          milestone_id: form.milestone_id || null,
        },
      });
      setForm(blankForm);
      setShowForm(false);
      setTasks((current) => [...current, created]);
    } finally {
      setSaving(false);
    }
  }

  async function patchTask(id: string, payload: Partial<Task>, minimumDelayMs = 0) {
    const [updated] = await Promise.all([
      api<Task>(`/tasks/${id}`, { method: "PATCH", body: payload }),
      new Promise((resolve) => window.setTimeout(resolve, minimumDelayMs)),
    ]);
    setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
  }

  async function removeTask(id: string) {
    await api(`/tasks/${id}`, { method: "DELETE" });
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  async function addRoutines() {
    const created = await api<Task[]>("/tasks/routines", {
      method: "POST",
      body: { names: ["Wake up", "Breakfast", "Lunch", "Dinner", "Sleep"] },
    });
    setTasks((current) => [...current, ...created]);
  }

  function nextWorkingTime() {
    const candidate = new Date();
    candidate.setSeconds(0, 0);
    candidate.setMinutes(Math.ceil(candidate.getMinutes() / 15) * 15);
    if (!user) return format(candidate, "yyyy-MM-dd'T'HH:mm");

    const [startHour, startMinute] = user.preferred_start_time.split(":").map(Number);
    const [endHour, endMinute] = user.preferred_end_time.split(":").map(Number);
    const todayStart = new Date(candidate);
    todayStart.setHours(startHour, startMinute, 0, 0);
    const todayEnd = new Date(candidate);
    todayEnd.setHours(endHour, endMinute, 0, 0);

    if (todayEnd <= todayStart) {
      const previousStart = new Date(todayStart);
      previousStart.setDate(previousStart.getDate() - 1);
      if (!(previousStart <= candidate && candidate < todayEnd) && candidate < todayStart) {
        candidate.setTime(todayStart.getTime());
      }
    } else if (candidate < todayStart) {
      candidate.setTime(todayStart.getTime());
    } else if (candidate >= todayEnd) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(startHour, startMinute, 0, 0);
    }
    return format(candidate, "yyyy-MM-dd'T'HH:mm");
  }

  function prepareSchedule(taskId: string) {
    const task = backlog.find((item) => item.id === taskId);
    if (!task || task.is_blocked) return;
    setTaskToSchedule(task);
    setScheduleTime(nextWorkingTime());
  }

  async function scheduleTask(event: FormEvent) {
    event.preventDefault();
    if (!taskToSchedule || !scheduleTime) return;
    setScheduleSaving(true);
    try {
      await patchTask(taskToSchedule.id, {
        scheduled_start_time: new Date(scheduleTime).toISOString(),
      });
      setTaskToSchedule(null);
    } finally {
      setScheduleSaving(false);
    }
  }

  const active = tasks.filter((task) => !task.is_completed);
  const scheduled = active.filter((task) => task.scheduled_start_time);
  const backlog = active.filter((task) => !task.scheduled_start_time);

  return (
    <>
      <PageHeader
        eyebrow="Task manager"
        title="Turn intent into action."
        description={`${active.length} active tasks · ${scheduled.length} scheduled · ${backlog.length} in backlog`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addRoutines}>
              <RefreshCw size={15} />
              Daily basics
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} />
              New task
            </Button>
          </div>
        }
      />
      {showForm && (
        <Card className="mb-6">
          <form onSubmit={createTask}>
            <div className="mb-5 flex items-center justify-between">
              <p className="font-semibold">Create a task</p>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <label className="field-label">Title</label>
                <Input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Implement Dijkstra's algorithm"
                />
              </div>
              <div>
                <label className="field-label">Course</label>
                <select
                  className="select-field"
                  value={form.course_id}
                  onChange={(event) => setForm({ ...form, course_id: event.target.value })}
                >
                  <option value="">No course</option>
                  {courses.map((course) => (
                    <option value={course.id} key={course.id}>
                      {course.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select
                  className="select-field"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value as Priority })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="field-label">Project</label>
                <select
                  className="select-field"
                  value={form.project_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      project_id: event.target.value,
                      milestone_id: "",
                    })
                  }
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option value={project.id} key={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Milestone</label>
                <select
                  className="select-field"
                  disabled={!form.project_id}
                  value={form.milestone_id}
                  onChange={(event) => setForm({ ...form, milestone_id: event.target.value })}
                >
                  <option value="">Project level</option>
                  {milestones
                    .filter((milestone) => milestone.project_id === form.project_id)
                    .map((milestone) => (
                      <option value={milestone.id} key={milestone.id}>{milestone.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="field-label">Task type</label>
                <select
                  className="select-field"
                  value={form.task_type}
                  onChange={(event) =>
                    setForm({ ...form, task_type: event.target.value as TaskType })
                  }
                >
                  <option value="standard">Standard task</option>
                  <option value="spike">Developer spike</option>
                </select>
              </div>
              <div className="xl:col-span-2">
                <label className="field-label">Notes</label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Constraints, links, or context"
                />
              </div>
              <div>
                <label className="field-label">Duration (minutes)</label>
                <Input
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  value={form.duration_minutes}
                  onChange={(event) =>
                    setForm({ ...form, duration_minutes: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <label className="field-label">Due</label>
                <Input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <label className="field-label">Blocked by</label>
                <select
                  multiple
                  className="select-field min-h-24"
                  value={form.blocked_by_task_ids}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      blocked_by_task_ids: Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ),
                    })
                  }
                >
                  {tasks
                    .filter((task) => !task.is_completed)
                    .map((task) => (
                      <option value={task.id} key={task.id}>{task.title}</option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-zinc-400">
                  Hold Ctrl or Command to select multiple prerequisites.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button disabled={saving}>{saving ? "Saving…" : "Add to backlog"}</Button>
            </div>
          </form>
        </Card>
      )}
      {loading ? (
        <TaskListSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <TaskColumn
            title="Unscheduled"
            subtitle="Backlog ready for auto-scheduling"
            tasks={backlog}
            courses={courses}
            projects={projects}
            milestones={milestones}
            allTasks={tasks}
            onPatch={patchTask}
            onDelete={removeTask}
            draggable
          />
          <TaskColumn
            title="Scheduled"
            subtitle="Committed to a calendar time"
            tasks={scheduled}
            courses={courses}
            projects={projects}
            milestones={milestones}
            allTasks={tasks}
            onPatch={patchTask}
            onDelete={removeTask}
            onTaskDrop={prepareSchedule}
          />
        </div>
      )}
      {tasks.some((task) => task.is_completed) && (
        <Card className="mt-6">
          <p className="mb-4 text-sm font-semibold">Recently completed</p>
          <div className="space-y-2">
            {tasks
              .filter((task) => task.is_completed)
              .slice(0, 5)
              .map((task) => (
                <div key={task.id} className="flex items-center gap-3 text-sm text-zinc-400">
                  <button onClick={() => patchTask(task.id, { is_completed: false })}>
                    <Check size={17} className="text-teal-600" />
                  </button>
                  <span className="line-through">{task.title}</span>
                </div>
              ))}
          </div>
        </Card>
      )}
      {taskToSchedule && (
        <DetailModal
          title={`Schedule ${taskToSchedule.title}`}
          description="Choose when this task should move into your scheduled work."
          onClose={() => setTaskToSchedule(null)}
        >
          <form onSubmit={scheduleTask}>
            <label className="field-label" htmlFor="task-schedule-time">
              Start date and time
            </label>
            <Input
              id="task-schedule-time"
              type="datetime-local"
              required
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
            />
            <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-800/60">
              Duration: {taskToSchedule.duration_minutes} minutes
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setTaskToSchedule(null)}>
                Cancel
              </Button>
              <Button disabled={scheduleSaving}>
                {scheduleSaving ? "Scheduling…" : "Schedule task"}
              </Button>
            </div>
          </form>
        </DetailModal>
      )}
    </>
  );
}

function TaskColumn({
  title,
  subtitle,
  tasks,
  courses,
  projects,
  milestones,
  allTasks,
  onPatch,
  onDelete,
  draggable = false,
  onTaskDrop,
}: {
  title: string;
  subtitle: string;
  tasks: Task[];
  courses: Course[];
  projects: Project[];
  milestones: Milestone[];
  allTasks: Task[];
  onPatch: (id: string, payload: Partial<Task>, minimumDelayMs?: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  draggable?: boolean;
  onTaskDrop?: (taskId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      role="region"
      aria-label={`${title} tasks`}
      className={`rounded-2xl transition ${dragOver ? "ring-2 ring-teal-500 ring-offset-2 dark:ring-offset-zinc-950" : ""}`}
      onDragOver={(event) => {
        if (!onTaskDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        if (!onTaskDrop) return;
        event.preventDefault();
        setDragOver(false);
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) onTaskDrop(taskId);
      }}
    >
      <Card>
        <div className="mb-5">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        {tasks.length ? (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                course={courses.find((item) => item.id === task.course_id)}
                courses={courses}
                projects={projects}
                milestones={milestones}
                allTasks={allTasks}
                onPatch={onPatch}
                onDelete={onDelete}
                draggable={draggable && !task.is_blocked}
              />
            ))}
          </div>
        ) : (
          <EmptyState>
            {onTaskDrop ? "Drop an unscheduled task here." : "Nothing here. Keep the list intentional."}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

function TaskCard({
  task,
  course,
  courses,
  projects,
  milestones,
  allTasks,
  onPatch,
  onDelete,
  draggable,
}: {
  task: Task;
  course?: Course;
  courses: Course[];
  projects: Project[];
  milestones: Milestone[];
  allTasks: Task[];
  onPatch: (id: string, payload: Partial<Task>, minimumDelayMs?: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  draggable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task.title,
    description: task.description,
    duration_minutes: task.duration_minutes,
    priority: task.priority,
    due_date: task.due_date ? task.due_date.slice(0, 16) : "",
    course_id: task.course_id ?? "",
    project_id: task.project_id ?? "",
    milestone_id: task.milestone_id ?? "",
    blocked_by_task_ids: task.blocked_by_task_ids,
    task_type: task.task_type,
  });
  const project = projects.find((item) => item.id === task.project_id);
  const milestone = milestones.find((item) => item.id === task.milestone_id);
  const blockerNames = task.blocked_by_task_ids
    .map((id) => allTasks.find((item) => item.id === id))
    .filter((item): item is Task => Boolean(item))
    .map((item) => item.title);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onPatch(task.id, {
        title: editForm.title,
        description: editForm.description,
        duration_minutes: editForm.duration_minutes,
        priority: editForm.priority,
        due_date: editForm.due_date ? new Date(editForm.due_date).toISOString() : null,
        course_id: editForm.course_id || null,
        project_id: editForm.project_id || null,
        milestone_id: editForm.milestone_id || null,
        blocked_by_task_ids: editForm.blocked_by_task_ids,
        task_type: editForm.task_type,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      await onPatch(task.id, { is_completed: true }, 480);
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div
      role="article"
      aria-label={task.title}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`group relative overflow-hidden rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm dark:hover:border-zinc-600 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${task.is_blocked ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/60 dark:bg-amber-950/10" : ""}`}
    >
      {completing && (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden bg-emerald-50/90 text-emerald-800 backdrop-blur-[2px] dark:bg-emerald-950/85 dark:text-emerald-200">
          <span className="completion-wash absolute inset-0 bg-emerald-100/80 dark:bg-emerald-900/60" />
          <span className="relative flex items-center gap-2 text-sm font-semibold">
            <ActivityPulse />
            Completing…
          </span>
        </div>
      )}
      <div className="flex gap-3">
        {draggable ? (
          <GripVertical size={17} className="mt-0.5 shrink-0 text-zinc-300" />
        ) : task.is_blocked ? (
          <LockKeyhole size={16} className="mt-0.5 shrink-0 text-amber-600" />
        ) : null}
        <button
          onClick={complete}
          disabled={completing}
          aria-label={`Complete ${task.title}`}
          className="mt-0.5 text-zinc-300 transition hover:scale-110 hover:text-teal-600"
        >
          <Circle size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full items-start gap-3 text-left"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    task.priority === "high"
                      ? "bg-red-50 text-red-600 dark:bg-red-950/40"
                      : task.priority === "medium"
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}
                >
                  {task.priority}
                </span>
                {task.task_type === "spike" && (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                    spike
                  </span>
                )}
                {task.is_blocked && (
                  <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                    blocked
                  </span>
                )}
              </span>
              {task.description && (
                <span className="mt-1 block truncate text-xs text-zinc-500">
                  {task.description}
                </span>
              )}
            </span>
          </button>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <CalendarClock size={13} />
              {task.scheduled_start_time
                ? format(new Date(task.scheduled_start_time), "MMM d · h:mm a")
                : `${task.duration_minutes} min`}
            </span>
            {task.due_date && <span>Due {format(new Date(task.due_date), "MMM d")}</span>}
            {course && <span style={{ color: course.color }}>{course.code}</span>}
            {task.project_id && (
              <span>{projects.find((project) => project.id === task.project_id)?.name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button
            onClick={() => {
              setOpen(true);
              setEditing(true);
            }}
            aria-label={`Edit ${task.title}`}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            aria-label={`Delete ${task.title}`}
            className="rounded-lg p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {open && (
        <DetailModal
          title={task.title}
          description={task.scheduled_start_time ? "Scheduled task" : "Unscheduled task"}
          onClose={() => {
            setOpen(false);
            setEditing(false);
          }}
        >
          {editing ? (
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
              <Input
                required
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                className="sm:col-span-2"
              />
              <Input
                value={editForm.description}
                onChange={(event) =>
                  setEditForm({ ...editForm, description: event.target.value })
                }
                placeholder="Notes"
                className="sm:col-span-2"
              />
              <Input
                type="number"
                min={5}
                max={720}
                step={5}
                value={editForm.duration_minutes}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    duration_minutes: Number(event.target.value),
                  })
                }
              />
              <select
                className="select-field"
                value={editForm.priority}
                onChange={(event) =>
                  setEditForm({ ...editForm, priority: event.target.value as Priority })
                }
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
              <Input
                type="datetime-local"
                value={editForm.due_date}
                onChange={(event) =>
                  setEditForm({ ...editForm, due_date: event.target.value })
                }
              />
              <select
                className="select-field"
                value={editForm.course_id}
                onChange={(event) =>
                  setEditForm({ ...editForm, course_id: event.target.value })
                }
              >
                <option value="">No course</option>
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code}
                  </option>
                ))}
              </select>
              <select
                className="select-field"
                value={editForm.project_id}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    project_id: event.target.value,
                    milestone_id: "",
                  })
                }
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select
                className="select-field"
                disabled={!editForm.project_id}
                value={editForm.milestone_id}
                onChange={(event) =>
                  setEditForm({ ...editForm, milestone_id: event.target.value })
                }
              >
                <option value="">Project level</option>
                {milestones
                  .filter((milestone) => milestone.project_id === editForm.project_id)
                  .map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>{milestone.name}</option>
                  ))}
              </select>
              <select
                className="select-field"
                value={editForm.task_type}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    task_type: event.target.value as TaskType,
                  })
                }
              >
                <option value="standard">Standard task</option>
                <option value="spike">Developer spike</option>
              </select>
              <div className="sm:col-span-2">
                <label className="field-label">Blocked by</label>
                <select
                  multiple
                  className="select-field min-h-24"
                  value={editForm.blocked_by_task_ids}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      blocked_by_task_ids: Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ),
                    })
                  }
                >
                  {allTasks
                    .filter((candidate) => candidate.id !== task.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}{candidate.is_completed ? " (complete)" : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          ) : (
            <div>
              {task.description && (
                <p className="mb-6 rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                  {task.description}
                </p>
              )}
              <div className="grid gap-4 text-sm text-zinc-500 sm:grid-cols-2">
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Duration</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{task.duration_minutes} minutes</span></p>
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Course</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{course?.name ?? "None"}</span></p>
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Due</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{task.due_date ? format(new Date(task.due_date), "PPp") : "No deadline"}</span></p>
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Schedule</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{task.scheduled_start_time ? format(new Date(task.scheduled_start_time), "PPp") : "Backlog"}</span></p>
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Roadmap</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{milestone?.name ?? project?.name ?? "None"}</span></p>
                <p><span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Blocked by</span><span className="mt-1 block text-zinc-800 dark:text-zinc-200">{blockerNames.join(", ") || "Nothing"}</span></p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                {task.task_type === "spike" && task.spike_journal_id && (
                  <Link
                    to={`/journal?entry=${task.spike_journal_id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium"
                  >
                    <FileCode2 size={15} />
                    Open spike journal
                  </Link>
                )}
                <Button onClick={() => setEditing(true)}>
                  <Pencil size={15} />
                  Edit task
                </Button>
              </div>
            </div>
          )}
        </DetailModal>
      )}
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2" role="status" aria-label="Loading tasks">
      {[0, 1].map((column) => (
        <Card key={column}>
          <Skeleton className="mb-2 h-5 w-28" />
          <Skeleton className="mb-5 h-3 w-48" />
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-24 w-full" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
