import { ArrowRight, Braces, CalendarCheck2, TimerReset } from "lucide-react";
import { FormEvent, useState } from "react";

import { ActivityPulse, Button, Input, LiveStatus } from "../components/ui";
import { useAuth } from "../store/auth";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await (mode === "login" ? login(email, password) : signup(email, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to continue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-stage grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_.95fr]">
      <section className="auth-story relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col">
        <div className="auth-mesh" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <div className="brand-mark grid h-10 w-10 place-items-center rounded-xl bg-white text-zinc-950">
            <span className="brand-mark-aura" aria-hidden="true" />
            <ArrowRight size={19} />
          </div>
          <span className="text-lg font-semibold">Compass</span>
        </div>
        <div className="my-auto max-w-xl">
          <LiveStatus label="Built for deep thinkers" />
          <h1 className="auth-headline mt-5 text-5xl font-medium leading-[1.08] tracking-tight">
            Less context switching.
            <br />
            <span>More meaningful work.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">
            Courses, tasks, focus sessions, and technical notes—organized around the way
            computer science students actually work.
          </p>
          <div className="stagger-children mt-12 grid grid-cols-3 gap-3">
            {[
              [CalendarCheck2, "Smart scheduling"],
              [TimerReset, "Deep work"],
              [Braces, "Developer journal"],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof CalendarCheck2;
              return (
                <div
                  key={label as string}
                  className="auth-feature rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <FeatureIcon className="mb-6 text-teal-300" size={20} />
                  <p className="text-xs text-zinc-300">{label as string}</p>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-zinc-600">A quiet system for ambitious work.</p>
      </section>
      <section className="auth-form-stage relative grid place-items-center px-6 py-12">
        <span className="auth-form-glow" aria-hidden="true" />
        <form onSubmit={submit} className="auth-form relative w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <p className="text-xl font-semibold">Compass</p>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            {mode === "login" ? "Welcome back" : "Start your workspace"}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            {mode === "login" ? "Sign in to focus." : "Create your account."}
          </h2>
          <p className="mb-8 mt-2 text-sm text-zinc-500">
            {mode === "login"
              ? "Your plans and progress are waiting."
              : "One place for your academic operating system."}
          </p>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@university.edu"
          />
          <label className="field-label mt-5" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          <Button className="mt-6 w-full" disabled={loading}>
            {loading && <ActivityPulse />}
            {loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
            {!loading && <ArrowRight size={16} />}
          </Button>
          <p className="mt-6 text-center text-sm text-zinc-500">
            {mode === "login" ? "New to Compass?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-white"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
