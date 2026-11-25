// T023: shows an `emergency` reply (FR-046, FR-048; contracts/emergency-rules.md
// section 5). The emergency messages come first, 911 above 988, in a highlighted box.
// Then, only for informational medical questions: the label's own sentences, word for
// word, under "What the [drug] label says (label date: June 5, 2026)" and each
// section's name, or "The label doesn't cover this."
import type { EmergencyReplyFields } from "@/lib/emergency/respond";
import type { LabelExcerpt } from "@/lib/emergency/excerpts";
import { MSG_NOT_COVERED } from "@/lib/emergency/phrases";

const DRUG_NAMES: Record<LabelExcerpt["drug"], string> = { emgality: "Emgality", reyvow: "Reyvow" };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-06-05" → "June 5, 2026". Read from the text, so time zones can't shift it. */
export function formatLabelDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const name = month ? MONTHS[month - 1] : undefined;
  return name && day && year ? `${name} ${day}, ${year}` : isoDate;
}

export default function EmergencyReply({ reply }: { reply: EmergencyReplyFields }) {
  const drugs = [...new Set(reply.label_excerpts.map((excerpt) => excerpt.drug))];
  return (
    <div className="emergency-reply">
      <div role="alert" className="emergency-messages">
        {reply.messages.map((message) => (
          <p key={message}>
            <strong>{message}</strong>
          </p>
        ))}
      </div>
      {drugs.map((drug) => {
        const excerpts = reply.label_excerpts.filter((excerpt) => excerpt.drug === drug);
        return (
          <section key={drug} className="label-excerpts">
            <h2>
              What the {DRUG_NAMES[drug]} label says{" "}
              <span>(label date: {formatLabelDate(excerpts[0]!.label_date)})</span>
            </h2>
            {excerpts.map((excerpt) => (
              <div key={excerpt.section}>
                <h3>{excerpt.section}</h3>
                {excerpt.sentences.map((sentence, index) => (
                  <blockquote key={index}>{sentence}</blockquote>
                ))}
              </div>
            ))}
          </section>
        );
      })}
      {reply.not_covered && <p>{MSG_NOT_COVERED}</p>}
    </div>
  );
}
