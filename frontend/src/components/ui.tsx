import { useEffect } from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function Button({
  className = "",
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-950",
    secondary:
      "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
    ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <button
      className={`interactive-button relative inline-flex h-10 items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      <span className="button-content relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`motion-input h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400 ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
  enterIndex,
}: {
  children: ReactNode;
  className?: string;
  enterIndex?: number;
}) {
  return (
    <section
      style={
        enterIndex === undefined
          ? undefined
          : ({ "--enter-delay": `${enterIndex * 70}ms` } as CSSProperties)
      }
      className={`surface-card rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-soft dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </section>
  );
}

export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span role="status" aria-label="Working" className={`activity-orb ${className}`}>
      <span />
      <span />
      <span />
    </span>
  );
}

export function AmbientLoader({
  label = "Preparing your workspace",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`ambient-loader flex flex-col items-center gap-5 ${className}`}
    >
      <span className="ambient-loader-orbit" aria-hidden="true">
        <span className="ambient-loader-core" />
        <span className="ambient-loader-satellite" />
      </span>
      <span className="shimmer-text text-xs font-semibold uppercase tracking-[0.22em]">
        {label}
      </span>
    </div>
  );
}

export function LiveStatus({
  label,
  tone = "teal",
}: {
  label: string;
  tone?: "teal" | "amber" | "rose";
}) {
  return (
    <span className={`live-status live-status-${tone}`}>
      <span
        aria-hidden="true"
        className="live-status-dot"
      />
      {label}
    </span>
  );
}

export function Stagger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`stagger-children ${className}`}>
      {children}
    </div>
  );
}

export function ProgressRing({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <span
      className="progress-ring"
      style={{ "--progress": `${safeValue * 3.6}deg` } as CSSProperties}
      role="img"
      aria-label={`${label}: ${Math.round(safeValue)}%`}
    >
      <span>
        <strong>{Math.round(safeValue)}%</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}

export function ActivityPulse({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`activity-pulse ${className}`}>
      <span />
      <span />
      <span />
    </span>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-page-in space-y-7" role="status" aria-label="Loading page">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>
      <div className="stagger-children grid gap-5 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-2xl border bg-white p-5 dark:bg-zinc-900">
            <Skeleton className="mb-5 h-5 w-36" />
            <Skeleton className="mb-3 h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailModal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-950/65 px-4 py-16 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-panel glass-panel w-full max-w-2xl rounded-3xl border border-white/40 bg-white/90 p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900/90"
      >
        <div className="mb-6 flex items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xl text-zinc-400 transition hover:rotate-90 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header-motion mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="relative">
        <span className="page-header-glow" aria-hidden="true" />
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-zinc-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state-motion relative flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-200 px-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
      <span className="empty-state-orb" aria-hidden="true" />
      <span className="relative">{children}</span>
    </div>
  );
}
