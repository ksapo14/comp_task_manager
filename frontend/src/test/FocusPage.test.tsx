import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FocusPage } from "../pages/FocusPage";

describe("FocusPage", () => {
  afterEach(() => {
    window.localStorage.removeItem("compass:focus-duration");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockFocusData({
    tasksOk = true,
    linksOk = true,
  }: {
    tasksOk?: boolean;
    linksOk?: boolean;
  } = {}) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/tasks?completed=false")) {
        return new Response(JSON.stringify(tasksOk ? [] : { detail: "Tasks unavailable" }), {
          status: tasksOk ? 200 : 503,
        });
      }
      if (url.endsWith("/api/focus-links")) {
        return new Response(JSON.stringify(linksOk ? [] : { detail: "Links unavailable" }), {
          status: linksOk ? 200 : 503,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
  }

  it("accepts and remembers an arbitrary focus duration", async () => {
    window.localStorage.removeItem("compass:focus-duration");
    mockFocusData();

    render(
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Custom focus minutes"), {
      target: { value: "37" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set time" }));

    expect(screen.getByText("37:00")).toBeInTheDocument();
    expect(window.localStorage.getItem("compass:focus-duration")).toBe("37");
  });

  it("renders at the document level so route transforms cannot collapse it", () => {
    mockFocusData();

    render(
      <div className="route-content">
        <MemoryRouter>
          <FocusPage />
        </MemoryRouter>
      </div>,
    );

    const focusStage = screen.getByText("One session. One outcome.").closest(".focus-stage");
    expect(focusStage?.parentElement).toBe(document.body);
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("keeps the timer available when focus data cannot load", async () => {
    mockFocusData({ tasksOk: false });

    render(
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/tasks could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("starts without Web Audio support", () => {
    mockFocusData();
    vi.stubGlobal("AudioContext", undefined);

    render(
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Stay with the problem.")).toBeInTheDocument();
  });

  it("uses a safe duration when browser storage is unavailable", () => {
    mockFocusData();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    render(
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("25:00")).toBeInTheDocument();
  });
});
