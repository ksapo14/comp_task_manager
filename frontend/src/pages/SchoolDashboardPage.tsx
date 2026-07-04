import { BookMarked, GraduationCap, Layers3, TimerReset } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { FlashcardDeck } from "../components/school/FlashcardDeck";
import { FocusMatrix } from "../components/school/FocusMatrix";
import { SyllabusTimeline } from "../components/school/SyllabusTimeline";
import type { FocusRequest, Milestone } from "../components/school/types";
import { LiveStatus } from "../components/ui";

export function SchoolDashboardPage() {
  const [focusActive, setFocusActive] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const requestId = useRef(0);
  const focusRegion = useRef<HTMLDivElement>(null);

  const launchFocus = useCallback((milestone: Milestone) => {
    requestId.current += 1;
    setFocusRequest({
      id: requestId.current,
      title: milestone.title,
      course: milestone.course,
    });
    window.requestAnimationFrame(() => {
      focusRegion.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      focusRegion.current?.focus({ preventScroll: true });
    });
  }, []);

  return (
    <div className={`school-dashboard ${focusActive ? "is-focus-mode" : ""}`}>
      <header className="school-entrance school-entrance-header mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="school-brand-mark">
              <GraduationCap size={19} />
            </span>
            <LiveStatus label="Academic workspace online" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            School command center
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Plan the semester, execute one outcome, and reinforce what you learned—all
            without leaving the workspace.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [Layers3, "Timeline", "/dashboard/school/timeline"],
            [TimerReset, "Focus", "/dashboard/school/focus"],
            [BookMarked, "Flashcards", "/dashboard/school/flashcards"],
          ].map(([Icon, label, to]) => {
            const MetricIcon = Icon as typeof Layers3;
            return (
              <Link key={label as string} to={to as string} className="school-header-metric">
                <MetricIcon size={14} />
                {label as string}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="school-entrance school-entrance-timeline school-dimmable">
        <SyllabusTimeline onLaunchFocus={launchFocus} />
      </div>

      <div className="mt-6 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(20rem,.75fr)]">
        <div
          ref={focusRegion}
          tabIndex={-1}
          className="school-entrance school-entrance-focus rounded-[2rem] outline-none"
        >
          <FocusMatrix
            focusRequest={focusRequest}
            onFocusStateChange={setFocusActive}
          />
        </div>
        <div className="school-entrance school-entrance-flashcards school-dimmable">
          <FlashcardDeck />
        </div>
      </div>
    </div>
  );
}
