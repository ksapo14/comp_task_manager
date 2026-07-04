import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LockKeyhole,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent } from "react";

import {
  Button,
  Card,
  DetailModal,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type { CalendarBlock, Task } from "../types";

type View = "day" | "week" | "month";

const DEFAULT_HOUR_HEIGHT = 64;
const MIN_HOUR_HEIGHT = 40;
const MAX_HOUR_HEIGHT = 96;
const HOUR_HEIGHT_STEP = 8;
const DAY_MINUTES = 24 * 60;

function blocksOnDay(blocks: CalendarBlock[], day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  return blocks.filter(
    (block) => new Date(block.start) < dayEnd && new Date(block.end) > dayStart,
  );
}

export function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [backlog, setBacklog] = useState<Task[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [message, setMessage] = useState("");
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const user = useAuth((state) => state.user);

  const interval = useMemo(() => {
    if (view === "day") return { start: anchor, end: anchor };
    if (view === "week") {
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
    };
  }, [anchor, view]);
  const days = eachDayOfInterval(interval);

  const load = useCallback(async () => {
    try {
      const [blockData, taskData] = await Promise.all([
        api<CalendarBlock[]>(
          `/calendar/blocks?start=${format(interval.start, "yyyy-MM-dd")}&days=${days.length}`,
        ),
        api<Task[]>("/tasks?completed=false"),
      ]);
      setBlocks(blockData);
      setBacklog(taskData.filter((task) => !task.scheduled_start_time));
    } finally {
      setLoading(false);
    }
  }, [days.length, interval.start]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const synced = () => void load();
    window.addEventListener("compass:calendar-synced", synced);
    return () => window.removeEventListener("compass:calendar-synced", synced);
  }, [load]);

  async function autoSchedule() {
    setScheduling(true);
    try {
      await api("/calendar/auto-schedule", {
        method: "POST",
        body: {
          start_date: format(new Date(), "yyyy-MM-dd"),
          horizon_days: view === "month" ? 30 : 7,
        },
      });
      await load();
    } finally {
      setScheduling(false);
    }
  }

  function move(direction: -1 | 1) {
    if (view === "day") setAnchor(direction > 0 ? addDays(anchor, 1) : subDays(anchor, 1));
    if (view === "week") setAnchor(direction > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1));
    if (view === "month") setAnchor(direction > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1));
  }

  function availableSlot(
    task: Task,
    day: Date,
    preferredMinute?: number,
  ): Date | null {
    if (!user) return null;
    const [startHour, startMinute] = user.preferred_start_time.split(":").map(Number);
    const [endHour, endMinute] = user.preferred_end_time.split(":").map(Number);
    const workStart = new Date(day);
    workStart.setHours(startHour, startMinute, 0, 0);
    const workEnd = new Date(day);
    workEnd.setHours(endHour, endMinute, 0, 0);
    if (workEnd <= workStart) workEnd.setDate(workEnd.getDate() + 1);
    const cursor = new Date(workStart);
    if (preferredMinute !== undefined) {
      cursor.setHours(0, preferredMinute, 0, 0);
      if (cursor < workStart) cursor.setTime(workStart.getTime());
    }
    const now = new Date();
    if (cursor <= now && now < workEnd) {
      cursor.setTime(now.getTime());
      cursor.setSeconds(0, 0);
      cursor.setMinutes(Math.ceil(cursor.getMinutes() / 15) * 15);
    }
    const duration = task.duration_minutes * 60_000;
    while (cursor.getTime() + duration <= workEnd.getTime()) {
      const candidateEnd = new Date(cursor.getTime() + duration);
      const conflicts = blocks.some((block) => {
        const blockStart = new Date(block.start);
        const blockEnd = new Date(block.end);
        return cursor < blockEnd && candidateEnd > blockStart;
      });
      if (!conflicts) return cursor;
      cursor.setMinutes(cursor.getMinutes() + 15);
    }
    return null;
  }

  async function scheduleDroppedTask(
    taskId: string,
    day: Date,
    preferredMinute?: number,
  ) {
    const task = backlog.find((item) => item.id === taskId);
    if (!task || task.is_blocked) return;
    const slot = availableSlot(task, day, preferredMinute);
    setDropTarget(null);
    setDraggingId(null);
    if (!slot) {
      setMessage(`No ${task.duration_minutes}-minute opening exists on ${format(day, "MMM d")}.`);
      return;
    }
    const optimisticBlock: CalendarBlock = {
      id: task.id,
      title: task.title,
      kind: "task",
      start: slot.toISOString(),
      end: new Date(slot.getTime() + task.duration_minutes * 60_000).toISOString(),
      color: "#14b8a6",
      locked: false,
    };
    setMessage("");
    setBacklog((current) => current.filter((item) => item.id !== task.id));
    setBlocks((current) => [...current, optimisticBlock].sort((a, b) => +new Date(a.start) - +new Date(b.start)));
    try {
      await api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: { scheduled_start_time: slot.toISOString() },
      });
      setMessage(`${task.title} scheduled for ${format(slot, "MMM d 'at' h:mm a")}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to schedule task.");
      await load();
    }
  }

const schedulableBacklog = backlog.filter((task) => !task.is_blocked);

  return (
    <>
      <PageHeader
        eyebrow="Smart calendar"
        title="Protect time for the work."
        description="Classes and external events are locked. Compass fits prioritized tasks into the open space."
        action={
          <Button onClick={autoSchedule} disabled={scheduling || schedulableBacklog.length === 0}>
            <Sparkles size={16} />
            {scheduling ? "Scheduling…" : `Schedule backlog (${schedulableBacklog.length})`}
          </Button>
        }
      />
      {backlog.length > 0 && (
        <Card className="mb-4 overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Unscheduled tasks</p>
              <p className="text-xs text-zinc-500">
                Drag a task onto a time slot to place it.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
              {backlog.length}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {backlog.map((task) => (
              <button
                key={task.id}
                draggable={!task.is_blocked}
                disabled={task.is_blocked}
                onDragStart={(event) => {
                  if (task.is_blocked) return;
                  event.dataTransfer.setData("text/task-id", task.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(task.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                className={`flex min-w-52 items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm shadow-sm transition dark:bg-zinc-900 ${
                  task.is_blocked
                    ? "cursor-not-allowed border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10"
                    : "hover:-translate-y-0.5 hover:border-teal-500"
                } ${
                  draggingId === task.id ? "dragging-card" : ""
                }`}
              >
                {task.is_blocked ? (
                  <LockKeyhole size={15} className="shrink-0 text-amber-600" />
                ) : (
                  <GripVertical size={15} className="shrink-0 text-zinc-400" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{task.title}</span>
                  <span className="block text-xs text-zinc-400">
                    {task.is_blocked ? "Blocked by prerequisite" : `${task.duration_minutes} min`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
      <Card className="overflow-visible p-0">
        <div className="flex flex-col justify-between gap-4 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => move(-1)} aria-label="Previous">
              <ChevronLeft size={18} />
            </button>
            <button className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => move(1)} aria-label="Next">
              <ChevronRight size={18} />
            </button>
            <button className="ml-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white" onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <p className="ml-3 font-semibold">
              {view === "month"
                ? format(anchor, "MMMM yyyy")
                : view === "day"
                  ? format(anchor, "EEEE, MMMM d")
                  : `${format(interval.start, "MMM d")} – ${format(interval.end, "MMM d, yyyy")}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view !== "month" && (
              <div
                className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
                aria-label="Calendar scale"
              >
                <button
                  type="button"
                  onClick={() =>
                    setHourHeight((current) =>
                      Math.max(MIN_HOUR_HEIGHT, current - HOUR_HEIGHT_STEP),
                    )
                  }
                  disabled={hourHeight === MIN_HOUR_HEIGHT}
                  className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:opacity-30 dark:hover:bg-zinc-700 dark:hover:text-white"
                  aria-label="Compress calendar"
                  title="Show more hours"
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHourHeight((current) =>
                      Math.min(MAX_HOUR_HEIGHT, current + HOUR_HEIGHT_STEP),
                    )
                  }
                  disabled={hourHeight === MAX_HOUR_HEIGHT}
                  className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:opacity-30 dark:hover:bg-zinc-700 dark:hover:text-white"
                  aria-label="Expand calendar"
                  title="Show more detail"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            )}
            <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {(["day", "week", "month"] as View[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setView(item)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
                    view === item ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading ? (
          <CalendarSkeleton view={view} />
        ) : view !== "month" ? (
          <CalendarTimeGrid
            days={view === "day" ? [anchor] : days}
            blocks={blocks}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDropTarget={setDropTarget}
            onDropTask={scheduleDroppedTask}
            onSelect={setSelectedBlock}
            hourHeight={hourHeight}
          />
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayBlocks = blocksOnDay(blocks, day);
              const outsideMonth = day.getMonth() !== anchor.getMonth();
              return (
                <div
                  key={day.toISOString()}
                  onDragOver={(event) => {
                    if (!draggingId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget(format(day, "yyyy-MM-dd"));
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropTarget(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/task-id") || draggingId;
                    if (taskId) void scheduleDroppedTask(taskId, day);
                  }}
                  className={`min-h-32 border-b border-r p-2 last:border-r-0 ${
                    outsideMonth ? "bg-zinc-50/80 text-zinc-400 dark:bg-zinc-950/50" : ""
                  } min-h-28 ${
                    dropTarget === format(day, "yyyy-MM-dd") ? "drop-target" : ""
                  }`}
                >
                  <p className={`mb-3 text-center text-xs ${isSameDay(day, new Date()) ? "mx-auto flex min-h-8 min-w-8 w-fit items-center justify-center whitespace-nowrap rounded-full bg-zinc-950 px-2 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500"}`}>
                    {format(day, "d")}
                  </p>
                  <div className="space-y-1.5">
                    {dayBlocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => setSelectedBlock(block)}
                        className="block w-full truncate rounded-md border-l-2 bg-zinc-50 px-2 py-1.5 text-left text-[10px] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
                        style={{ borderLeftColor: block.color }}
                        title={block.title}
                      >
                        <p className="truncate font-medium">{block.title}</p>
                        <p className="text-zinc-400">
                          {isSameDay(new Date(block.start), day)
                            ? format(new Date(block.start), "h:mm a")
                            : `Continues · ends ${format(new Date(block.end), "h:mm a")}`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {selectedBlock && (
        <DetailModal
          title={selectedBlock.title}
          description={`${selectedBlock.kind[0].toUpperCase()}${selectedBlock.kind.slice(1)} details`}
          onClose={() => setSelectedBlock(null)}
        >
          <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-800/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Time
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {format(new Date(selectedBlock.start), "PPp")} –{" "}
                {format(new Date(selectedBlock.end), "p")}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {selectedBlock.locked
                ? "This time is locked and the scheduler works around it."
                : "This task was placed in an available working-hours block."}
            </p>
          </div>
        </DetailModal>
      )}
      {message && (
        <p className="animate-expand-in mt-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
        {[["#0f766e", "Scheduled task"], ["#71717a", "Course"], ["#8b5cf6", "Google Calendar"]].map(([color, label]) => (
          <span key={label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

interface PositionedBlock {
  block: CalendarBlock;
  endMinute: number;
  lane: number;
  laneCount: number;
  startMinute: number;
}

function positionedBlocksForDay(
  blocks: CalendarBlock[],
  day: Date,
): PositionedBlock[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  const segments = blocksOnDay(blocks, day)
    .map((block) => {
      const start = new Date(
        Math.max(new Date(block.start).getTime(), dayStart.getTime()),
      );
      const end = new Date(
        Math.min(new Date(block.end).getTime(), dayEnd.getTime()),
      );
      return {
        block,
        startMinute: (start.getTime() - dayStart.getTime()) / 60_000,
        endMinute: (end.getTime() - dayStart.getTime()) / 60_000,
      };
    })
    .filter((segment) => segment.endMinute > segment.startMinute)
    .sort(
      (first, second) =>
        first.startMinute - second.startMinute ||
        first.endMinute - second.endMinute,
    );

  const positioned: PositionedBlock[] = [];
  let cluster: Array<Omit<PositionedBlock, "laneCount">> = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  function finishCluster() {
    const laneCount = Math.max(1, laneEnds.length);
    positioned.push(
      ...cluster.map((segment) => ({ ...segment, laneCount })),
    );
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  }

  for (const segment of segments) {
    if (cluster.length && segment.startMinute >= clusterEnd) finishCluster();
    let lane = laneEnds.findIndex((endMinute) => endMinute <= segment.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(segment.endMinute);
    } else {
      laneEnds[lane] = segment.endMinute;
    }
    cluster.push({ ...segment, lane });
    clusterEnd = Math.max(clusterEnd, segment.endMinute);
  }
  if (cluster.length) finishCluster();
  return positioned;
}

function CalendarTimeGrid({
  days,
  blocks,
  draggingId,
  dropTarget,
  onDropTarget,
  onDropTask,
  onSelect,
  hourHeight,
}: {
  days: Date[];
  blocks: CalendarBlock[];
  draggingId: string | null;
  dropTarget: string | null;
  onDropTarget: (target: string | null) => void;
  onDropTask: (
    taskId: string,
    day: Date,
    preferredMinute?: number,
  ) => Promise<void>;
  onSelect: (block: CalendarBlock) => void;
  hourHeight: number;
}) {
  const gridHeight = hourHeight * 24;
  const gridColumns = `4.5rem repeat(${days.length}, minmax(0, 1fr))`;

  function minuteFromDrop(event: DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const rawMinute = ((event.clientY - bounds.top) / gridHeight) * DAY_MINUTES;
    return Math.max(0, Math.min(DAY_MINUTES - 15, Math.round(rawMinute / 15) * 15));
  }

  return (
    <div
      className="calendar-time-scroll"
      aria-label={`${days.length === 1 ? "Day" : "Week"} hourly calendar`}
    >
      <div
        className="calendar-time-grid"
        style={
          {
            "--calendar-day-count": days.length,
            "--calendar-hour-height": `${hourHeight}px`,
            "--calendar-quarter-height": `${hourHeight / 4}px`,
            gridTemplateColumns: gridColumns,
          } as CSSProperties
        }
      >
        <div className="calendar-time-corner" aria-hidden="true">
          Time
        </div>
        {days.map((day) => (
          <div
            key={`header-${day.toISOString()}`}
            className={`calendar-time-day-header ${
              isSameDay(day, new Date()) ? "is-today" : ""
            }`}
          >
            <span>{format(day, "EEE")}</span>
            <strong>{format(day, "d")}</strong>
          </div>
        ))}

        <div className="calendar-hour-axis" style={{ height: gridHeight }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              style={{ top: hour * hourHeight }}
            >
              {format(new Date(2026, 0, 1, hour), "h a")}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const positioned = positionedBlocksForDay(blocks, day);
          const now = new Date();
          const nowMinute = now.getHours() * 60 + now.getMinutes();
          return (
            <div
              key={day.toISOString()}
              className={`calendar-time-day-column ${
                dropTarget === dayKey ? "is-drop-target" : ""
              }`}
              style={{ height: gridHeight }}
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onDropTarget(dayKey);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  onDropTarget(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId =
                  event.dataTransfer.getData("text/task-id") || draggingId;
                if (taskId) {
                  void onDropTask(taskId, day, minuteFromDrop(event));
                }
              }}
            >
              {isSameDay(day, now) && (
                <span
                  className="calendar-now-line"
                  style={{ top: (nowMinute / 60) * hourHeight }}
                  aria-label={`Current time ${format(now, "h:mm a")}`}
                />
              )}
              {positioned.map(
                ({ block, startMinute, endMinute, lane, laneCount }) => {
                  const height = Math.max(
                    22,
                    ((endMinute - startMinute) / 60) * hourHeight,
                  );
                  return (
                    <button
                      key={`${block.id}:${dayKey}`}
                      type="button"
                      onClick={() => onSelect(block)}
                      className={`calendar-grid-event calendar-event-${block.kind}`}
                      style={
                        {
                          top: (startMinute / 60) * hourHeight,
                          height,
                          left: `calc(${(lane / laneCount) * 100}% + 3px)`,
                          width: `calc(${100 / laneCount}% - 6px)`,
                          borderLeftColor: block.color,
                        } as CSSProperties
                      }
                      title={`${block.title}, ${format(new Date(block.start), "h:mm a")} to ${format(new Date(block.end), "h:mm a")}`}
                    >
                      <strong>{block.title}</strong>
                      {height >= 38 && (
                        <span>
                          {format(new Date(block.start), "h:mm")}–
                          {format(new Date(block.end), "h:mm a")}
                          {block.locked && " · locked"}
                        </span>
                      )}
                    </button>
                  );
                },
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarSkeleton({ view }: { view: View }) {
  return (
    <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-7"}`} role="status" aria-label="Loading calendar">
      {Array.from({ length: view === "day" ? 4 : 7 }, (_, index) => (
        <div key={index} className="min-h-48 border-r p-3">
          <Skeleton className="mx-auto mb-5 h-7 w-12" />
          <Skeleton className="mb-2 h-14 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
