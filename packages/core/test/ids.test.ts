import { describe, expect, it } from "vitest";
import { newId } from "../src/ids";

describe("newId", () => {
  it("produces 26-char Crockford base32 ULIDs", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("sorts chronologically across milliseconds", async () => {
    const first = newId();
    await new Promise((r) => setTimeout(r, 5));
    const second = newId();
    expect(first < second).toBe(true);
  });
});
