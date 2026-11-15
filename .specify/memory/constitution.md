# LabelTrace Constitution

LabelTrace answers questions about migraine medicines (Emgality and Reyvow) using only
FDA drug label data from openFDA. These principles are based on Eli Lilly's 8 public AI
principles.

## Core Principles

### I. Accountable

- Every change MUST go through a pull request that the project owner reviews and approves
  before it is merged.
- No one, human or AI, may commit straight to the `main` branch.
- AI coding agents MUST follow the rules in `CLAUDE.md`. If an agent breaks a rule, it MUST
  say so, undo the change, and propose a way that follows the rules.

**Why:** A real person stays responsible for everything the app does.

### II. Safe

- The app MUST NOT give personal dosing advice. Questions like "How much should I take?"
  MUST get "Ask your doctor or pharmacist," along with what the label says in general.
- The app MUST NOT compare any drugs or say one drug is better than another. This applies to
  every drug, not only Emgality versus Reyvow.
- Emergency phrases MUST skip the AI completely and show an emergency message right away:
  - "Worst headache of my life," sudden numbness or weakness, trouble speaking, fainting,
    chest pain, trouble breathing, or a swollen face, lips, or throat (a possible allergic
    reaction) MUST show: "Call 911 or see a doctor now."
  - Self-harm or suicide phrases MUST show the 988 Suicide & Crisis Lifeline (call or text
    988), as well as 911 for immediate danger.
- Every emergency phrase MUST have at least one automated test proving it shows the right
  message.

**Why:** Wrong medical advice, or a missed emergency, can hurt someone.

### III. Valid and Reliable

- Answers MUST come only from the FDA label text.
- Every answer MUST name the label section it used (for example, "Warnings and
  Precautions") and show the label's date.
- If the label does not answer the question, the app MUST say "The label doesn't cover this"
  and MUST NOT guess.
- Nothing may be merged unless all automated tests pass.

**Why:** People can check the answer against the label for themselves.

### IV. Fair and Equitable

- Answers MUST be written in plain language at about an 8th-grade reading level.
- The tests MUST include the same question asked three ways: in medical words, in everyday
  words, and with typos. All three MUST get an answer of the same quality.

**Why:** Everyone deserves a good answer, however they word the question.

### V. Privacy

- Names, emails, and phone numbers MUST be removed ("scrubbed") from a question before it
  reaches the AI.
- The raw question (exactly as the user typed it) MUST NOT be stored anywhere, including
  logs.
- The scrubbed question MUST be stored in the audit log, along with the answer, the label
  section cited, and the label date, so a reviewer can judge the answer.
- Real patient data MUST NOT be used anywhere, including tests.
- API keys and other secrets MUST stay in git-ignored files such as `.env` and MUST NOT be
  pushed to GitHub.

**Why:** People's health questions are private, but answers still need to be checked.

### VI. Transparent and Explainable

- The app MUST clearly say, on every screen, that it is an AI and not a doctor.
- The README MUST explain how the app works, where its data comes from, and what it cannot
  do.

**Why:** People should know what they are using and how far to trust it.

### VII. Sustainable

- The app MUST use the smallest AI model that passes all the tests. Moving to a bigger model
  needs a written reason in the pull request.
- Label data MUST be downloaded from openFDA once, saved, and reused. It is downloaded again
  only when the label changes.

**Why:** It saves energy and money and avoids needless calls to openFDA.

### VIII. Enhanced (Human-Checked Facts)

- Medical facts MUST come only from the label text given to the AI, never from the AI's own
  memory or training.
- A human MUST check every expected answer in the test answer key against the real label
  before it is used.

**Why:** AI is there to help people read the label, not to replace it.

## Release Safeguards

**Risk review before going public**
- Before the app is released to the public, a one-page risk review MUST be written. It
  lists what could go wrong, how likely each risk is, how bad it would be, and what is being
  done about it.
- The project owner MUST approve the risk review before release.

**Second-AI grader**
- An AI from a different company than the one that writes the answers MUST grade each test
  answer on whether it sticks to the label.
- A failed grade MUST flag the answer for the project owner's review. It does not fail the
  tests automatically.
- The project owner makes the final call on each flagged answer and MUST record the
  decision and the reason.
- Changes with flagged answers MUST NOT be merged until every flag has a recorded decision.
- How often the owner disagrees with the grader MUST be tracked and looked at during each
  risk review.

**Why:** A different company's AI is less likely to share the same blind spots, and a human
still makes the final call.

## Development Workflow

1. Do all work on a separate branch.
2. Open a pull request.
3. All automated tests pass, and every grader flag has a recorded decision.
4. The project owner reviews and approves.
5. Only then is the work merged into `main`.

## Governance

- This constitution overrides any other practice in the project. If a task would break a
  rule here, stop and ask the project owner before doing anything.
- Changes to this constitution MUST go through a pull request that the project owner
  approves.
- The version number follows these rules:
  - MAJOR (for example, 2.0.0): a rule is removed or its meaning changes.
  - MINOR (for example, 1.1.0): a new rule or section is added, or a rule is greatly
    expanded.
  - PATCH (for example, 1.0.1): wording fixes that do not change meaning.
- Every pull request review MUST check that the change follows this constitution.
- Day-to-day rules for AI agents are in `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15
