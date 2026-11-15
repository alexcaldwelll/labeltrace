# Rule Incidents

This file records every time a rule in `CLAUDE.md` or the project constitution
(`.specify/memory/constitution.md`) was broken. Each entry gives the date, which rule,
what happened, how it was caught, and how it was fixed. New incidents are added to the
bottom of the table (see `CLAUDE.md` rule 8).

| Date | Rule broken | What happened | How it was caught | How it was fixed |
|------|-------------|---------------|-------------------|------------------|
| 2026-11-15 | `CLAUDE.md` rule 1: Ask before changing files | While updating the spec for emergency phrase handling (`specs/001-labeltrace-qa/spec.md`), Claude added an edge case the owner had not approved: what to show when a question has both a medical emergency phrase and a self-harm phrase. It said to show only the 988 message, which would have dropped "Call 911 or see a doctor now." | Claude noticed it while checking its own edits, before committing. | Claude removed the line before committing, so it never reached GitHub. Claude told the owner and asked them to decide. The owner decided to show both messages (911 first, then 988). This was added to the spec as FR-051 in PR #6. |
