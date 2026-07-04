import { ArrowLeft, BookMarked, Layers3, TimerReset } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { FlashcardDeck } from "../components/school/FlashcardDeck";
import { FocusMatrix } from "../components/school/FocusMatrix";
import { SyllabusTimeline } from "../components/school/SyllabusTimeline";
import type { FocusRequest } from "../components/school/types";

const modules = [
  { id: "timeline", label: "Timeline", icon: Layers3 },
  { id: "focus", label: "Focus matrix", icon: TimerReset },
  { id: "flashcards", label: "Flashcards", icon: BookMarked },
] as const;

type SchoolModule = (typeof modules)[number]["id"];

export function SchoolModulePage() {
  const { module } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [focusActive, setFocusActive] = useState(false);
  const focusRequest = useMemo<FocusRequest | null>(() => {
    const task = searchParams.get("task");
    if (module !== "focus" || !task) return null;
    return {
      id: Date.now(),
      title: task,
      course: searchParams.get("course") || "Independent",
    };
  }, [module, searchParams]);

  if (!modules.some((item) => item.id === module)) {
    return <Navigate to="/dashboard/school" replace />;
  }

  const activeModule = module as SchoolModule;

  return (
    <div className={`school-dashboard school-module-page ${focusActive ? "is-focus-mode" : ""}`}>
      <header className="school-entrance school-entrance-header mb-6">
        <Link
          to="/dashboard/school"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:-translate-x-1 hover:text-zinc-950 dark:hover:text-white"
        >
          <ArrowLeft size={14} />
          School command center
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="school-kicker">Independent workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {modules.find((item) => item.id === activeModule)?.label}
            </h1>
          </div>
          <nav className="school-module-tabs" aria-label="School workspace modules">
            {modules.map(({ id, label, icon: Icon }) => (
              <Link key={id} to={`/dashboard/school/${id}`} className={id === activeModule ? "is-active" : ""}>
                <Icon size={13} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="school-entrance school-entrance-timeline">
        {activeModule === "timeline" && (
          <SyllabusTimeline
            autoEdit={searchParams.get("edit") === "1"}
            initialCourse={searchParams.get("course") ?? ""}
            onLaunchFocus={(milestone) =>
              navigate(
                `/dashboard/school/focus?task=${encodeURIComponent(milestone.title)}&course=${encodeURIComponent(milestone.course)}`,
              )
            }
          />
        )}
        {activeModule === "focus" && (
          <FocusMatrix
            focusRequest={focusRequest}
            onFocusStateChange={setFocusActive}
          />
        )}
        {activeModule === "flashcards" && (
          <div className="mx-auto max-w-2xl">
            <FlashcardDeck />
          </div>
        )}
      </div>
    </div>
  );
}
