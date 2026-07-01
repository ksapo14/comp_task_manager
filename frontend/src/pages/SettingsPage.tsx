import { CalendarSync, Check, Laptop, Moon, Save, Sun } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button, Card, Input, PageHeader } from "../components/ui";
import type { Theme } from "../hooks/useTheme";
import { api } from "../lib/api";
import { recordGoogleCalendarSync, useAuth } from "../store/auth";
import type { User } from "../types";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  authorization_url: string | null;
}

export function SettingsPage({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const { user, setUser } = useAuth();
  const [start, setStart] = useState(user?.preferred_start_time.slice(0, 5) ?? "08:00");
  const [end, setEnd] = useState(user?.preferred_end_time.slice(0, 5) ?? "22:00");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api<GoogleStatus>("/google/status").then(setGoogle);
  }, []);

  async function saveHours(event: FormEvent) {
    event.preventDefault();
    if (!start || !end) {
      setMessage("Choose both a start and end time.");
      return;
    }
    if (end === start) {
      setMessage("Start and end time must be different.");
      return;
    }
    setMessage("");
    try {
      const updated = await api<User>("/auth/me", {
        method: "PATCH",
        body: { preferred_start_time: start, preferred_end_time: end },
      });
      setUser(updated);
      setMessage("Working hours saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save working hours.");
    }
  }

  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await api<{ pulled: number; pushed: number }>("/google/sync", { method: "POST" });
      if (user) recordGoogleCalendarSync(user.id);
      window.dispatchEvent(new Event("compass:calendar-synced"));
      setMessage(`Synced ${result.pulled} external events and ${result.pushed} scheduled tasks.`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Shape your workspace." description="Set the conditions Compass uses to protect your time and attention." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="font-semibold">Appearance</p>
          <p className="mt-1 text-xs text-zinc-500">System mode follows your browser preference.</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {([
              ["light", Sun, "Light"],
              ["dark", Moon, "Dark"],
              ["system", Laptop, "System"],
            ] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`relative rounded-xl border p-4 text-left transition ${theme === value ? "border-teal-600 bg-teal-50 dark:bg-teal-950/30" : ""}`}
              >
                <Icon size={18} className="mb-5" />
                <p className="text-sm font-medium">{label}</p>
                {theme === value && <Check size={14} className="absolute right-3 top-3 text-teal-600" />}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <p className="font-semibold">Preferred working hours</p>
          <p className="mt-1 text-xs text-zinc-500">
            The auto-scheduler only places tasks inside this window. If the end is earlier,
            it is treated as the following day.
          </p>
          <form onSubmit={saveHours} className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Start</label>
              <Input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">End</label>
              <Input
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </div>
            <Button className="col-span-2 mt-2"><Save size={15} /> Save hours</Button>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <CalendarSync size={20} />
              </div>
              <div>
                <p className="font-semibold">Google Calendar</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                  Pull personal events as locked blocks and push scheduled Compass tasks to your primary calendar.
                </p>
                {google && !google.configured && (
                  <p className="mt-2 text-xs text-amber-600">Add Google OAuth credentials to `.env` to enable this integration.</p>
                )}
              </div>
            </div>
            {google?.connected ? (
              <Button variant="secondary" onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</Button>
            ) : google?.authorization_url ? (
              <a className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950" href={google.authorization_url}>
                Connect account
              </a>
            ) : (
              <Button variant="secondary" disabled>Not configured</Button>
            )}
          </div>
        </Card>
      </div>
      {message && <p className="mt-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">{message}</p>}
    </>
  );
}
