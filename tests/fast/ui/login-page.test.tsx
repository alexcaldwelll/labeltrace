// @vitest-environment jsdom
//
// T052: the login page (src/app/login/page.tsx). Owner-approved extra (2026-11-28,
// detail 8). The Supabase sign-in client is a stand-in, so nothing is sent anywhere.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const signIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/browser", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/browser")>();
  return {
    ...real,
    createLoginClient: () => ({ auth: { signInWithPassword: signIn } }),
  };
});

const { default: LoginPage } = await import("@/app/login/page");
const { safeNextPath, SIGN_IN_FAILED } = await import("@/lib/auth/browser");

afterEach(() => {
  cleanup();
  signIn.mockReset();
});

describe("login page", () => {
  it("has email and password fields", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("Email")).toHaveProperty("type", "email");
    expect(screen.getByLabelText("Password")).toHaveProperty("type", "password");
  });

  it("a failed sign-in shows the one message", async () => {
    signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(SIGN_IN_FAILED);
    expect(SIGN_IN_FAILED).toBe("Email or password is wrong.");
  });

  it("an outside next address goes to /", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
  });
});
