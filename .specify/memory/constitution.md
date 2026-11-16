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
- Automated tests come in two tiers:
  - **Fast tests** make no AI calls. They MUST run and pass on every pull request.
  - **AI tests** call the answer AI and the second-AI grader. They MUST run and pass before
    merging any pull request that changes AI-related code, and before every release.
- AI-related code means: prompts, model choice, label handling, the personal-details
  scrubber, the emergency checks and the text matching they use, the order of the question
  steps, the answer checks, and the refusal rules.
- The official list of AI-related files is `.github/ai-related-paths.txt`. The list
  includes itself, so changing it also needs AI tests. Changes to it MUST be approved by
  the project owner through CODEOWNERS.
- A required automated check MUST block a merge when one of these rules is not met.
- **One-time startup exception.** The AI tests can't run until the AI test system is built.
  Until then:
  - A pull request that changes AI-related code MAY merge without an AI test run if its
    fast tests pass and the project owner reviews and approves it.
  - This exception ends automatically, for good, as soon as both of these are true:
    1. The AI test runner (task T073 in feature `001-labeltrace-qa`) is merged into
       `main`, and
    2. one AI test run passes with at least one human-checked answer-key entry. "Passes"
       means its `test_runs` row has `status = passed`.
  - After that, every pull request that changes AI-related code needs a passing AI test
    run, with no exceptions. This exception MUST NOT be extended, renewed, or used again.
  - Every pull request merged under this exception MUST be listed in the feature spec's
    Clarifications section, with its number, what it changed, and the date it merged.

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
  - **Exception:** blank questions and questions not in English are logged with only the
    reply type and the time, and no question text. The scrubber only works on English, so
    it can't safely clean non-English text.
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

## When Principles Conflict

- If two principles can't both be followed, **Safe (II)** comes first, then **Privacy
  (V)**, then the others.
- Each such decision MUST be written down in the feature spec's Clarifications section. It
  names the principles involved, which one won, and why.

**Why:** Some choices can't satisfy every rule at once. A fixed order keeps those choices
consistent, and writing them down keeps them open for review.

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
3. All required automated tests pass (fast tests always; AI tests too when AI-related code
   changed, except under the one-time startup exception in III), and every grader flag has
   a recorded decision.
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

**Version**: 3.0.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15
