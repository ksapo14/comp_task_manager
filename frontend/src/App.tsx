import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { PageSkeleton } from "./components/ui";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./store/auth";

const AuthPage = lazy(() => import("./pages/AuthPage").then((module) => ({ default: module.AuthPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const CoursesPage = lazy(() => import("./pages/CoursesPage").then((module) => ({ default: module.CoursesPage })));
const HabitsPage = lazy(() => import("./pages/HabitsPage").then((module) => ({ default: module.HabitsPage })));
const FocusPage = lazy(() => import("./pages/FocusPage").then((module) => ({ default: module.FocusPage })));
const JournalPage = lazy(() => import("./pages/JournalPage").then((module) => ({ default: module.JournalPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

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
      <div className="grid min-h-screen place-items-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-t-white" />
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen px-5 py-16 lg:ml-64 lg:px-10"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route element={<ProtectedApp />}>
          <Route index element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
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
  );
}
