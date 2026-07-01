import { addDays, format, startOfWeek, subDays } from "date-fns";
import { Check, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button, Card, EmptyState, Input, PageHeader, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import type { Course, Habit } from "../types";

export function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [range, setRange] = useState<7 | 30>(7);
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const cache = useRef(new Map<number, Habit[]>());
  const dates = useMemo(() => {
    if (range === 7) {
      const start = startOfWeek(new Date(), { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    return Array.from({ length: 30 }, (_, index) => subDays(new Date(), 29 - index));
  }, [range]);

  useEffect(() => {
    void api<Course[]>("/courses").then(setCourses);
  }, []);

  useEffect(() => {
    const cached = cache.current.get(range);
    if (cached) {
      setHabits(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void api<Habit[]>(`/habits?days=${range}`).then((habitData) => {
      cache.current.set(range, habitData);
      setHabits(habitData);
      setLoading(false);
    });
  }, [range]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const created = await api<Habit>("/habits", {
      method: "POST",
      body: { name, course_id: courseId || null, color: "#0f766e" },
    });
    setHabits((current) => {
      const next = [...current, created];
      cache.current.set(range, next);
      return next;
    });
    setName("");
    setCourseId("");
    setShowForm(false);
  }

  async function toggle(habit: Habit, day: Date) {
    const key = format(day, "yyyy-MM-dd");
    const pendingKey = `${habit.id}:${key}`;
    if (pending.has(pendingKey)) return;
    const wasDone = habit.completion_history.includes(key);
    const optimisticHistory = wasDone
      ? habit.completion_history.filter((date) => date !== key)
      : [...habit.completion_history, key];
    setPending((current) => new Set(current).add(pendingKey));
    setHabits((current) =>
      current.map((item) =>
        item.id === habit.id ? { ...item, completion_history: optimisticHistory } : item,
      ),
    );
    try {
      const updated = await api<Habit>(`/habits/${habit.id}/toggle`, {
        method: "POST",
        body: { completed_on: key },
      });
      setHabits((current) => {
        const next = current.map((item) => (item.id === habit.id ? updated : item));
        cache.current.set(range, next);
        return next;
      });
    } catch {
      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id
            ? { ...item, completion_history: habit.completion_history }
            : item,
        ),
      );
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
    }
  }

  async function remove(id: string) {
    await api(`/habits/${id}`, { method: "DELETE" });
    setHabits((current) => {
      const next = current.filter((habit) => habit.id !== id);
      cache.current.set(range, next);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Habit tracker"
        title="Consistency, made visible."
        description="Small repeatable actions compound into a reliable academic system."
        action={
          <Button onClick={() => setShowForm((value) => !value)}>
            <Plus size={16} />
            New habit
          </Button>
        }
      />
      {showForm && (
        <Card className="mb-5">
          <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
            <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Review lecture notes" />
            <select className="select-field sm:max-w-52" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">No course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}
            </select>
            <Button className="shrink-0">Create habit</Button>
          </form>
        </Card>
      )}
      <Card className="overflow-x-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold">Completion rhythm</p>
            <p className="text-xs text-zinc-500">Select any cell to toggle it</p>
          </div>
          <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
            {[7, 30].map((value) => (
              <button
                key={value}
                onClick={() => setRange(value as 7 | 30)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${range === value ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
              >
                {value === 7 ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <HabitSkeleton dates={dates.length} />
        ) : habits.length ? (
          <div className="min-w-max">
            <div className="mb-3 grid items-end gap-3" style={{ gridTemplateColumns: `240px repeat(${dates.length}, 44px) 36px` }}>
              <span />
              {dates.map((day) => (
                <p key={day.toISOString()} className="text-center text-[10px] text-zinc-400">
                  {range === 7 ? format(day, "EEE") : format(day, "d")}
                </p>
              ))}
            </div>
            <div className="space-y-3">
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="grid items-center gap-3 rounded-xl border border-transparent px-2 py-3 transition hover:border-zinc-200 hover:bg-zinc-50/70 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40"
                  style={{ gridTemplateColumns: `240px repeat(${dates.length}, 44px) 36px` }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{habit.name}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {habit.completion_history.length} check-ins
                    </p>
                  </div>
                  {dates.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const done = habit.completion_history.includes(key);
                    const isPending = pending.has(`${habit.id}:${key}`);
                    return (
                      <button
                        key={key}
                        onClick={() => toggle(habit, day)}
                        aria-label={`${done ? "Clear" : "Complete"} ${habit.name} on ${key}`}
                        disabled={isPending}
                        className={`grid h-10 w-10 place-items-center rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-wait ${
                          done
                            ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                            : "bg-zinc-50 hover:border-teal-400 dark:bg-zinc-800"
                        } ${isPending ? "animate-pulse" : ""}`}
                      >
                        {done && <Check size={17} className="animate-pop-in" />}
                      </button>
                    );
                  })}
                  <button className="text-zinc-300 hover:text-red-500" onClick={() => remove(habit.id)} aria-label={`Delete ${habit.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState>Create a habit to begin tracking your rhythm.</EmptyState>
        )}
      </Card>
    </>
  );
}

function HabitSkeleton({ dates }: { dates: number }) {
  return (
    <div className="min-w-max space-y-4" role="status" aria-label="Loading habits">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: `240px repeat(${dates}, 44px) 36px` }}
        >
          <Skeleton className="h-11 w-52" />
          {Array.from({ length: dates }, (_, index) => (
            <Skeleton key={index} className="h-10 w-10 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
