// The shared layout (T014). Every page in src/app/ is drawn inside this frame,
// so the banner below shows on every screen (FR-003: every screen must say the
// app is an AI and not a doctor).
//
// The banner lives ONLY here. Pages must not add their own copy, and new pages
// (login, review, owner pages) must stay inside this root layout so the banner
// always shows.
import type { Metadata } from "next";

const BANNER_TEXT = "LabelTrace is an AI, not a doctor.";

export const metadata: Metadata = {
  title: "LabelTrace",
  description: "Answers questions about Emgality and Reyvow using only the FDA label.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header role="banner">
          <p>
            <strong>{BANNER_TEXT}</strong>
          </p>
        </header>
        {children}
      </body>
    </html>
  );
}
