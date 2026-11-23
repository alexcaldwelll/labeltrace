// T010: the seed script must only ever run against a local database.
import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "../../../scripts/seed-labels";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://localhost",
    "https://127.0.0.1/",
  ])("allows the local address %s", (url) => {
    expect(assertLocalDatabaseUrl(url).toString()).toBe(new URL(url).toString());
  });

  it.each([
    "https://abcdefghijklmnop.supabase.co",
    "http://localhost.example.com:54321",
    "http://127.0.0.1.example.com",
    "http://localhost@example.com",
    "http://example.com/localhost",
    "http://0.0.0.0:54321",
    "http://192.168.1.10:54321",
  ])("refuses the address %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/Refusing to seed/);
  });

  it("refuses a missing address", () => {
    expect(() => assertLocalDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertLocalDatabaseUrl("")).toThrow(/not set/);
  });

  it("refuses something that isn't a web address", () => {
    expect(() => assertLocalDatabaseUrl("localhost")).toThrow(/valid web address/);
  });
});
