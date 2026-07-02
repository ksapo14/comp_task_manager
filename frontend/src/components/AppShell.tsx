import {
  BookOpen,
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  CircleGauge,
  Clock3,
  GraduationCap,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../store/auth";
import { LiveStatus } from "./ui";

const navItems = [
  { to: "/", label: "Overview", icon: CircleGauge, end: true },
  { to: "/tasks", label: "Tasks", icon: CheckSquare2 },
  { to: "/projects", label: "Projects", icon: PanelsTopLeft },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/courses", label: "Courses", icon: GraduationCap },
  { to: "/habits", label: "Habits", icon: Sparkles },
  { to: "/focus", label: "Deep work", icon: Clock3 },
  { to: "/journal", label: "Journal", icon: BookOpen },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem("compass:sidebar-collapsed") === "true",
  );
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = useMemo(
    () =>
      navItems.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
      )?.label ?? "Settings",
    [location.pathname],
  );

  useEffect(() => {
    let frame = 0;
    const updateAmbientPosition = (event: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
        document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
      });
    };
    window.addEventListener("pointermove", updateAmbientPosition, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updateAmbientPosition);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("compass:sidebar-collapsed", String(next));
      return next;
    });
  }

  function transitionTo(event: ReactMouseEvent<HTMLAnchorElement>, destination: string) {
    setOpen(false);
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || destination === location.pathname
    ) {
      return;
    }
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => void;
    };
    if (!transitionDocument.startViewTransition) return;
    event.preventDefault();
    transitionDocument.startViewTransition(() => navigate(destination));
  }

  return (
    <div className="workspace-shell min-h-screen" data-route={activeSection.toLowerCase()}>
      <div className="ambient-canvas" aria-hidden="true">
        <span className="ambient-blob ambient-blob-one" />
        <span className="ambient-blob ambient-blob-two" />
        <span className="ambient-pointer" />
        <span className="ambient-grid" />
      </div>
      <button
        className="interactive-button glass-panel fixed left-4 top-4 z-50 rounded-xl border bg-white/80 p-2.5 shadow-soft dark:bg-zinc-900/80 lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-label="Toggle navigation"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`workspace-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/50 bg-white/72 px-4 py-5 backdrop-blur-2xl transition-[width,transform] duration-300 dark:border-white/5 dark:bg-zinc-950/72 lg:translate-x-0 ${
          collapsed ? "lg:w-20" : "lg:w-64"
        } ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-7 z-10 hidden h-7 w-7 place-items-center rounded-full border bg-white text-zinc-500 shadow-sm transition hover:scale-110 hover:text-zinc-950 dark:bg-zinc-900 dark:hover:text-white lg:grid"
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
        <div className={`mb-8 flex h-10 items-center gap-3 px-2 ${collapsed ? "lg:justify-center" : ""}`}>
          <div className="brand-mark animate-pop-in grid h-9 w-9 place-items-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
            <span className="brand-mark-aura" aria-hidden="true" />
            <ChevronRight size={19} strokeWidth={2.5} />
          </div>
          <div className={collapsed ? "lg:sr-only" : ""}>
            <p className="font-semibold tracking-tight">Compass</p>
            <p className="text-[11px] text-zinc-400">Student workspace</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={(event) => transitionTo(event, to)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `nav-item-motion relative flex h-10 items-center gap-3 overflow-hidden rounded-xl px-3 text-sm transition ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                } ${
                  isActive
                    ? "is-active bg-zinc-100/90 font-medium text-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,.5)] dark:bg-zinc-800/90 dark:text-white"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-white"
                }`
              }
            >
              <span className="nav-active-glow" aria-hidden="true" />
              <Icon size={17} className="shrink-0" />
              <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t pt-4">
          <NavLink
            to="/settings"
            onClick={(event) => transitionTo(event, "/settings")}
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              `mb-3 flex h-10 items-center gap-3 rounded-xl px-3 text-sm ${
                collapsed ? "lg:justify-center lg:px-0" : ""
              } ${
                isActive ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500"
              }`
            }
          >
            <Settings size={17} className="shrink-0" />
            <span className={collapsed ? "lg:sr-only" : ""}>Settings</span>
          </NavLink>
          <div className={`user-panel flex items-center gap-3 rounded-xl border border-white/60 bg-white/55 p-3 shadow-sm backdrop-blur dark:border-white/5 dark:bg-zinc-900/60 ${
            collapsed ? "lg:flex-col lg:bg-transparent lg:p-1 dark:lg:bg-transparent" : ""
          }`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              {user?.email.slice(0, 2).toUpperCase()}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? "lg:sr-only" : ""}`}>
              <p className="truncate text-xs font-medium">{user?.email}</p>
              <p className="text-[10px] text-zinc-400">Student</p>
            </div>
            <button onClick={logout} aria-label="Log out" className="text-zinc-400 hover:text-red-500">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main
        key={location.pathname}
        className={`route-stage min-h-screen px-5 pb-16 pt-20 transition-[margin] duration-300 lg:px-10 lg:pt-8 ${
          collapsed ? "lg:ml-20" : "lg:ml-64"
        }`}
      >
        <div className="workspace-meta mx-auto mb-8 hidden max-w-7xl items-center justify-between lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Workspace / <span className="text-zinc-600 dark:text-zinc-300">{activeSection}</span>
          </p>
          <LiveStatus label="Workspace live" />
        </div>
        <div className="route-content mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
