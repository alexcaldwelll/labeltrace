# Risk review notes

Items the one-page risk review must cover before public release (constitution, Release
Safeguards). The risk review itself is written later, at the release milestone
(`specs/001-labeltrace-qa/tasks.md`). Add an item here whenever work turns up a risk the
review should weigh.

## Refusal rules

- **Interaction questions are refused even when the label covers them.** Any question
  that names another drug or a drug class gets "talk to your doctor or pharmacist" (FR-013,
  research R14). For example, "Can I take Reyvow with my SSRI?" never shows Reyvow's own
  serotonin-syndrome warning with SSRIs.
- **"Is Reyvow a triptan?" is refused as another drug** (a known false alarm, recorded as
  a test). It's a candidate for a future exception for "is [our drug] a [class]"
  questions.
- **Misspelled other-drug names close to English words can pass the refusal rules and
  rely on the AI backstop.** The closer-English rule (research R14) keeps common
  misspellings like "migrane" from being refused, but a misspelled drug name that is as
  close to an English word passes the rules (for example "Botx", 1 change from "box").

## Emergency phrases and messages

- **The emergency phrase list hasn't been clinically validated.** The emergency phrases
  and other wordings (`specs/001-labeltrace-qa/contracts/emergency-rules.md` section 2),
  and the typo rules that match them (section 3), were written by the project owner and
  Claude from general knowledge and the two drug labels. No clinician has reviewed them.
  The list may miss ways people describe a medical emergency or a crisis, and it causes
  some known false alarms on purpose (for example "paint" → 911, "I cut myself shaving" →
  988). Before public release, the risk review should decide: who reviews the list
  clinically, how missed emergencies and false alarms will be found (the logged
  `emergency_phrase_ids`, FR-054), and how often the list is reviewed again.
- **The 911 and 988 messages assume a US user.** 988 isn't available in most other
  countries.
- **Label "sentences" can be run-on text.** Emergency label excerpts split label text at
  ".", "!", or "?". Bullet lists and tables in openFDA label text have no periods, so a
  matched "sentence" can run across bullets, headings, or table numbers (for example
  Emgality's "…tongue, or throat trouble breathing Constipation with serious
  complications."). Shown under an emergency message, this can be confusing. Better
  sentence splitting should be a future task.
- **"chest discomfort" and "chest pressure" don't trigger 911 yet.** A user who types
  either one gets no emergency message. Consider adding them (to `chest_pain`) once
  sentence splitting improves, since Reyvow's label says "chest discomfort" inside a
  run-on table sentence.
