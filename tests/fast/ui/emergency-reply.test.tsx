// @vitest-environment jsdom
//
// T023: the emergency reply on the page (src/components/EmergencyReply.tsx; FR-046,
// FR-048).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import EmergencyReply from "@/components/EmergencyReply";
import { MSG_911, MSG_988, MSG_NOT_COVERED } from "@/lib/emergency/phrases";

afterEach(cleanup);

describe("EmergencyReply", () => {
  it("messages render before anything else", () => {
    const { container } = render(
      <EmergencyReply
        reply={{
          kind: "emergency",
          case: "informational",
          messages: [MSG_911],
          label_excerpts: [],
          not_covered: true,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf(MSG_911)).toBe(0);
    expect(text.indexOf(MSG_NOT_COVERED)).toBeGreaterThan(text.indexOf(MSG_911));
    expect(container.firstElementChild?.firstElementChild?.getAttribute("role")).toBe("alert");
  });

  it("911 is above 988", () => {
    const { container } = render(
      <EmergencyReply
        reply={{
          kind: "emergency",
          case: "happening_now",
          messages: [MSG_911, MSG_988],
          label_excerpts: [],
          not_covered: false,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf(MSG_911)).toBeLessThan(text.indexOf(MSG_988));
  });

  it("label sentences show their section and the label date", () => {
    render(
      <EmergencyReply
        reply={{
          kind: "emergency",
          case: "informational",
          messages: [MSG_911],
          label_excerpts: [
            {
              drug: "emgality",
              section: "Patient Information",
              label_date: "2026-06-05",
              sentences: ["Allergic reactions can happen after receiving EMGALITY."],
            },
          ],
          not_covered: false,
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "What the Emgality label says (label date: June 5, 2026)",
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Patient Information");
    expect(
      screen.getByText("Allergic reactions can happen after receiving EMGALITY."),
    ).toBeTruthy();
  });
});
