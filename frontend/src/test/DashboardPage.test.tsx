import { describe, expect, it } from "vitest";

import { greetingForHour } from "../pages/DashboardPage";

describe("greetingForHour", () => {
  it("uses morning, afternoon, and night ranges", () => {
    expect(greetingForHour(5)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
    expect(greetingForHour(18)).toBe("Good night");
    expect(greetingForHour(4)).toBe("Good night");
  });
});
