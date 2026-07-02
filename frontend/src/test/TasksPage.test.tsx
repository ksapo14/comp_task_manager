import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TasksPage } from "../pages/TasksPage";
import type { Task } from "../types";

const task: Task = {
  id: "task-1",
  user_id: "user-1",
  course_id: null,
  project_id: null,
  milestone_id: null,
  blocked_by_task_ids: [],
  task_type: "standard",
  spike_journal_id: null,
  is_blocked: false,
  title: "Original task",
  description: "Initial notes",
  duration_minutes: 45,
  priority: "medium",
  due_date: null,
  scheduled_start_time: null,
  is_completed: false,
  is_routine: false,
  created_at: "2026-07-01T12:00:00Z",
};

function taskFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.endsWith("/api/courses")
      || url.endsWith("/api/projects")
      || url.endsWith("/api/milestones")
    ) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.endsWith("/api/tasks") && !init?.method) {
      return new Response(JSON.stringify([task]), { status: 200 });
    }
    if (url.endsWith("/api/tasks/task-1") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Partial<Task>;
      return new Response(JSON.stringify({ ...task, ...body }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("TasksPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("edits a task in a modal", async () => {
    const fetchMock = taskFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<TasksPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Original task" }));
    fireEvent.change(screen.getByDisplayValue("Original task"), {
      target: { value: "Edited task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Edited task" })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows completion progress before moving a task", async () => {
    vi.stubGlobal("fetch", taskFetchMock());
    render(<TasksPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Complete Original task" }),
    );

    expect(screen.getByText("Completing…")).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.queryByText("Completing…")).not.toBeInTheDocument();
      },
      { timeout: 1200 },
    );
    expect(screen.getByText("Original task")).toHaveClass("line-through");
  });

  it("drags an unscheduled task into scheduling", async () => {
    vi.stubGlobal("fetch", taskFetchMock());
    render(<TasksPage />);
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };

    const taskCard = await screen.findByRole("article", { name: "Original task" });
    const scheduledColumn = screen.getByRole("region", { name: "Scheduled tasks" });
    fireEvent.dragStart(taskCard, { dataTransfer });
    fireEvent.dragOver(scheduledColumn, { dataTransfer });
    fireEvent.drop(scheduledColumn, { dataTransfer });

    expect(
      screen.getByRole("heading", { name: "Schedule Original task" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schedule task" }));

    await waitFor(() => {
      expect(
        within(scheduledColumn).getByRole("article", { name: "Original task" }),
      ).toBeInTheDocument();
    });
  });
});
