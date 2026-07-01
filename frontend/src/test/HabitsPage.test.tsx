import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { format } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HabitsPage } from "../pages/HabitsPage";
import type { Habit } from "../types";

const habit: Habit = {
  id: "habit-1",
  user_id: "user-1",
  course_id: null,
  name: "Review notes",
  color: "#0f766e",
  completion_history: [],
  created_at: "2026-07-01T12:00:00Z",
};

describe("HabitsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a habit check immediately and persists it", async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/habits?days=7")) {
        return new Response(JSON.stringify([habit]), { status: 200 });
      }
      if (url.endsWith("/api/courses")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith("/api/habits/habit-1/toggle") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ ...habit, completion_history: [today] }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HabitsPage />);

    const toggle = await screen.findByRole("button", {
      name: `Complete Review notes on ${today}`,
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: `Clear Review notes on ${today}` }),
      ).toBeInTheDocument();
    });
  });
});
