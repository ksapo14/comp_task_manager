import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, invalidateApiCache } from "../lib/api";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateApiCache();
  });

  it("preserves OAuth URL-encoded form bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const form = new URLSearchParams({
      username: "student@example.com",
      password: "secure-password",
    });

    await api("/oauth-form", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toBe(form);
    expect(new Headers(request.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("serializes plain objects as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api("/example", { method: "POST", body: { title: "Task" } });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toBe('{"title":"Task"}');
    expect(new Headers(request.headers).get("Content-Type")).toBe("application/json");
  });

  it("surfaces FastAPI validation messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [
              {
                type: "value_error",
                loc: ["body"],
                msg: "Value error, End time must be after start time",
              },
            ],
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(api("/auth/me", { method: "PATCH", body: {} })).rejects.toEqual(
      new ApiError("End time must be after start time", 422),
    );
  });

  it("reuses fresh GET results and invalidates only after related writes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "task-1" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-2" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "task-1" }, { id: "task-2" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await api("/tasks");
    await api("/tasks");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await api("/tasks", { method: "POST", body: { title: "New task" } });
    await api("/tasks");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
