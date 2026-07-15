import { afterEach, describe, expect, it } from "vitest";
import { isAllowedEmail } from "../src/api/auth";

const ORIGINAL = process.env.ALLOWED_EMAILS;

afterEach(() => {
  process.env.ALLOWED_EMAILS = ORIGINAL;
});

describe("isAllowedEmail", () => {
  it("matches entries case-insensitively and ignores whitespace", () => {
    process.env.ALLOWED_EMAILS = " Owner@X.com , second@y.com ";
    expect(isAllowedEmail("owner@x.com")).toBe(true);
    expect(isAllowedEmail("OWNER@X.COM")).toBe(true);
    expect(isAllowedEmail("second@y.com")).toBe(true);
  });

  it("rejects emails not on the list", () => {
    process.env.ALLOWED_EMAILS = "owner@x.com";
    expect(isAllowedEmail("attacker@evil.com")).toBe(false);
    expect(isAllowedEmail("owner@x.com.evil.com")).toBe(false);
  });

  it("rejects everything when the list is empty or unset", () => {
    process.env.ALLOWED_EMAILS = "";
    expect(isAllowedEmail("owner@x.com")).toBe(false);
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("owner@x.com")).toBe(false);
  });

  it("rejects non-string payloads (JWT tampering)", () => {
    process.env.ALLOWED_EMAILS = "owner@x.com";
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail(["owner@x.com"])).toBe(false);
  });
});
