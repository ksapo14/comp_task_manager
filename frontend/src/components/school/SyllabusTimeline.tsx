import { format } from "date-fns";
import {
  ArrowDown,
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { getTimeline, saveTimeline } from "./schoolApi";
import type { SchoolSyncState } from "./schoolApi";
import { SchoolSyncBadge } from "./SchoolSyncBadge";
import type { Milestone } from "./types";

interface Roadmap {
  start: Date | null;
  end: Date | null;
  milestones: Milestone[];
}

interface MilestoneDraft {
  id: string | null;
  title: string;
  course: string;
  kind: Milestone["kind"];
  date: string;
  detail: string;
}

const emptyMilestoneDraft: MilestoneDraft = {
  id: null,
  title: "",
  course: "",
  kind: "Exam",
  date: "",
  detail: "",
};
const LEGACY_DEMO_MILESTONE_IDS = new Set([
  "milestone-1",
  "milestone-2",
  "milestone-3",
  "milestone-4",
]);

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function toDateInput(date: Date | null) {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function toDateTimeInput(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function semesterProgress(start: Date, end: Date, now: Date): number {
  const range = end.getTime() - start.getTime();
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / range));
}

function countdownParts(target: Date, now: Date) {
  const remaining = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    complete: remaining === 0,
  };
}

function isUrgent(milestone: Milestone, now: Date): boolean {
  const daysAway = (milestone.date.getTime() - now.getTime()) / 86_400_000;
  return daysAway >= 0 && daysAway <= 3;
}

