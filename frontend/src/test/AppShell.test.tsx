import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "../components/AppShell";
import { useAuth } from "../store/auth";

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
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
  });

  it("persists compact sidebar mode", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(localStorage.getItem("compass:sidebar-collapsed")).toBe("true");
  });
});
