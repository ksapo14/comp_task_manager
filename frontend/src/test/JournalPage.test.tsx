import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalPage } from "../pages/JournalPage";

describe("JournalPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an entry linked from a spike", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/courses")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith("/api/journals")) {
        return new Response(JSON.stringify([{
          id: "journal-1",
          user_id: "user-1",
          course_id: null,
          title: "Spike: Parser API",
          content_markdown: "## Findings",
          created_at: "2026-07-01T12:00:00Z",
          updated_at: "2026-07-01T12:00:00Z",
        }]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(
      <MemoryRouter initialEntries={["/journal?entry=journal-1"]}>
        <JournalPage />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("Spike: Parser API")).toBeInTheDocument();
    expect(screen.getByDisplayValue("## Findings")).toBeInTheDocument();
  });
});
