import { format, isToday } from "date-fns";
import { ArrowUpRight, CalendarClock, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, EmptyState, PageHeader, Skeleton } from "../components/ui";
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
  const greeting = greetingForHour(new Date().getHours());

  return (
    <>
      <PageHeader
        eyebrow={format(new Date(), "EEEE, MMMM d")}
        title={`${greeting}.`}
        description={`A clear view of what matters today, ${user?.email.split("@")[0]}.`}
        action={
          <Link
            to="/focus"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
          >
            <Clock3 size={16} />
            Start focus
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Open tasks", tasks.length, "Across your backlog"],
          ["Today's blocks", blocks.length, "Classes and focused work"],
          ["Habit rhythm", `${habitProgress}/${habits.length}`, "Completed today"],
        ].map(([label, value, detail]) => (
          <Card key={label} className="p-5">
            {loading ? (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-9 w-16" />
                <Skeleton className="mt-2 h-3 w-32" />
              </>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-zinc-500">{detail}</p>
              </>
            )}
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-semibold">Today’s timeline</p>
              <p className="text-xs text-zinc-500">Your fixed and scheduled commitments</p>
            </div>
            <Link to="/calendar" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
            </div>
          ) : blocks.length ? (
            <div className="space-y-2">
              {blocks.map((block) => (
                <div key={block.id} className="flex items-center gap-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                  <span className="h-9 w-1 rounded-full" style={{ backgroundColor: block.color }} />
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
        <Card>
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
            <div className="space-y-4">
              {dueSoon.map((task) => (
                <div key={task.id} className="flex gap-3">
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
    </>
  );
}
