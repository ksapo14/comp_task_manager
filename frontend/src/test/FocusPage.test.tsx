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

  it("edits and remembers minutes and seconds directly on the clock", async () => {
    window.localStorage.removeItem("compass:focus-duration");
    mockFocusData();

    render(
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>,
    );

    const minutes = screen.getByRole("spinbutton", { name: "Deep work minutes" });
    minutes.textContent = "37";
    fireEvent.blur(minutes);

    expect(minutes.parentElement).toHaveTextContent("37:00");
    expect(window.localStorage.getItem("compass:focus-duration")).toBe("37");

    const seconds = screen.getByRole("spinbutton", { name: "Deep work seconds" });
    seconds.textContent = "42";
    fireEvent.blur(seconds);

    expect(seconds.parentElement).toHaveTextContent("37:42");
    expect(window.localStorage.getItem("compass:focus-duration")).toBe("37.7");
    expect(screen.queryByText("Custom minutes")).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("spinbutton", { name: "Deep work minutes" }).parentElement,
    ).toHaveTextContent("25:00");
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
    expect(screen.getByText("Stay with the problem.").closest(".focus-stage"))
      .toHaveClass("is-running");
    expect(screen.getByRole("spinbutton", { name: "Deep work seconds" }))
      .toHaveAttribute("aria-disabled", "true");
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

    expect(
      screen.getByRole("spinbutton", { name: "Deep work minutes" }).parentElement,
    ).toHaveTextContent("25:00");
  });
});
