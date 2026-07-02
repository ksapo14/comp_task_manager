import { Check, ExternalLink, Link2, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { ActivityPulse, Button, Input, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import type { FocusLink, Task } from "../types";

const DEFAULT_FOCUS_MINUTES = 25;
const MAX_FOCUS_MINUTES = 24 * 60;

const challenges = [
  "while (distracted) { refocus(); }",
  "const progress = effort * consistency;",
  "git commit -m \"finish the work\"",
  "for task in backlog: execute(task)",
];

function savedFocusDuration(): number {
  try {
    const value = Number(window.localStorage.getItem("compass:focus-duration"));
    return Number.isFinite(value) && value >= 1
      ? Math.min(MAX_FOCUS_MINUTES, Math.round(value))
      : DEFAULT_FOCUS_MINUTES;
  } catch {
    return DEFAULT_FOCUS_MINUTES;
  }
}

function readableError(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function createAudioContext(): AudioContext | null {
  const legacyWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor = window.AudioContext ?? legacyWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

export function FocusPage() {
  const navigate = useNavigate();
  const [initialDuration] = useState(savedFocusDuration);
  const [duration, setDuration] = useState(initialDuration);
  const [seconds, setSeconds] = useState(initialDuration * 60);
  const [customMinutes, setCustomMinutes] = useState(String(initialDuration));
  const [running, setRunning] = useState(false);
  const [alarming, setAlarming] = useState(false);
  const [challenge, setChallenge] = useState(challenges[0]);
  const [answer, setAnswer] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<FocusLink[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const audioContext = useRef<AudioContext | null>(null);
  const alarmInterval = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      api<Task[]>("/tasks?completed=false"),
      api<FocusLink[]>("/focus-links"),
    ])
      .then(([taskResult, linkResult]) => {
        if (!active) return;
        const failures: string[] = [];
        if (taskResult.status === "fulfilled") {
          setTasks(taskResult.value);
          setSelected(taskResult.value.slice(0, 3).map((task) => task.id));
        } else {
          failures.push("tasks");
        }
        if (linkResult.status === "fulfilled") {
          setLinks(linkResult.value);
        } else {
          failures.push("launchpad links");
        }
        if (failures.length) {
          setLoadWarning(
            `The timer is ready, but ${failures.join(" and ")} could not be loaded. You can still start a session.`,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (alarmInterval.current !== null) window.clearInterval(alarmInterval.current);
      const context = audioContext.current;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setRunning(false);
          setAlarming(true);
          setChallenge(challenges[Math.floor(Math.random() * challenges.length)]);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!alarming) return;
    const beep = () => {
      const context = audioContext.current ?? createAudioContext();
      if (!context) return;
      audioContext.current = context;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(0.16, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.32);
      } catch {
        // The visual alarm remains usable when audio is blocked or unavailable.
      }
    };
    beep();
    alarmInterval.current = window.setInterval(beep, 900);
    const preventExit = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventExit);
    return () => {
      if (alarmInterval.current !== null) {
        window.clearInterval(alarmInterval.current);
        alarmInterval.current = null;
      }
      window.removeEventListener("beforeunload", preventExit);
    };
  }, [alarming]);

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selected.includes(task.id)),
    [selected, tasks],
  );
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function begin() {
    if (!audioContext.current) audioContext.current = createAudioContext();
    if (audioContext.current?.state === "suspended") {
      void audioContext.current.resume().catch(() => undefined);
    }
    setRunning(true);
  }

  function reset(nextDuration = duration) {
    if (alarming) return;
    setRunning(false);
    setSeconds(nextDuration * 60);
  }

  function selectDuration(minutes: number) {
    const nextDuration = Math.min(MAX_FOCUS_MINUTES, Math.max(1, Math.round(minutes)));
    setDuration(nextDuration);
    setCustomMinutes(String(nextDuration));
    try {
      window.localStorage.setItem("compass:focus-duration", String(nextDuration));
    } catch {
      // The timer remains functional when storage is disabled.
    }
    reset(nextDuration);
  }

  function applyCustomDuration(event: FormEvent) {
    event.preventDefault();
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) return;
    selectDuration(minutes);
  }

  async function completeTask(task: Task) {
    setActionError("");
    setPendingAction(`task:${task.id}`);
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: { is_completed: true } });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelected((current) => current.filter((id) => id !== task.id));
    } catch (reason) {
      setActionError(readableError(reason, "The task could not be completed."));
    } finally {
      setPendingAction("");
    }
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    setActionError("");
    setPendingAction("add-link");
    try {
      const link = await api<FocusLink>("/focus-links", {
        method: "POST",
        body: { label: linkLabel, url: linkUrl },
      });
      setLinks((current) => [...current, link]);
      setLinkLabel("");
      setLinkUrl("");
    } catch (reason) {
      setActionError(readableError(reason, "The launchpad link could not be saved."));
    } finally {
      setPendingAction("");
    }
  }

  async function removeLink(id: string) {
    setActionError("");
    setPendingAction(`link:${id}`);
    try {
      await api(`/focus-links/${id}`, { method: "DELETE" });
      setLinks((current) => current.filter((link) => link.id !== id));
    } catch (reason) {
      setActionError(readableError(reason, "The launchpad link could not be removed."));
    } finally {
      setPendingAction("");
    }
  }

  function dismissAlarm(event: FormEvent) {
    event.preventDefault();
    if (answer !== challenge) return;
    setAlarming(false);
    setAnswer("");
    reset();
  }

  return createPortal(
    <div className="focus-stage fixed inset-0 z-[60] overflow-y-auto bg-[#f3f1eb] text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col p-5 md:p-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-400">Deep work</p>
            <p className="mt-1 text-sm text-zinc-500">One session. One outcome.</p>
          </div>
          <button
            disabled={alarming}
            onClick={() => navigate("/")}
            className="rounded-full border p-2 text-zinc-500 hover:bg-white disabled:opacity-20 dark:hover:bg-zinc-900"
            aria-label="Exit focus mode"
          >
            <X size={19} />
          </button>
        </header>
        {(loadWarning || actionError) && (
          <div
            role={actionError ? "alert" : "status"}
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              actionError
                ? "border-red-200 bg-red-50/80 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                : "border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
            }`}
          >
            {actionError || loadWarning}
          </div>
        )}
        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.2fr_.8fr]">
          <section className="animate-page-in text-center">
            <p
              className={`focus-clock-shell font-mono text-[clamp(5rem,16vw,11rem)] font-medium leading-none tracking-[-0.08em] tabular-nums ${running ? "is-running" : ""}`}
            >
              <span key={seconds} className="focus-clock inline-block">
                {time}
              </span>
            </p>
            <p className="mt-5 text-sm text-zinc-500">
              {running ? "Stay with the problem." : seconds === 0 ? "Session complete." : "Ready when you are."}
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <button
                onClick={() => (running ? setRunning(false) : begin())}
                className="focus-control grid h-14 w-14 place-items-center rounded-full bg-zinc-950 text-white shadow-soft dark:bg-white dark:text-zinc-950"
                aria-label={running ? "Pause" : "Start"}
              >
                {running ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <button onClick={() => reset()} disabled={alarming} className="focus-control grid h-14 w-14 place-items-center rounded-full border bg-white/50 dark:bg-zinc-900" aria-label="Reset">
                <RotateCcw size={18} />
              </button>
            </div>
            <div className="mt-6 flex justify-center gap-2">
              {[25, 50, 90].map((minutes) => (
                <button
                  key={minutes}
                  disabled={running || alarming}
                  onClick={() => selectDuration(minutes)}
                  className={`rounded-full px-3 py-1.5 text-xs ${duration === minutes ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" : "text-zinc-400"}`}
                >
                  {minutes}m
                </button>
              ))}
            </div>
            <form
              onSubmit={applyCustomDuration}
              className="mx-auto mt-4 flex max-w-xs items-end justify-center gap-2"
            >
              <label className="text-left">
                <span className="field-label">Custom minutes</span>
                <Input
                  type="number"
                  min={1}
                  max={MAX_FOCUS_MINUTES}
                  step={1}
                  disabled={running || alarming}
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  aria-label="Custom focus minutes"
                  className="w-32 text-center font-mono"
                />
              </label>
              <Button
                variant="secondary"
                disabled={
                  running
                  || alarming
                  || !Number.isFinite(Number(customMinutes))
                  || Number(customMinutes) < 1
                  || Number(customMinutes) > MAX_FOCUS_MINUTES
                }
              >
                Set time
              </Button>
            </form>
          </section>
          <section className="space-y-4">
            <div className="focus-panel rounded-3xl border bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/70">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">Session checklist</p>
              {loading ? (
                <div className="space-y-3" role="status" aria-label="Loading focus tasks">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-11 w-full" />
                  ))}
                </div>
              ) : selectedTasks.length ? (
                <div className="space-y-2">
                  {selectedTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => completeTask(task)}
                      disabled={Boolean(pendingAction)}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full border text-transparent hover:border-teal-600 hover:text-teal-600">
                        {pendingAction === `task:${task.id}` ? <ActivityPulse /> : <Check size={12} />}
                      </span>
                      <span className="flex-1 text-sm font-medium">{task.title}</span>
                      <span className="font-mono text-xs text-zinc-400">{task.duration_minutes}m</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Choose tasks from the list below.</p>
              )}
              <select
                className="select-field mt-4"
                value=""
                onChange={(event) => event.target.value && setSelected((current) => [...new Set([...current, event.target.value])])}
              >
                <option value="">Add a task to this session…</option>
                {tasks.filter((task) => !selected.includes(task.id)).map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            </div>
            <div className="focus-panel rounded-3xl border bg-white/70 p-6 shadow-soft backdrop-blur dark:bg-zinc-900/70">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">Launchpad</p>
              <div className="mb-4 flex flex-wrap gap-2">
                {!loading && links.length === 0 && (
                  <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                    <Link2 size={13} />
                    Add frequently used resources below.
                  </span>
                )}
                {links.map((link) => (
                  <span key={link.id} className="group inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs dark:bg-zinc-800">
                    <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                      {link.label}<ExternalLink size={11} />
                    </a>
                    <button
                      onClick={() => removeLink(link.id)}
                      disabled={Boolean(pendingAction)}
                      aria-label={`Remove ${link.label}`}
                      className="ml-1 hidden text-red-500 group-hover:block focus:block"
                    >
                      {pendingAction === `link:${link.id}` ? <ActivityPulse /> : <X size={11} />}
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={addLink} className="grid gap-2 sm:grid-cols-[.7fr_1.3fr_auto]">
                <Input required value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="Docs" />
                <Input required type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" />
                <Button
                  variant="secondary"
                  aria-label="Add link"
                  disabled={Boolean(pendingAction)}
                >
                  {pendingAction === "add-link" ? <ActivityPulse /> : <Plus size={15} />}
                </Button>
              </form>
            </div>
          </section>
        </main>
      </div>
      {alarming && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-red-950/95 p-6 text-white backdrop-blur">
          <div className="alarm-ring absolute h-80 w-80 rounded-full border border-red-400/40" />
          <form onSubmit={dismissAlarm} className="relative w-full max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-red-300">Focus alarm</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight">Prove you’re back.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-red-200/70">
              The alarm stops only when you type the code exactly as shown.
            </p>
            <code className="my-8 block rounded-2xl border border-red-400/30 bg-black/20 p-5 font-mono text-base">
              {challenge}
            </code>
            <Input
              autoFocus
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="border-red-400/40 bg-white/10 text-center font-mono text-white placeholder:text-red-200/30"
              placeholder="Type the code…"
            />
            <Button className="mt-4 w-full" disabled={answer !== challenge}>Silence alarm</Button>
          </form>
        </div>
      )}
    </div>,
    document.body,
  );
}
