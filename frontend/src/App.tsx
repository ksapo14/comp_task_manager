import { Component, lazy, Suspense, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AmbientLoader, PageSkeleton } from "./components/ui";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./store/auth";

const AuthPage = lazy(() => import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const CoursesPage = lazy(() => import("./pages/CoursesPage").then((module) => ({ default: module.CoursesPage })));
const HabitsPage = lazy(() => import("./pages/HabitsPage").then((module) => ({ default: module.HabitsPage })));
const FocusPage = lazy(() => import("./pages/FocusPage").then((module) => ({ default: module.FocusPage })));
const JournalPage = lazy(() => import("./pages/JournalPage").then((module) => ({ default: module.JournalPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Compass failed to render a workspace route.", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="initial-load-stage grid min-h-screen place-items-center px-6">
          <section className="glass-panel w-full max-w-md rounded-3xl border bg-white/80 p-7 text-center shadow-soft dark:bg-zinc-900/80">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
              Workspace recovery
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              This view could not start.
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Reload to fetch a fresh application bundle and restore the workspace.
            </p>
            <button
              type="button"
              className="interactive-button relative mt-6 h-11 overflow-hidden rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
              onClick={() => window.location.reload()}
            >
              Reload workspace
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function ProtectedApp() {
  const user = useAuth((state) => state.user);
  if (!user) return <Navigate to="/auth" replace />;
  return <AppShell />;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const { user, initializing, restore, logout } = useAuth();

  useEffect(() => {
    void restore();
    const unauthorized = () => logout();
    window.addEventListener("compass:unauthorized", unauthorized);
    return () => window.removeEventListener("compass:unauthorized", unauthorized);
  }, [restore, logout]);

  if (initializing) {
    return (
      <div className="initial-load-stage grid min-h-screen place-items-center overflow-hidden">
        <span className="initial-load-aurora" aria-hidden="true" />
        <AmbientLoader />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Suspense fallback={<div className="min-h-screen px-5 py-16 lg:ml-64 lg:px-10"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route element={<ProtectedApp />}>
            <Route index element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/focus" element={<FocusPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route
              path="/settings"
              element={<SettingsPage theme={theme} setTheme={setTheme} />}
            />
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}
