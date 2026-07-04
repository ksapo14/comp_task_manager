import { Check, Pause, Play, Plus, RotateCcw, TimerReset } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent } from "react";

import { EditableClockValue } from "../EditableClockValue";
import {
  getFocusMatrix,
  saveFocusMatrix,
} from "./schoolApi";
import type { SchoolSyncState } from "./schoolApi";
import { SchoolSyncBadge } from "./SchoolSyncBadge";
import type { FocusRequest, FocusTask, FocusTaskStatus } from "./types";

const DEFAULT_MINUTES = 25;
const LEGACY_DEMO_TASK_IDS = new Set(["task-1", "task-2", "task-3", "task-4"]);
const RING_RADIUS = 86;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const columns: Array<{
  id: FocusTaskStatus;
  title: string;
  accent: string;
}> = [
  { id: "todo", title: "To do", accent: "zinc" },
  { id: "progress", title: "In progress", accent: "violet" },
  { id: "completed", title: "Completed", accent: "emerald" },
];

export function FocusMatrix({
  focusRequest,
  onFocusStateChange,
}: {
  focusRequest: FocusRequest | null;
  onFocusStateChange: (active: boolean) => void;
}) {
  const [totalMs, setTotalMs] = useState(DEFAULT_MINUTES * 60_000);
  const [remainingMs, setRemainingMs] = useState(DEFAULT_MINUTES * 60_000);
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [taskName, setTaskName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<FocusTaskStatus | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [burstId, setBurstId] = useState(0);
  const [syncState, setSyncState] = useState<SchoolSyncState>("loading");
  const endAt = useRef(0);
  const bounceTimer = useRef<number | null>(null);
  const tasksRef = useRef<FocusTask[]>([]);

  function persistTasks(nextTasks: FocusTask[]) {
    tasksRef.current = nextTasks;
    setSyncState("saving");
    void saveFocusMatrix({
      tasks: nextTasks,
    })
      .then(() => setSyncState("synced"))
      .catch(() => setSyncState("offline"));
  }

  useEffect(() => {
    let active = true;
    void getFocusMatrix()
      .then((payload) => {
        if (!active) return;
        const nextTasks = payload.tasks.filter(
          (task) =>
            task.status !== "completed" && !LEGACY_DEMO_TASK_IDS.has(task.id),
        );
        tasksRef.current = nextTasks;
        setTasks(nextTasks);
        if (nextTasks.length !== payload.tasks.length) {
          setSyncState("saving");
          void saveFocusMatrix({
            tasks: nextTasks,
          })
            .then(() => setSyncState("synced"))
            .catch(() => setSyncState("offline"));
        } else {
          setSyncState("synced");
        }
      })
      .catch(() => {
        if (active) setSyncState("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    onFocusStateChange(running);
    return () => onFocusStateChange(false);
  }, [onFocusStateChange, running]);

  useEffect(() => {
    if (!focusRequest) return;
    setTaskName(focusRequest.title);
    const current = tasksRef.current;
    const existing = current.find(
        (task) => task.title.toLowerCase() === focusRequest.title.toLowerCase(),
    );
    const nextTasks: FocusTask[] = existing
      ? current.map((task) =>
          task.id === existing.id ? { ...task, status: "progress" as const } : task,
      )
      : [
          ...current,
          {
            id: `milestone-task-${focusRequest.id}`,
            title: focusRequest.title,
            course: focusRequest.course,
            status: "progress" as const,
          },
        ];
    setTasks(nextTasks);
    persistTasks(nextTasks);
  }, [focusRequest]);

  useEffect(() => {
    if (!running) return;
    endAt.current = performance.now() + remainingMs;
    const interval = window.setInterval(() => {
      const next = Math.max(0, endAt.current - performance.now());
      setRemainingMs(next);
      if (next === 0) setRunning(false);
    }, 100);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(
    () => () => {
      if (bounceTimer.current !== null) window.clearTimeout(bounceTimer.current);
    },
    [],
  );

  const progress = totalMs ? remainingMs / totalMs : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const displayedMinutes = Math.floor(totalSeconds / 60);
  const displayedSeconds = totalSeconds % 60;
  const canEditDuration = !running && remainingMs === totalMs;
  const activeTask = useMemo(
    () => tasks.find((task) => task.title === taskName),
    [taskName, tasks],
  );

  function toggleTimer() {
    if (remainingMs === 0) setRemainingMs(totalMs);
    setRunning((value) => !value);
  }

  function resetTimer(nextDurationSeconds = totalMs / 1000) {
    const next = nextDurationSeconds * 1000;
    setRunning(false);
    setTotalMs(next);
    setRemainingMs(next);
  }

  function setClockTime(minutes: number, seconds: number) {
    const nextDurationSeconds = Math.min(
      86_400,
      Math.max(60, minutes * 60 + seconds),
    );
    resetTimer(nextDurationSeconds);
  }

  function queueTask(event: FormEvent) {
    event.preventDefault();
    const title = taskName.trim();
    if (!title || tasks.some((task) => task.title.toLowerCase() === title.toLowerCase())) {
      return;
    }
    const nextTasks = [
      ...tasksRef.current,
      { id: `task-${Date.now()}`, title, course: "Independent", status: "todo" },
    ] satisfies FocusTask[];
    setTasks(nextTasks);
    persistTasks(nextTasks);
  }

  function onDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/school-task-id", taskId);
    setDraggingId(taskId);
  }

  function dropTask(event: DragEvent<HTMLElement>, status: FocusTaskStatus) {
    event.preventDefault();
    const taskId =
      event.dataTransfer.getData("text/school-task-id") || draggingId;
    setDragOver(null);
    setDraggingId(null);
    if (!taskId) return;
    const movingTask = tasks.find((task) => task.id === taskId);
    if (!movingTask || movingTask.status === status) return;
    const nextTasks =
      status === "completed"
        ? tasksRef.current.filter((task) => task.id !== taskId)
        : tasksRef.current.map((task) =>
            task.id === taskId ? { ...task, status } : task,
          );
    setTasks(nextTasks);
    persistTasks(nextTasks);
    if (status === "completed") {
      setBurstId((value) => value + 1);
    } else {
      setJustDroppedId(taskId);
    }
    if (bounceTimer.current !== null) window.clearTimeout(bounceTimer.current);
    bounceTimer.current = window.setTimeout(() => setJustDroppedId(null), 520);
  }

  return (
    <section className={`school-panel focus-matrix rounded-[2rem] p-5 sm:p-6 ${running ? "is-focusing" : ""}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="school-kicker">Time & task dashboard</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Pomodoro focus matrix</h2>
          <SchoolSyncBadge state={syncState} />
        </div>
        <span className={`focus-state-pill ${running ? "is-active" : ""}`}>
          <span />
          {running ? "Focus field active" : "Ready to focus"}
        </span>
      </div>

      <div className="focus-matrix-layout grid gap-7">
        <div className="focus-timer-column flex flex-col items-center">
          <div className="timer-ring-shell">
            <svg viewBox="0 0 200 200" className="timer-ring-svg" aria-hidden="true">
              <defs>
                <linearGradient id="school-timer-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="55%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              <circle className="timer-ring-track" cx="100" cy="100" r={RING_RADIUS} />
              <circle
                className="timer-ring-progress"
                cx="100"
                cy="100"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="timer-ring-copy">
              <span className="clock-time-display font-mono text-5xl font-semibold tracking-[-0.06em] tabular-nums">
                <EditableClockValue
                  value={displayedMinutes}
                  min={1}
                  max={1440}
                  disabled={!canEditDuration}
                  onChange={(minutes) => setClockTime(minutes, displayedSeconds)}
                  label="Pomodoro minutes"
                />
                :
                <EditableClockValue
                  value={displayedSeconds}
                  max={59}
                  disabled={!canEditDuration}
                  onChange={(seconds) => setClockTime(displayedMinutes, seconds)}
                  label="Pomodoro seconds"
                />
              </span>
              <span className="mt-2 max-w-40 truncate text-xs text-zinc-500">
                {canEditDuration
                  ? "Select minutes to change"
                  : taskName || "Choose one outcome"}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTimer}
              aria-label={running ? "Pause focus timer" : "Start focus timer"}
              className="timer-primary-control"
            >
              {running ? <Pause size={19} /> : <Play size={19} className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => resetTimer()}
              aria-label="Reset focus timer"
              className="timer-secondary-control"
            >
              <RotateCcw size={17} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[25, 50].map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={running}
                onClick={() => setClockTime(minutes, 0)}
                className={`timer-duration ${totalMs === minutes * 60_000 ? "is-active" : ""}`}
              >
                {minutes}m
              </button>
            ))}
          </div>

          <form onSubmit={queueTask} className="mt-5 w-full">
            <label className="school-field-label" htmlFor="school-focus-task">
              Session outcome
            </label>
            <div className="flex gap-2">
              <input
                id="school-focus-task"
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                className="school-input min-w-0 flex-1"
                placeholder="What will you finish?"
              />
              <button type="submit" className="school-icon-button" aria-label="Queue task">
                <Plus size={16} />
              </button>
            </div>
            {activeTask && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
                <TimerReset size={12} />
                Linked to {activeTask.course}
              </p>
            )}
          </form>
        </div>

        <div className="kanban-grid grid min-w-0 gap-3 md:grid-cols-3">
          {columns.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.id);
            return (
              <section
                key={column.id}
                aria-label={`${column.title} tasks`}
                className={`kanban-column kanban-${column.accent} ${
                  dragOver === column.id ? "is-drag-over" : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOver(column.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setDragOver(null);
                  }
                }}
                onDrop={(event) => dropTask(event, column.id)}
              >
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="kanban-status-dot" />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">
                      {column.title}
                    </h3>
                  </div>
                  <span className="text-[10px] text-zinc-400">{columnTasks.length}</span>
                </header>
                <div className="relative min-h-36 space-y-2">
                  {column.id === "completed" && burstId > 0 && (
                    <div key={burstId} className="success-burst" aria-hidden="true">
                      {Array.from({ length: 14 }, (_, index) => (
                        <span
                          key={index}
                          style={
                            {
                              "--burst-angle": `${index * (360 / 14)}deg`,
                              "--burst-distance": `${36 + (index % 3) * 10}px`,
                              "--burst-delay": `${(index % 4) * 18}ms`,
                            } as CSSProperties
                          }
                        />
                      ))}
                    </div>
                  )}
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={(event) => onDragStart(event, task.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOver(null);
                      }}
                      className={`kanban-task ${
                        draggingId === task.id ? "is-dragging" : ""
                      } ${justDroppedId === task.id ? "just-dropped" : ""}`}
                    >
                      <p className="text-sm font-medium leading-5">{task.title}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-zinc-400">{task.course}</span>
                        {task.status === "completed" && (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
                            <Check size={11} />
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                  {!columnTasks.length && (
                    <p className="grid min-h-24 place-items-center rounded-xl border border-dashed text-center text-[11px] text-zinc-400">
                      Drop a task here
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
