# Risk review notes

Items the one-page risk review must cover before public release (constitution, Release
Safeguards). The risk review itself is written later, at the release milestone
(`specs/001-labeltrace-qa/tasks.md`). Add an item here whenever work turns up a risk the
review should weigh.

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
