// T031: the email and phone maskers (src/lib/scrub/email.ts, phone.ts; research R10).
import { describe, expect, it } from "vitest";

import { maskEmails } from "@/lib/scrub/email";
import { maskPhones } from "@/lib/scrub/phone";

describe("maskEmails", () => {
  it.each([
    ["Write to jane@example.com please", "Write to [EMAIL] please"],
    ["j.doe+mig@mail.co.uk", "[EMAIL]"],
    ["Hi, jane@example.com, 555-123-4567.", "Hi, [EMAIL], 555-123-4567."],
  ])("masks %j", (text, expected) => {
    expect(maskEmails(text)).toBe(expected);
  });

  it("leaves text without an email alone", () => {
    expect(maskEmails("Is Reyvow @ 100 mg ok?")).toBe("Is Reyvow @ 100 mg ok?");
  });
});

describe("maskPhones", () => {
  it.each([
    ["Call 555-123-4567.", "Call [PHONE]."],
    ["(555) 123 4567", "[PHONE]"],
    ["+44 20 7946 0958", "[PHONE]"],
    ["1-800-555-1234", "[PHONE]"],
    ["5551234567", "[PHONE]"],
    ["555.123.4567", "[PHONE]"],
    ["my number is 555-1234", "my number is [PHONE]"],
  ])("masks %j", (text, expected) => {
    expect(maskPhones(text)).toBe(expected);
  });

  it.each([
    "Is 120 mg the usual dose?",
    "Is 120mg the usual dose?",
    "Is 2.5 mL right?",
    "1,000 units",
    "My label is dated 2026-11-26",
    "My label is dated 11/26/2026",
    "Take 50 to 200 mg",
  ])("doesn't mask %j", (text) => {
    expect(maskPhones(text)).toBe(text);
  });

  it("masks a 10-digit product code too (known limit)", () => {
    expect(maskPhones("NDC 0002-1436-01")).toBe("NDC [PHONE]");
  });
});
