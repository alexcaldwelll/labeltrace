"use client";

// T052: the login page (email and password) for reviewers and the owner (FR-029).
//
// It stays inside the root layout (src/app/layout.tsx), so the "LabelTrace is an AI,
// not a doctor." banner shows here too (FR-003). There's no sign-up: accounts are
// added by the owner (T079), and public sign-up is off.
//
// Every failed sign-in shows the same message, and nothing typed is logged or saved.
// After signing in, it goes to the `next` page if that's a path on this site, else "/".
import { useState } from "react";

import { createLoginClient, safeNextPath, SIGN_IN_FAILED } from "@/lib/auth/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    try {
      const { error: signInError } = await createLoginClient().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(SIGN_IN_FAILED);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // A full page load, so the server sees the new sign-in cookies.
      window.location.assign(safeNextPath(next));
    } catch {
      setError(SIGN_IN_FAILED);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main>
      <h1>Reviewer sign-in</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={signingIn}>
          {signingIn ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
