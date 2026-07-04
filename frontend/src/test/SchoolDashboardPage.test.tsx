import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlashcardDeck } from "../components/school/FlashcardDeck";
import { FocusMatrix } from "../components/school/FocusMatrix";
import {
  semesterProgress,
  SyllabusTimeline,
} from "../components/school/SyllabusTimeline";
import type { FocusMatrixPayload, FlashcardDeckPayload } from "../components/school/schoolApi";
import { SchoolDashboardPage } from "../pages/SchoolDashboardPage";
import { SchoolModulePage } from "../pages/SchoolModulePage";

interface TimelinePayload {
  semester_start: string | null;
  semester_end: string | null;
  milestones: Array<{
    id: string;
    title: string;
    course: string;
    kind: "Exam" | "Project" | "Deadline";
    date: string;
    detail: string;
  }>;
}

let flashcards: FlashcardDeckPayload;
let focus: FocusMatrixPayload;
let timeline: TimelinePayload;

describe("SchoolDashboardPage", () => {
  beforeEach(() => {
    flashcards = { cards: [], mastered_count: 0, review_count: 0 };
    focus = { tasks: [] };
    timeline = { semester_start: null, semester_end: null, milestones: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/school-workspace/flashcards")) {
          if (method === "PUT") flashcards = JSON.parse(String(init?.body));
          return new Response(JSON.stringify(flashcards), { status: 200 });
        }
        if (url.endsWith("/api/school-workspace/focus")) {
          if (method === "PUT") focus = JSON.parse(String(init?.body));
          return new Response(JSON.stringify(focus), { status: 200 });
        }
        if (url.endsWith("/api/school-workspace/timeline")) {
          if (method === "PUT") timeline = JSON.parse(String(init?.body));
          return new Response(JSON.stringify(timeline), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the timeline, focus matrix, and flashcard studio together", () => {
    render(
      <MemoryRouter>
        <SchoolDashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "School command center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interactive syllabus timeline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pomodoro focus matrix" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tactile flashcards" })).toBeInTheDocument();
  });

  it("does not seed demo content into an empty workspace", async () => {
    render(
      <MemoryRouter>
        <SchoolDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No syllabus timeline yet")).toBeInTheDocument();
    expect(screen.getByText("No flashcards yet")).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("creates and edits a persisted syllabus timeline", async () => {
    render(<SyllabusTimeline onLaunchFocus={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Set up timeline" }));
    fireEvent.change(screen.getByLabelText("Semester start"), {
      target: { value: "2026-08-20" },
    });
    fireEvent.change(screen.getByLabelText("Semester end"), {
      target: { value: "2026-12-15" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Biology midterm" },
    });
    fireEvent.change(screen.getByLabelText("Class"), {
      target: { value: "Biology" },
    });
    fireEvent.change(screen.getByLabelText("Due date and time"), {
      target: { value: "2026-10-10T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
    fireEvent.click(screen.getByRole("button", { name: "Save timeline" }));

    expect(
      await screen.findByRole("button", { name: /Biology midterm, October 10/ }),
    ).toBeInTheDocument();
    expect(timeline.milestones[0].course).toBe("Biology");

    fireEvent.click(screen.getByRole("button", { name: "Edit timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Biology midterm" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Biology final review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update milestone" }));
    fireEvent.click(screen.getByRole("button", { name: "Save timeline" }));

    expect(
      await screen.findByRole("button", { name: /Biology final review/ }),
    ).toBeInTheDocument();
  });

  it("launches a milestone directly into the focus matrix", async () => {
    timeline = {
      semester_start: "2026-01-01T12:00:00.000Z",
      semester_end: "2026-12-31T12:00:00.000Z",
      milestones: [
        {
          id: "user-milestone",
          title: "Graph Theory Exam",
          course: "Algorithms",
          kind: "Exam",
          date: "2026-10-01T12:00:00.000Z",
          detail: "Graph traversal and shortest paths.",
        },
      ],
    };
    render(
      <MemoryRouter>
        <SchoolDashboardPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Launch focus block" }));

    expect(await screen.findByDisplayValue("Graph Theory Exam")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "In progress tasks" })).getByText(
        "Graph Theory Exam",
      ),
    ).toBeInTheDocument();
  });

  it("activates the ambient focus state when the timer starts", () => {
    const { container } = render(
      <MemoryRouter>
        <SchoolDashboardPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start focus timer" }));

    expect(container.querySelector(".school-dashboard")).toHaveClass("is-focus-mode");
    expect(screen.getByText("Focus field active")).toBeInTheDocument();
  });

  it("creates, edits, flips, and deletes flashcards", async () => {
    render(<FlashcardDeck />);

    fireEvent.click(await screen.findByRole("button", { name: "New card" }));
    fireEvent.change(screen.getByLabelText("Class"), {
      target: { value: "Chemistry" },
    });
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "What is molarity?" },
    });
    fireEvent.change(screen.getByLabelText("Answer"), {
      target: { value: "Moles of solute per liter of solution." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create card" }));

    const activeCard = await screen.findByRole("button", {
      name: "Question: What is molarity?",
    });
    fireEvent.keyDown(activeCard, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Answer: What is molarity?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit What is molarity?" }));
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "Define molarity." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Define molarity.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Define molarity." }));
    expect(await screen.findByText("No flashcards yet")).toBeInTheDocument();
    expect(flashcards.cards).toEqual([]);
  });

  it("persists flashcard scoring through the school workspace API", async () => {
    flashcards.cards = [
      {
        id: "user-card",
        course: "Physics",
        question: "What is momentum?",
        answer: "Mass times velocity.",
      },
    ];
    render(<FlashcardDeck />);

    fireEvent.click(await screen.findByRole("button", { name: "Mastered" }));

    await waitFor(() => expect(flashcards.mastered_count).toBe(1));
  });

  it("removes a task when it is completed", async () => {
    focus.tasks = [
      {
        id: "user-task",
        title: "Finish lab report",
        course: "Physics",
        status: "todo",
      },
    ];
    const transferData = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => transferData.set(type, value),
      getData: (type: string) => transferData.get(type) ?? "",
    } as unknown as DataTransfer;

    const { container } = render(
      <FocusMatrix focusRequest={null} onFocusStateChange={() => undefined} />,
    );
    const task = (await within(
      screen.getByRole("region", { name: "To do tasks" }),
    ).findByText("Finish lab report")).closest("article");
    const completed = screen.getByRole("region", { name: "Completed tasks" });

    fireEvent.dragStart(task!, { dataTransfer });
    fireEvent.dragOver(completed, { dataTransfer });
    fireEvent.drop(completed, { dataTransfer });

    expect(screen.queryByText("Finish lab report")).not.toBeInTheDocument();
    expect(container.querySelector(".success-burst")).toBeInTheDocument();
    await waitFor(() => expect(focus.tasks).toEqual([]));
  });

  it("keeps edited Pomodoro minutes and seconds out of cloud persistence", async () => {
    render(<FocusMatrix focusRequest={null} onFocusStateChange={() => undefined} />);

    const minutes = screen.getByRole("spinbutton", { name: "Pomodoro minutes" });
    await waitFor(() => expect(minutes).toHaveAttribute("aria-valuenow", "25"));
    minutes.textContent = "37";
    fireEvent.blur(minutes);

    expect(minutes.parentElement).toHaveTextContent("37:00");

    const seconds = screen.getByRole("spinbutton", { name: "Pomodoro seconds" });
    seconds.textContent = "42";
    fireEvent.blur(seconds);

    expect(seconds.parentElement).toHaveTextContent("37:42");
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
    expect(screen.queryByText("Custom minutes")).not.toBeInTheDocument();
  });

  it("calculates timeline progress against exact semester coordinates", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-05-01T00:00:00Z");
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);

    expect(semesterProgress(start, end, midpoint)).toBe(0.5);
    expect(semesterProgress(start, end, new Date("2025-01-01T00:00:00Z"))).toBe(0);
    expect(semesterProgress(start, end, new Date("2027-01-01T00:00:00Z"))).toBe(1);
  });

  it("renders each school module on an independent route", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/school/flashcards"]}>
        <Routes>
          <Route path="/dashboard/school/:module" element={<SchoolModulePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tactile flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Focus matrix" })).toHaveAttribute(
      "href",
      "/dashboard/school/focus",
    );
  });
});
