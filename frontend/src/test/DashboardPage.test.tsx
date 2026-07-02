import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardPage, greetingForHour } from "../pages/DashboardPage";
import { useAuth } from "../store/auth";

describe("greetingForHour", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses morning, afternoon, and night ranges", () => {
    expect(greetingForHour(5)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
    expect(greetingForHour(18)).toBe("Good night");
    expect(greetingForHour(4)).toBe("Good night");
  });

  it("turns high-priority workload into an ambient attention signal", async () => {
    useAuth.setState({
      user: {
        id: "user-1",
        email: "student@example.com",
        preferred_start_time: "08:00:00",
        preferred_end_time: "22:00:00",
        created_at: "2026-07-01T12:00:00Z",
      },
      initializing: false,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tasks")) {
        return new Response(JSON.stringify([
          { id: "1", priority: "high", due_date: null },
          { id: "2", priority: "high", due_date: null },
          { id: "3", priority: "high", due_date: null },
        ]), { status: 200 });
      }
      if (url.includes("/api/habits") || url.includes("/api/calendar/blocks")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/3 high-priority tasks are competing/)).toBeInTheDocument();
    expect(screen.getByText("Compass signal")).toBeInTheDocument();
  });
});
