import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  FileCode2,
  FolderKanban,
  GripVertical,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Spinner,
} from "../components/ui";
import { api } from "../lib/api";
import type { Milestone, Project, Task } from "../types";

export function ProjectsPage() {
  const { projectId } = useParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectName, setProjectName] = useState("");
  const [milestoneNames, setMilestoneNames] = useState<Record<string, string>>({});
  const [milestoneDates, setMilestoneDates] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ kind: "project" | "milestone"; id: string; name: string } | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function load() {
    try {
      const [projectData, milestoneData, taskData] = await Promise.all([
        api<Project[]>("/projects"),
        api<Milestone[]>("/milestones"),
        api<Task[]>("/tasks"),
      ]);
      setProjects(projectData);
      setExpandedProjectIds((current) =>
        current.size ? current : new Set(projectData.map((project) => project.id)),
      );
      setMilestones(milestoneData);
      setTasks(taskData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectName.trim()) return;
    setPendingAction("create-project");
    try {
      await api<Project>("/projects", {
        method: "POST",
        body: { name: projectName.trim() },
      });
      setProjectName("");
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  async function createMilestone(event: FormEvent, projectId: string) {
    event.preventDefault();
    const name = milestoneNames[projectId]?.trim();
    const targetDate = milestoneDates[projectId];
    if (!name || !targetDate) return;
    setPendingAction(`create-milestone:${projectId}`);
    try {
      await api<Milestone>("/milestones", {
        method: "POST",
        body: { project_id: projectId, name, target_date: targetDate },
      });
      setMilestoneNames((current) => ({ ...current, [projectId]: "" }));
      setMilestoneDates((current) => ({ ...current, [projectId]: "" }));
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing?.name.trim()) return;
    setPendingAction(`edit:${editing.id}`);
    try {
      await api(`/${editing.kind === "project" ? "projects" : "milestones"}/${editing.id}`, {
        method: "PATCH",
        body: { name: editing.name.trim() },
      });
      setEditing(null);
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  async function remove(kind: "project" | "milestone", id: string) {
    setPendingAction(`delete:${id}`);
    try {
      await api(`/${kind === "project" ? "projects" : "milestones"}/${id}`, {
        method: "DELETE",
      });
      await load();
    } finally {
      setPendingAction(null);
    }
  }

  async function setMilestoneDate(milestoneId: string, targetDate: string) {
    if (!targetDate) return;
    setPendingAction(`date:${milestoneId}`);
    try {
      const updated = await api<Milestone>(`/milestones/${milestoneId}`, {
        method: "PATCH",
        body: { target_date: targetDate },
      });
      setMilestones((current) =>
        current.map((milestone) => milestone.id === milestoneId ? updated : milestone),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function reorderMilestones(projectId: string, milestoneIds: string[]) {
    setPendingAction(`reorder:${projectId}`);
    try {
      const reordered = await api<Milestone[]>("/milestones/reorder", {
        method: "POST",
        body: { project_id: projectId, milestone_ids: milestoneIds },
      });
      setMilestones((current) => [
        ...current.filter((milestone) => milestone.project_id !== projectId),
        ...reordered,
      ]);
    } finally {
      setPendingAction(null);
    }
  }

  function toggleProject(id: string) {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedProject = projects.find((project) => project.id === projectId);
  const visibleProjects = projectId
    ? projects.filter((project) => project.id === projectId)
    : projects;

  return (
    <>
      <PageHeader
        eyebrow={projectId ? "Project workspace" : "Technical roadmap"}
        title={projectId ? selectedProject?.name ?? "Project" : "Structure the work."}
        description={
          projectId
            ? "A focused view of this project’s milestones, dates, and task dependencies."
            : "Group implementation tasks into projects and milestones without losing sight of blockers."
        }
        action={
          projectId ? (
            <Link
              to="/projects"
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium"
            >
              All projects
            </Link>
          ) : (
            <form onSubmit={createProject} className="flex gap-2">
              <Input
                aria-label="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="New project"
              />
              <Button
                disabled={!projectName.trim() || pendingAction === "create-project"}
              >
                {pendingAction === "create-project" ? (
                  <Spinner />
                ) : (
                  <Plus size={15} />
                )}
                {pendingAction === "create-project" ? "Adding…" : "Add"}
              </Button>
            </form>
          )
        }
      />
      {loading ? (
        <div className="space-y-5" role="status" aria-label="Loading projects">
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner className="text-teal-600" />
            Loading projects and milestone timelines…
          </p>
          {[0, 1].map((item) => <Skeleton key={item} className="h-56 w-full" />)}
        </div>
      ) : visibleProjects.length ? (
        <div className="space-y-5">
          {visibleProjects.map((project) => {
            const projectMilestones = milestones.filter(
              (milestone) => milestone.project_id === project.id,
            );
            const projectTasks = tasks.filter(
              (task) => task.project_id === project.id && !task.milestone_id,
            );
            const expanded =
              Boolean(projectId) || expandedProjectIds.has(project.id);
            return (
              <Card key={project.id}>
                <div className={`${expanded ? "mb-5" : ""} flex items-start justify-between gap-4`}>
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-3 text-left"
                    onClick={() => {
                      if (!projectId) toggleProject(project.id);
                    }}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      <FolderKanban size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{project.name}</p>
                      <p className="text-xs text-zinc-500">
                        {projectMilestones.length} milestones · {tasks.filter((task) => task.project_id === project.id).length} tasks
                      </p>
                    </div>
                    {!projectId && (
                      expanded
                        ? <ChevronDown size={16} className="shrink-0 text-zinc-400" />
                        : <ChevronRight size={16} className="shrink-0 text-zinc-400" />
                    )}
                  </button>
                  <div className="flex gap-1">
                    {!projectId && (
                      <Link
                        to={`/projects/${project.id}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${project.name} in a new window`}
                        title="Open project in a new window"
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    )}
                    <button
                      aria-label={`Rename ${project.name}`}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => setEditing({ kind: "project", id: project.id, name: project.name })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label={`Delete ${project.name}`}
                      disabled={pendingAction === `delete:${project.id}`}
                      className="rounded-lg p-2 text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      onClick={() => remove("project", project.id)}
                    >
                      {pendingAction === `delete:${project.id}`
                        ? <Spinner />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="animate-expand-in">
                {projectTasks.length > 0 && (
                  <div className="mb-5 rounded-xl border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Project tasks</p>
                    <div className="space-y-1">
                      {projectTasks.map((task) => <RoadmapTask key={task.id} task={task} tasks={tasks} />)}
                    </div>
                  </div>
                )}

                <MilestoneTimeline
                  project={project}
                  milestones={projectMilestones}
                  tasks={tasks}
                  onRename={(milestone) =>
                    setEditing({
                      kind: "milestone",
                      id: milestone.id,
                      name: milestone.name,
                    })
                  }
                  onDelete={(id) => remove("milestone", id)}
                  onDateChange={setMilestoneDate}
                  onReorder={reorderMilestones}
                  pendingAction={pendingAction}
                />

                <form
                  onSubmit={(event) => createMilestone(event, project.id)}
                  className="mt-5 grid max-w-2xl gap-2 sm:grid-cols-[1fr_180px_auto]"
                >
                  <Input
                    aria-label={`New milestone for ${project.name}`}
                    value={milestoneNames[project.id] ?? ""}
                    onChange={(event) =>
                      setMilestoneNames((current) => ({ ...current, [project.id]: event.target.value }))
                    }
                    placeholder="Add milestone"
                  />
                  <Input
                    aria-label={`Target date for ${project.name} milestone`}
                    type="date"
                    required
                    value={milestoneDates[project.id] ?? ""}
                    onChange={(event) =>
                      setMilestoneDates((current) => ({
                        ...current,
                        [project.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    variant="secondary"
                    disabled={
                      !milestoneNames[project.id]?.trim()
                      || !milestoneDates[project.id]
                      || pendingAction === `create-milestone:${project.id}`
                    }
                  >
                    {pendingAction === `create-milestone:${project.id}`
                      ? <Spinner />
                      : <Plus size={14} />}
                    {pendingAction === `create-milestone:${project.id}`
                      ? "Adding…"
                      : "Milestone"}
                  </Button>
                </form>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState>
            {projectId
              ? "Project not found."
              : "Create a project to start grouping roadmap work."}
          </EmptyState>
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-5 backdrop-blur-sm">
          <Card className="w-full max-w-md">
            <form onSubmit={saveEdit}>
              <p className="mb-4 font-semibold">Rename {editing.kind}</p>
              <Input
                autoFocus
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button disabled={pendingAction === `edit:${editing.id}`}>
                  {pendingAction === `edit:${editing.id}` && <Spinner />}
                  {pendingAction === `edit:${editing.id}` ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

function MilestoneTimeline({
  project,
  milestones,
  tasks,
  onRename,
  onDelete,
  onDateChange,
  onReorder,
  pendingAction,
}: {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  onRename: (milestone: Milestone) => void;
  onDelete: (id: string) => Promise<void>;
  onDateChange: (id: string, targetDate: string) => Promise<void>;
  onReorder: (projectId: string, milestoneIds: string[]) => Promise<void>;
  pendingAction: string | null;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  const ordered = [...milestones].sort((left, right) => {
    if (!left.target_date) return 1;
    if (!right.target_date) return -1;
    return left.target_date.localeCompare(right.target_date);
  });
  const canReorder =
    ordered.length > 1
    && ordered.every((milestone) => milestone.target_date)
    && pendingAction !== `reorder:${project.id}`;

  async function drop(
    event: React.DragEvent<HTMLDivElement>,
    targetId: string,
  ) {
    event.preventDefault();
    if (!draggingId || draggingId === targetId || !canReorder) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    const remaining = ordered.filter((milestone) => milestone.id !== draggingId);
    const targetIndex = remaining.findIndex((milestone) => milestone.id === targetId);
    const rectangle = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rectangle.top + rectangle.height / 2;
    const dragged = ordered.find((milestone) => milestone.id === draggingId);
    if (!dragged || targetIndex < 0) return;
    remaining.splice(targetIndex + (after ? 1 : 0), 0, dragged);
    setDraggingId(null);
    setDropTarget(null);
    await onReorder(project.id, remaining.map((milestone) => milestone.id));
  }

  if (!ordered.length) {
    return (
      <div className="rounded-xl border border-dashed p-5 text-sm text-zinc-400">
        Add a dated milestone to start the timeline.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Milestone timeline
        </p>
        {pendingAction === `reorder:${project.id}` ? (
          <p className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-400">
            <Spinner />
            Saving timeline…
          </p>
        ) : (
          <p className="text-xs text-zinc-400">
            {canReorder
              ? "Drag nodes up or down to move them between date slots."
              : "Set a date on every milestone to enable dragging."}
          </p>
        )}
      </div>
      <div
        className="rounded-xl border bg-zinc-50/60 p-4 dark:bg-zinc-900/40"
        aria-label={`${project.name} milestone timeline`}
      >
        <div className="relative space-y-4">
          <span className="absolute bottom-8 left-[17px] top-8 w-px bg-zinc-300 dark:bg-zinc-700" />
          {ordered.map((milestone) => {
            const milestoneTasks = tasks.filter(
              (task) => task.milestone_id === milestone.id,
            );
            const isDropTarget = dropTarget?.id === milestone.id;
            return (
              <div
                key={milestone.id}
                role="article"
                aria-label={milestone.name}
                draggable={canReorder}
                onDragStart={(event) => {
                  if (!canReorder) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/milestone-id", milestone.id);
                  setDraggingId(milestone.id);
                }}
                onDragOver={(event) => {
                  if (!draggingId || draggingId === milestone.id) return;
                  event.preventDefault();
                  const rectangle = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    id: milestone.id,
                    after: event.clientY > rectangle.top + rectangle.height / 2,
                  });
                }}
                onDrop={(event) => void drop(event, milestone.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                className={`timeline-node relative ml-10 rounded-xl border bg-white p-5 shadow-sm transition dark:bg-zinc-900 ${
                  draggingId === milestone.id ? "opacity-50" : ""
                } ${
                  pendingAction === `date:${milestone.id}`
                    ? "soft-loading"
                    : ""
                } ${
                  isDropTarget
                    ? dropTarget.after
                      ? "translate-y-1 border-b-4 border-b-teal-500"
                      : "-translate-y-1 border-t-4 border-t-teal-500"
                    : ""
                }`}
              >
                <span className="absolute -left-[31px] top-7 h-3 w-3 rounded-full border-2 border-white bg-teal-600 ring-2 ring-zinc-300 dark:border-zinc-900 dark:ring-zinc-700" />
                <div className="mb-3 flex items-start gap-2">
                  <GripVertical
                    size={15}
                    className={canReorder ? "mt-0.5 shrink-0 cursor-grab text-zinc-400" : "mt-0.5 shrink-0 text-zinc-200"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{milestone.name}</p>
                    <p className="text-xs text-zinc-400">
                      {milestoneTasks.length} tasks
                    </p>
                  </div>
                  <button
                    aria-label={`Rename ${milestone.name}`}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => onRename(milestone)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    aria-label={`Delete ${milestone.name}`}
                    disabled={pendingAction === `delete:${milestone.id}`}
                    className="rounded-lg p-1 text-zinc-300 hover:text-red-500"
                    onClick={() => void onDelete(milestone.id)}
                  >
                    {pendingAction === `delete:${milestone.id}`
                      ? <Spinner />
                      : <Trash2 size={13} />}
                  </button>
                </div>
                <label className="mb-3 block">
                  <span className="field-label flex items-center gap-1">
                    <CalendarDays size={12} />
                    Target date
                  </span>
                  <Input
                    type="date"
                    aria-label={`${milestone.name} target date`}
                    disabled={
                      pendingAction === `date:${milestone.id}`
                      || pendingAction === `reorder:${project.id}`
                    }
                    value={milestone.target_date ?? ""}
                    onChange={(event) =>
                      void onDateChange(milestone.id, event.target.value)
                    }
                  />
                </label>
                {milestoneTasks.length ? (
                  <div className="space-y-1 border-t pt-2">
                    {milestoneTasks.map((task) => (
                      <RoadmapTask key={task.id} task={task} tasks={tasks} />
                    ))}
                  </div>
                ) : (
                  <p className="border-t pt-3 text-xs text-zinc-400">
                    No tasks assigned.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoadmapTask({ task, tasks }: { task: Task; tasks: Task[] }) {
  const blockers = task.blocked_by_task_ids
    .map((id) => tasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Task => Boolean(candidate && !candidate.is_completed));
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
      {task.is_completed ? (
        <Check size={15} className="shrink-0 text-teal-600" />
      ) : (
        <Circle size={15} className="shrink-0 text-zinc-300" />
      )}
      <span className={`min-w-0 flex-1 truncate ${task.is_completed ? "text-zinc-400 line-through" : ""}`}>
        {task.title}
      </span>
      {task.is_blocked && (
        <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title={`Blocked by ${blockers.map((item) => item.title).join(", ")}`}>
          <LockKeyhole size={12} />
          Blocked
        </span>
      )}
      {task.task_type === "spike" && task.spike_journal_id && (
        <Link
          to={`/journal?entry=${task.spike_journal_id}`}
          className="flex items-center gap-1 text-xs text-teal-700 hover:underline dark:text-teal-400"
        >
          <FileCode2 size={12} />
          Journal
        </Link>
      )}
    </div>
  );
}
