import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "../pages/CalendarPage";
import type { Task } from "../types";

const blockedTask: Task = {
  id: "task-1",
  user_id: "user-1",
  course_id: null,
  project_id: null,
  milestone_id: null,
  blocked_by_task_ids: ["task-2"],
  task_type: "standard",
  spike_journal_id: null,
  is_blocked: true,
  title: "Blocked task",
  description: "",
  duration_minutes: 45,
  priority: "medium",
  due_date: null,
  scheduled_start_time: null,
  is_completed: false,
  is_routine: false,
  created_at: "2026-07-01T12:00:00Z",
};

describe("CalendarPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps blocked backlog tasks visible but unschedulable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar/blocks?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith("/api/tasks?completed=false")) {
        return new Response(JSON.stringify([blockedTask]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<CalendarPage />);

    const backlogTask = await screen.findByRole("button", { name: /Blocked task/ });
    expect(backlogTask).toBeDisabled();
    expect(screen.getByText("Blocked by prerequisite")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule backlog (0)" })).toBeDisabled();
  });

  it("positions blocks by hour and duration in week and day grids", async () => {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(90);
    const block = {
      id: "block-1",
      title: "Design review",
      kind: "external",
      start: start.toISOString(),
      end: end.toISOString(),
      color: "#8b5cf6",
      locked: true,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar/blocks?")) {
        return new Response(JSON.stringify([block]), { status: 200 });
      }
      if (url.endsWith("/api/tasks?completed=false")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<CalendarPage />);

    const weekGrid = await screen.findByLabelText("Week hourly calendar");
    expect(weekGrid).toBeInTheDocument();
    const weekEvent = screen.getByRole("button", { name: /Design review/ });
    expect(weekEvent).toHaveStyle({ top: "640px", height: "96px" });

    fireEvent.click(screen.getByRole("button", { name: "Compress calendar" }));
    expect(weekEvent).toHaveStyle({ top: "560px", height: "84px" });

    fireEvent.click(screen.getByRole("button", { name: "Expand calendar" }));
    expect(weekEvent).toHaveStyle({ top: "640px", height: "96px" });

    fireEvent.click(screen.getByRole("button", { name: "day" }));

    expect(await screen.findByLabelText("Day hourly calendar")).toBeInTheDocument();
    const dayEvent = screen.getByRole("button", { name: /Design review/ });
    expect(dayEvent).toHaveStyle({ top: "640px", height: "96px" });
  });
});
