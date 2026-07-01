import { Clock3, MapPin, Plus, Trash2, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import {
  Button,
  Card,
  DetailModal,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { api } from "../lib/api";
import type { Course } from "../types";

const weekdays = [
  ["MO", "M"],
  ["TU", "T"],
  ["WE", "W"],
  ["TH", "T"],
  ["FR", "F"],
  ["SA", "S"],
  ["SU", "S"],
];

const blank = {
  code: "",
  name: "",
  professor: "",
  location: "",
  days: ["MO", "WE", "FR"],
  start: "13:00",
  end: "14:15",
  color: "#0f766e",
};

function parseRule(rule: string) {
  return Object.fromEntries(rule.split(";").map((part) => part.split("=")));
}

export function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    try {
      setCourses(await api<Course[]>("/courses"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    const created = await api<Course>("/courses", {
      method: "POST",
      body: {
        code: form.code,
        name: form.name,
        professor: form.professor,
        location: form.location,
        color: form.color,
        schedule_rrule: `FREQ=WEEKLY;BYDAY=${form.days.join(",")};START=${form.start};END=${form.end}`,
      },
    });
    setForm(blank);
    setShowForm(false);
    setCourses((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)));
  }

  async function remove(id: string) {
    await api(`/courses/${id}`, { method: "DELETE" });
    setCourses((current) => current.filter((course) => course.id !== id));
  }

  return (
    <>
      <PageHeader
        eyebrow="Academic schedule"
        title="Classes are the anchors."
        description="Recurring class times become locked calendar blocks. The scheduler always works around them."
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} />
            Add course
          </Button>
        }
      />
      {showForm && (
        <Card className="mb-6">
          <form onSubmit={createCourse}>
            <div className="mb-5 flex items-center justify-between">
              <p className="font-semibold">Course details</p>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="field-label">Course code</label>
                <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CS 301" />
              </div>
              <div className="xl:col-span-2">
                <label className="field-label">Course name</label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Algorithms and Data Structures" />
              </div>
              <div>
                <label className="field-label">Color</label>
                <Input type="color" className="p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Professor</label>
                <Input value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} placeholder="Dr. Rivera" />
              </div>
              <div>
                <label className="field-label">Room or link</label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Engineering 204" />
              </div>
              <div>
                <label className="field-label">Starts</label>
                <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Ends</label>
                <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </div>
            </div>
            <div className="mt-4">
              <label className="field-label">Meeting days</label>
              <div className="flex gap-2">
                {weekdays.map(([value, label], index) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={value}
                    onClick={() =>
                      setForm({
                        ...form,
                        days: form.days.includes(value)
                          ? form.days.filter((day) => day !== value)
                          : [...form.days, value],
                      })
                    }
                    className={`grid h-9 w-9 place-items-center rounded-full text-xs font-medium ${
                      form.days.includes(value)
                        ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                    }`}
                  >
                    {label}
                    <span className="sr-only">{index}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button disabled={!form.days.length}>Save course</Button>
            </div>
          </form>
        </Card>
      )}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading courses">
          {[0, 1, 2].map((item) => (
            <Card key={item}>
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="mb-6 h-7 w-3/4" />
              <Skeleton className="mb-3 h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : courses.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const rule = parseRule(course.schedule_rrule);
            return (
              <Card key={course.id} className="group relative overflow-hidden hover:-translate-y-1">
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: course.color }} />
                <button
                  onClick={() => remove(course.id)}
                  aria-label={`Delete ${course.code}`}
                  className="absolute right-4 top-4 text-zinc-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  className="w-full pr-7 text-left"
                  onClick={() => setSelectedId(course.id)}
                  aria-haspopup="dialog"
                >
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-widest" style={{ color: course.color }}>
                      {course.code}
                    </span>
                    <span className="mt-2 block text-lg font-semibold">{course.name}</span>
                  </span>
                  <span className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                    <Clock3 size={15} />
                    {rule.BYDAY?.split(",").join(" · ")} · {rule.START}–{rule.END}
                  </span>
                </button>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState>Add your first course to establish locked academic time.</EmptyState>
      )}
      {selectedId && (() => {
        const course = courses.find((item) => item.id === selectedId);
        if (!course) return null;
        const rule = parseRule(course.schedule_rrule);
        return (
          <DetailModal
            title={`${course.code} · ${course.name}`}
            description="Course details and recurring calendar time"
            onClose={() => setSelectedId(null)}
          >
            <div className="mb-6 h-2 w-full rounded-full" style={{ backgroundColor: course.color }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Meeting time</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                  <Clock3 size={16} />
                  {rule.BYDAY?.split(",").join(" · ")} · {rule.START}–{rule.END}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Professor</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                  <UserRound size={16} />
                  {course.professor || "Not added"}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/60 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Room or link</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                  <MapPin size={16} />
                  {course.location || "Not added"}
                </p>
              </div>
            </div>
          </DetailModal>
        );
      })()}
    </>
  );
}
