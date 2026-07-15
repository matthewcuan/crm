import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, todayInTz } from "../src/dates";

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-07-08", 5)).toBe("2026-07-13");
  });

  it("rolls over month boundaries", () => {
    expect(addDays("2026-07-30", 5)).toBe("2026-08-04");
  });

  it("rolls over year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("supports negative days", () => {
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("todayInTz", () => {
  afterEach(() => vi.useRealTimers());

  it("formats as YYYY-MM-DD", () => {
    expect(todayInTz("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("respects the timezone across the midnight boundary", () => {
    vi.useFakeTimers();
    // 05:00 UTC = 22:00 the previous day in Los Angeles (PDT)
    vi.setSystemTime(new Date("2026-07-15T05:00:00Z"));
    expect(todayInTz("UTC")).toBe("2026-07-15");
    expect(todayInTz("America/Los_Angeles")).toBe("2026-07-14");
  });
});
