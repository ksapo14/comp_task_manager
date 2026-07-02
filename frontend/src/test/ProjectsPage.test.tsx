import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "../pages/ProjectsPage";
import type { Milestone, Project, Task } from "../types";

const project: Project = {
  id: "project-1",
  user_id: "user-1",
  name: "Compiler Lab",
  created_at: "2026-07-01T12:00:00Z",
};

const milestone: Milestone = {
  id: "milestone-1",
  user_id: "user-1",
  project_id: project.id,
  name: "Lexer",
  target_date: "2026-07-15",
  created_at: "2026-07-01T12:00:00Z",
};

const parserMilestone: Milestone = {
  ...milestone,
  id: "milestone-2",
  name: "Parser",
  target_date: "2026-07-25",
};

const task: Task = {
  id: "task-1",
  user_id: "user-1",
  course_id: null,
  project_id: project.id,
  milestone_id: milestone.id,
  blocked_by_task_ids: ["task-2"],
  task_type: "spike",
  spike_journal_id: "journal-1",
  is_blocked: true,
  title: "Research token rules",
  description: "",
  duration_minutes: 45,
  priority: "medium",
  due_date: null,
  scheduled_start_time: null,
  is_completed: false,
  is_routine: false,
  created_at: "2026-07-01T12:00:00Z",
};

describe("ProjectsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders and reorders dated milestone nodes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/projects")) {
        return new Response(JSON.stringify([project]), { status: 200 });
      }
      if (url.endsWith("/api/milestones") && !init?.method) {
        return new Response(
          JSON.stringify([milestone, parserMilestone]),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/milestones/reorder") && init?.method === "POST") {
        return new Response(JSON.stringify([
          { ...parserMilestone, target_date: milestone.target_date },
          { ...milestone, target_date: parserMilestone.target_date },
        ]), { status: 200 });
      }
      if (url.endsWith("/api/tasks")) {
        return new Response(JSON.stringify([task]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Compiler Lab")).toBeInTheDocument();
    expect(screen.getByText("Lexer")).toBeInTheDocument();
    expect(screen.getByText("Research token rules")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByLabelText("Lexer target date")).toHaveValue("2026-07-15");
    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute(
      "href",
      "/journal?entry=journal-1",
    );
    expect(
      screen.getByRole("link", { name: "Open Compiler Lab in a new window" }),
    ).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "Collapse Compiler Lab" }));
    expect(screen.queryByText("Research token rules")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Compiler Lab" }));

    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
    };
    fireEvent.dragStart(screen.getByRole("article", { name: "Lexer" }), {
      dataTransfer,
    });
    fireEvent.dragOver(screen.getByRole("article", { name: "Parser" }), {
      clientY: 10,
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole("article", { name: "Parser" }), {
      clientY: 10,
      dataTransfer,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/milestones/reorder",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
