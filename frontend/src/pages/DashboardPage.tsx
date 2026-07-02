import { format, isToday } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  Flame,
  ListTodo,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import {
  ActivityPulse,
  Card,
  EmptyState,
  LiveStatus,
  PageHeader,
  ProgressRing,
  Skeleton,
} from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type { CalendarBlock, Habit, Task } from "../types";

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good night";
}

export function DashboardPage() {
  const user = useAuth((state) => state.user);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    void Promise.all([
      api<Task[]>("/tasks?completed=false"),
      api<Habit[]>("/habits?days=7"),
      api<CalendarBlock[]>(`/calendar/blocks?start=${today}&days=1`),
    ]).then(([taskData, habitData, blockData]) => {
      setTasks(taskData);
      setHabits(habitData);
      setBlocks(blockData);
      setLoading(false);
    });
  }, []);

  const dueSoon = useMemo(
    () =>
      tasks
        .filter((task) => task.due_date)
        .sort((a, b) => +new Date(a.due_date!) - +new Date(b.due_date!))
        .slice(0, 4),
    [tasks],
  );
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const habitProgress = habits.filter((habit) =>
    habit.completion_history.includes(todayKey),
  ).length;
  const habitPercentage = habits.length ? (habitProgress / habits.length) * 100 : 0;
  const attentionCount = tasks.filter((task) => task.priority === "high").length;
  const signalTone = attentionCount > 2 ? "warm" : "calm";
  const signalCopy = attentionCount > 2
    ? `${attentionCount} high-priority tasks are competing for attention. Protect one focus block first.`
    : blocks.length
      ? `Your day has ${blocks.length} anchored block${blocks.length === 1 ? "" : "s"}. The remaining space is flexible.`
      : "Your calendar is open. This is a good window to place one meaningful focus block.";
  const greeting = greetingForHour(new Date().getHours());
  const metrics = [
    {
      label: "Open tasks",
      value: tasks.length,
      detail: `${attentionCount} high priority`,
      icon: ListTodo,
      accent: "teal",
    },
    {
      label: "Today's blocks",
      value: blocks.length,
      detail: blocks.length ? "Your day has structure" : "Open for deep work",
      icon: CalendarClock,
      accent: "violet",
    },
    {
      label: "Habit rhythm",
      value: `${habitProgress}/${habits.length}`,
      detail: habitProgress ? "Momentum is building" : "Ready when you are",
      icon: Flame,
      accent: "amber",
    },
  ] as const;

  return (
    <div className="dashboard-scene">
      <PageHeader
        eyebrow={format(new Date(), "EEEE, MMMM d")}
        title={`${greeting}.`}
        description={`A clear view of what matters today, ${user?.email.split("@")[0]}.`}
        action={
          <Link
            to="/focus"
            className="interactive-button group relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white shadow-lg shadow-zinc-950/10 dark:bg-white dark:text-zinc-950"
          >
            <Clock3 size={16} />
            Start focus
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      />

      <section
        className={`daily-signal daily-signal-${signalTone} mb-5 overflow-hidden rounded-3xl border p-5 sm:p-6`}
        aria-label="Daily workspace signal"
      >
        <span className="daily-signal-beam" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="signal-orb shrink-0" aria-hidden="true">
            <ActivityPulse />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <LiveStatus
                label={loading ? "Reading your workspace" : "Compass signal"}
                tone={signalTone === "warm" ? "amber" : "teal"}
              />
              {!loading && (
                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                  updated now
                </span>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : (
              <>
                <p className="max-w-3xl text-base font-medium leading-7 text-zinc-800 dark:text-zinc-100">
                  {signalCopy}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Based on today’s schedule, habits, and task priority.
                </p>
              </>
            )}
          </div>
          <Sparkles className="signal-sparkle hidden shrink-0 text-teal-600 sm:block" size={22} />
        </div>
      </section>

      <div className="stagger-children mb-6 grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value, detail, icon: Icon, accent }, index) => (
          <Card key={label} enterIndex={index} className={`metric-card metric-${accent} p-5`}>
            {loading ? (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-9 w-16" />
                <Skeleton className="mt-2 h-3 w-32" />
              </>
            ) : (
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    {label}
                  </p>
                  <p className="metric-value mt-3 text-3xl font-semibold tracking-tight">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{detail}</p>
                </div>
                {label === "Habit rhythm" ? (
                  <ProgressRing value={habitPercentage} label="today" />
                ) : (
                  <span className="metric-icon grid h-10 w-10 place-items-center rounded-xl">
                    <Icon size={18} />
                  </span>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="stagger-children grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <Card enterIndex={3} className="dashboard-panel">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-semibold">Today’s timeline</p>
              <p className="text-xs text-zinc-500">Your fixed and scheduled commitments</p>
            </div>
            <Link
              to="/calendar"
              aria-label="Open calendar"
              className="interactive-icon grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
            </div>
          ) : blocks.length ? (
            <div className="timeline-list space-y-2">
              {blocks.map((block, index) => (
                <div
                  key={block.id}
                  style={{ "--item-index": index } as CSSProperties}
                  className="timeline-entry list-item-motion flex items-center gap-4 rounded-xl border border-transparent bg-zinc-50/80 p-3 dark:bg-zinc-800/60"
                >
                  <span className="timeline-rail h-9 w-1 rounded-full" style={{ backgroundColor: block.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{block.title}</p>
                    <p className="text-xs capitalize text-zinc-400">{block.kind}</p>
                  </div>
                  <p className="font-mono text-xs text-zinc-500">
                    {format(new Date(block.start), "h:mm a")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No blocks scheduled today. Your calendar is open.</EmptyState>
          )}
        </Card>
        <Card enterIndex={4} className="dashboard-panel">
          <div className="mb-5 flex items-center gap-3">
            <CalendarClock size={18} />
            <div>
              <p className="font-semibold">Next deadlines</p>
              <p className="text-xs text-zinc-500">Ordered by due date</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-11 w-full" />)}
            </div>
          ) : dueSoon.length ? (
            <div className="deadline-list space-y-2">
              {dueSoon.map((task, index) => (
                <div
                  key={task.id}
                  style={{ "--item-index": index } as CSSProperties}
                  className="deadline-entry list-item-motion flex gap-3 rounded-xl border border-transparent p-2"
                >
                  {task.is_completed ? (
                    <CheckCircle2 size={17} className="mt-0.5 text-teal-600" />
                  ) : (
                    <Circle size={17} className="mt-0.5 text-zinc-300" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-zinc-500">
                      {isToday(new Date(task.due_date!))
                        ? "Due today"
                        : format(new Date(task.due_date!), "MMM d · h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No upcoming deadlines.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