export function SyllabusTimeline({
  onLaunchFocus,
  autoEdit = false,
  initialCourse = "",
}: {
  onLaunchFocus: (milestone: Milestone) => void;
  autoEdit?: boolean;
  initialCourse?: string;
}) {
  const [roadmap, setRoadmap] = useState<Roadmap>({
    start: null,
    end: null,
    milestones: [],
  });
  const [now, setNow] = useState(new Date());
  const [syncState, setSyncState] = useState<SchoolSyncState>("loading");
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftMilestones, setDraftMilestones] = useState<Milestone[]>([]);
  const [milestoneDraft, setMilestoneDraft] =
    useState<MilestoneDraft>(emptyMilestoneDraft);
  const [formError, setFormError] = useState("");

  function blankMilestoneDraft(): MilestoneDraft {
    return { ...emptyMilestoneDraft, course: initialCourse };
  }

  useEffect(() => {
    let active = true;
    void getTimeline()
      .then((payload) => {
        if (!active) return;
        const milestones = payload.milestones.filter(
          (milestone) => !LEGACY_DEMO_MILESTONE_IDS.has(milestone.id),
        );
        const removedDemoMilestones = milestones.length !== payload.milestones.length;
        const nextRoadmap: Roadmap =
          removedDemoMilestones && !milestones.length
            ? { start: null, end: null, milestones: [] }
            : { ...payload, milestones };
        setRoadmap(nextRoadmap);
        if (removedDemoMilestones) {
          setSyncState("saving");
          void saveTimeline(nextRoadmap)
            .then(() => setSyncState("synced"))
            .catch(() => setSyncState("offline"));
        } else {
          setSyncState("synced");
        }
        if (autoEdit) {
          setDraftStart(toDateInput(nextRoadmap.start));
          setDraftEnd(toDateInput(nextRoadmap.end));
          setDraftMilestones(nextRoadmap.milestones);
          setMilestoneDraft({
            ...emptyMilestoneDraft,
            course: initialCourse,
          });
          setEditing(true);
        }
      })
      .catch(() => {
        if (active) setSyncState("offline");
      });
    return () => {
      active = false;
    };
  }, [autoEdit, initialCourse]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const orderedMilestones = useMemo(
    () =>
      [...roadmap.milestones].sort(
        (first, second) => first.date.getTime() - second.date.getTime(),
      ),
    [roadmap.milestones],
  );

  function openEditor() {
    setDraftStart(toDateInput(roadmap.start));
    setDraftEnd(toDateInput(roadmap.end));
    setDraftMilestones(roadmap.milestones);
    setMilestoneDraft(blankMilestoneDraft());
    setFormError("");
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setMilestoneDraft(blankMilestoneDraft());
    setFormError("");
  }

  function submitMilestone(event: FormEvent) {
    event.preventDefault();
    const title = milestoneDraft.title.trim();
    const course = milestoneDraft.course.trim();
    const date = new Date(milestoneDraft.date);
    if (!title || !course || !milestoneDraft.date || Number.isNaN(date.getTime())) {
      setFormError("Add a title, class, and valid due date for the milestone.");
      return;
    }

    const next: Milestone = {
      id: milestoneDraft.id ?? newId("milestone"),
      title,
      course,
      kind: milestoneDraft.kind,
      date,
      detail: milestoneDraft.detail.trim(),
    };
    setDraftMilestones((current) =>
      milestoneDraft.id
        ? current.map((milestone) => (milestone.id === milestoneDraft.id ? next : milestone))
        : [...current, next],
    );
    setMilestoneDraft(blankMilestoneDraft());
    setFormError("");
  }

  function editMilestone(milestone: Milestone) {
    setMilestoneDraft({
      id: milestone.id,
      title: milestone.title,
      course: milestone.course,
      kind: milestone.kind,
      date: toDateTimeInput(milestone.date),
      detail: milestone.detail,
    });
    setFormError("");
  }

  function removeMilestone(id: string) {
    setDraftMilestones((current) => current.filter((milestone) => milestone.id !== id));
    if (milestoneDraft.id === id) setMilestoneDraft(blankMilestoneDraft());
  }

  async function saveChanges() {
    if (!draftStart || !draftEnd) {
      setFormError("Choose both a semester start and end date.");
      return;
    }
    const start = localDate(draftStart);
    const end = localDate(draftEnd);
    if (end <= start) {
      setFormError("Semester end must be after the start date.");
      return;
    }

    setSyncState("saving");
    try {
      await saveTimeline({ start, end, milestones: draftMilestones });
      setRoadmap({ start, end, milestones: draftMilestones });
      setEditing(false);
      setFormError("");
      setSyncState("synced");
    } catch {
      setFormError("The timeline could not be saved. Try again.");
      setSyncState("offline");
    }
  }

  const configured = Boolean(roadmap.start && roadmap.end);
  const progress =
    roadmap.start && roadmap.end ? semesterProgress(roadmap.start, roadmap.end, now) : 0;

  return (
    <section className="school-panel syllabus-roadmap rounded-[2rem] p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="school-kicker">Chronological roadmap</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Interactive syllabus timeline
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Your semester, positioned against today in real time.
          </p>
          <SchoolSyncBadge state={syncState} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {configured && (
            <div className="flex items-center gap-3 rounded-2xl border bg-white/55 px-4 py-2.5 text-xs shadow-sm backdrop-blur dark:bg-zinc-900/55">
              <CalendarDays size={15} className="text-violet-500" />
              <span>
                {format(roadmap.start!, "MMM d")} — {format(roadmap.end!, "MMM d")}
              </span>
              <span className="font-mono text-zinc-400">
                {Math.round(progress * 100)}%
              </span>
            </div>
          )}
          <button type="button" onClick={openEditor} className="school-secondary-button">
            <Pencil size={14} />
            {configured ? "Edit timeline" : "Set up timeline"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="school-editor-panel mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Timeline settings</h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                Set semester dates, then add or update syllabus milestones.
              </p>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="school-icon-button"
              aria-label="Close timeline editor"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="school-field-label">
              Semester start
              <input
                type="date"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
                className="school-input mt-1"
              />
            </label>
            <label className="school-field-label">
              Semester end
              <input
                type="date"
                value={draftEnd}
                onChange={(event) => setDraftEnd(event.target.value)}
                className="school-input mt-1"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
            <form onSubmit={submitMilestone} className="rounded-2xl border p-4">
              <h4 className="text-xs font-semibold">
                {milestoneDraft.id ? "Edit milestone" : "Add milestone"}
              </h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="school-field-label sm:col-span-2">
                  Title
                  <input
                    value={milestoneDraft.title}
                    onChange={(event) =>
                      setMilestoneDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="school-input mt-1"
                    placeholder="Midterm exam"
                  />
                </label>
                <label className="school-field-label">
                  Class
                  <input
                    value={milestoneDraft.course}
                    onChange={(event) =>
                      setMilestoneDraft((current) => ({
                        ...current,
                        course: event.target.value,
                      }))
                    }
                    className="school-input mt-1"
                    placeholder="Calculus II"
                  />
                </label>
                <label className="school-field-label">
                  Type
                  <select
                    value={milestoneDraft.kind}
                    onChange={(event) =>
                      setMilestoneDraft((current) => ({
                        ...current,
                        kind: event.target.value as Milestone["kind"],
                      }))
                    }
                    className="school-input mt-1"
                  >
                    <option>Exam</option>
                    <option>Project</option>
                    <option>Deadline</option>
                  </select>
                </label>
                <label className="school-field-label sm:col-span-2">
                  Due date and time
                  <input
                    type="datetime-local"
                    value={milestoneDraft.date}
                    onChange={(event) =>
                      setMilestoneDraft((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    className="school-input mt-1"
                  />
                </label>
                <label className="school-field-label sm:col-span-2">
                  Notes
                  <textarea
                    value={milestoneDraft.detail}
                    onChange={(event) =>
                      setMilestoneDraft((current) => ({
                        ...current,
                        detail: event.target.value,
                      }))
                    }
                    className="school-input mt-1 min-h-20 resize-y"
                    placeholder="Topics, deliverables, or study notes"
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" className="school-primary-button">
                  {milestoneDraft.id ? <Pencil size={13} /> : <Plus size={13} />}
                  {milestoneDraft.id ? "Update milestone" : "Add milestone"}
                </button>
                {milestoneDraft.id && (
                  <button
                    type="button"
                    onClick={() => setMilestoneDraft(blankMilestoneDraft())}
                    className="school-secondary-button"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="space-y-2">
              {draftMilestones
                .slice()
                .sort((first, second) => first.date.getTime() - second.date.getTime())
                .map((milestone) => (
                  <article
                    key={milestone.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border bg-white/50 p-3 dark:bg-zinc-900/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{milestone.title}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {milestone.course} · {format(milestone.date, "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => editMilestone(milestone)}
                        className="school-icon-button"
                        aria-label={`Edit ${milestone.title}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMilestone(milestone.id)}
                        className="school-icon-button school-danger-button"
                        aria-label={`Delete ${milestone.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              {!draftMilestones.length && (
                <p className="grid min-h-32 place-items-center rounded-2xl border border-dashed px-4 text-center text-xs text-zinc-400">
                  No milestones yet. Add the first item from your syllabus.
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-xs font-medium text-red-600">
              {formError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={closeEditor} className="school-secondary-button">
              Cancel
            </button>
            <button type="button" onClick={saveChanges} className="school-primary-button">
              Save timeline
            </button>
          </div>
        </div>
      )}

      {!configured && !editing && syncState !== "loading" && (
        <div className="school-empty-state mt-5">
          <CalendarDays size={22} />
          <h3>No syllabus timeline yet</h3>
          <p>Add semester dates and milestones from your classes to build one.</p>
          <button type="button" onClick={openEditor} className="school-primary-button">
            <Plus size={14} />
            Create timeline
          </button>
        </div>
      )}

      {configured && (
        <div className="timeline-scroll -mx-2 overflow-x-auto px-2 pb-3 pt-2">
          <div className="syllabus-track" aria-label="Semester milestone timeline">
            <div className="syllabus-line">
              <span
                className="syllabus-progress"
                style={{ "--semester-progress": progress } as CSSProperties}
              />
            </div>
            <div
              className="today-marker"
              style={{ "--today-position": `${progress * 100}%` } as CSSProperties}
            >
              <span>Today</span>
              <i />
            </div>

            <span className="timeline-boundary timeline-start">
              <strong>Start</strong>
              {format(roadmap.start!, "MMM d")}
            </span>
            <span className="timeline-boundary timeline-end">
              <strong>Finals</strong>
              {format(roadmap.end!, "MMM d")}
            </span>

            {orderedMilestones.map((milestone) => {
              const position =
                semesterProgress(roadmap.start!, roadmap.end!, milestone.date) * 100;
              const countdown = countdownParts(milestone.date, now);
              const urgent = isUrgent(milestone, now);
              return (
                <div
                  key={milestone.id}
                  className={`timeline-node-wrap ${urgent ? "is-urgent" : ""} ${
                    position >= 82 ? "align-right" : position <= 18 ? "align-left" : ""
                  }`}
                  style={{ "--milestone-position": `${position}%` } as CSSProperties}
                >
                  <button
                    type="button"
                    className="syllabus-node"
                    aria-label={`${milestone.title}, ${format(milestone.date, "MMMM d")}`}
                  >
                    <span className="node-core">
                      {milestone.kind === "Exam" ? (
                        <BookOpenCheck size={15} />
                      ) : (
                        <CalendarDays size={15} />
                      )}
                    </span>
                    <span className="node-label">
                      <small>{format(milestone.date, "MMM d")}</small>
                      <strong>{milestone.title}</strong>
                    </span>
                  </button>

                  <article className="milestone-tooltip">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.17em] text-violet-500">
                          {milestone.kind} · {milestone.course}
                        </span>
                        <h3 className="mt-1 text-sm font-semibold">{milestone.title}</h3>
                      </div>
                      {urgent && <span className="urgent-badge">Due soon</span>}
                    </div>
                    {milestone.detail && (
                      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                        {milestone.detail}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-4 gap-1.5 text-center font-mono">
                      {[
                        ["Days", countdown.days],
                        ["Hrs", countdown.hours],
                        ["Min", countdown.minutes],
                        ["Sec", countdown.seconds],
                      ].map(([label, value]) => (
                        <span key={label}>
                          <strong>{String(value).padStart(2, "0")}</strong>
                          <small>{label}</small>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onLaunchFocus(milestone)}
                      className="milestone-focus-button"
                    >
                      <Clock3 size={13} />
                      {countdown.complete ? "Review milestone" : "Launch focus block"}
                      <ArrowDown size={12} />
                    </button>
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
