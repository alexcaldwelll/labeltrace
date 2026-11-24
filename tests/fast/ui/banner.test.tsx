// @vitest-environment jsdom
//
// T014: the "AI, not a doctor" banner (FR-003).
//
// The banner lives only in the root layout. These tests draw the layout with a
// page inside it, to prove that ANY page inside the layout gets the banner, not
// just the question page.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RootLayout from "@/app/layout";
import HomePage from "@/app/page";

const BANNER = "LabelTrace is an AI, not a doctor.";

// The layout draws <html> and <body>, so it is drawn straight into the page's
// document instead of inside a <div>.
function renderInLayout(page: React.ReactNode) {
  return render(<RootLayout>{page}</RootLayout>, { container: document });
}

afterEach(() => {
  cleanup();
});

describe("root layout banner (FR-003)", () => {
  it("shows the banner around a sample page", () => {
    renderInLayout(<main>A sample page with no banner of its own</main>);
    expect(screen.getByRole("banner")).toHaveProperty("textContent", BANNER);
    expect(screen.getByText("A sample page with no banner of its own")).toBeDefined();
  });

  it("shows the banner on the question page", () => {
    renderInLayout(<HomePage />);
    expect(screen.getByRole("banner")).toHaveProperty("textContent", BANNER);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDefined();
  });

  it("shows the banner only once (the question page has no copy of its own)", () => {
    renderInLayout(<HomePage />);
    expect(screen.getAllByText(BANNER)).toHaveLength(1);
  });
});
