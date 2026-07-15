import { describe, expect, it } from "vitest";
import { nullsToUndefined, stripKeys, userPk } from "../src/dynamo";

describe("userPk", () => {
  it("prefixes with the tenant", () => {
    expect(userPk("a@x.com", "APP#123")).toBe("USER#a@x.com#APP#123");
    expect(userPk("a@x.com", "RESUME")).toBe("USER#a@x.com#RESUME");
  });
});

describe("stripKeys", () => {
  it("removes every key attribute and keeps domain fields", () => {
    const item = {
      pk: "USER#a@x.com#APP#1",
      sk: "#META",
      gsi1pk: "USER#a@x.com#APPLIST",
      gsi1sk: "SAVED#2026-01-01",
      gsi2pk: "USER#a@x.com#FOLLOWUP",
      gsi2sk: "2026-01-05",
      id: "1",
      company: "Acme",
    };
    expect(stripKeys<Record<string, unknown>>(item)).toEqual({
      id: "1",
      company: "Acme",
    });
  });
});

describe("nullsToUndefined", () => {
  it("converts null to undefined so merges clear fields", () => {
    const out = nullsToUndefined({ a: null, b: "keep", c: 0 } as Record<
      string,
      unknown
    >);
    expect(out.a).toBeUndefined();
    expect("a" in out).toBe(true); // present, so spread overrides the current value
    expect(out.b).toBe("keep");
    expect(out.c).toBe(0);
  });

  it("leaves absent keys absent (partial patch keeps current values)", () => {
    const out = nullsToUndefined({ b: "x" } as Record<string, unknown>);
    expect("a" in out).toBe(false);
  });
});
