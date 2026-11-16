# Implementation Plan: LabelTrace Patient Q&A

**Branch**: `001-labeltrace-qa` | **Date**: 2026-11-15 (updated after `/speckit-analyze`) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-labeltrace-qa/spec.md`

## Summary

LabelTrace is a web app that answers patient questions about Emgality and Reyvow using
only the FDA label text from openFDA. Every question goes through fixed steps, in this
order. The whole reply must fit in **9 seconds** (FR-053).

1. **Emergency check**: plain code, no AI. Medical emergencies get "Call 911 or see a
   doctor now." Self-harm phrases get the 988 Lifeline message. Clearly informational
   medical questions also get the label's matching sentences, word for word.
2. **Basic checks**: blank, too long, not English. The language check also runs on the
   emergency path before anything is saved. Non-English questions, including emergency
   ones, are logged with only the reply type and time (FR-055).
3. **Scrub**: names, emails, and phone numbers are masked. Drug names, including other
   drugs' names, are never masked, so the refusal rules still see them.
4. **Refusal rules**: dosing, comparisons, other drugs, no drug named.
5. **Pick label sections**: keyword search with synonyms.
6. **Answer AI**: Claude Haiku 5.5, with a fixed answer shape. When both drugs are asked
   about, they're answered at the same time.
7. **Answer checks**: 120 words or fewer, reading grade 9 or lower, real sections, label
   date. One retry only if at least 3 seconds are left. If the checks still fail, the
   reply points to the label section with a link (FR-052). It never says "The label
   doesn't cover this" in that case.
8. **Audit log**: the scrubbed question only. Emergency rows also record which phrases
   matched (FR-054).
9. **Grading sample**: 10% of real answers are sent to the OpenAI grader in the
   background.

Reviewers sign in to approve or flag answers. The owner records decisions on grader
flags, and the app shows how often the owner disagrees with the grader.

Tests come in two tiers, as constitution v3.0.0 requires. **Fast tests** (no AI) run on
every PR. **AI tests** run before merging any PR that changes a file on
`.github/ai-related-paths.txt`, and before every release. They run on PRs as well as by
hand, and every run waits for the owner's approval in the `ai-tests` environment. Until
the AI test tier exists, the constitution's one-time startup exception applies (see the
Constitution Check). A release is a `v*` tag that
only the owner can push. GitHub Actions, branch protection, and a tag ruleset enforce
all of this.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22 LTS

**Primary Dependencies**: Next.js (App Router); `@anthropic-ai/sdk` (answer AI); `openai`
(grader); `@supabase/supabase-js` and `@supabase/ssr` (database and logins); `compromise`
(name finding in the scrubber); `syllable` (reading-level score); `franc-min` (language
check); `zod` (checking data shapes)

**Storage**: Supabase Postgres, with Row Level Security. There are two kinds of database:

- A **local** database (on the developer's computer and inside GitHub Actions) for fast
  tests.
- An **online** database (a hosted Supabase project) for the live app. AI test results
  (`test_runs`, test log rows, and test grades) are saved here, so `ai-gate`, the release
  check, and the owner's pages can all see them.

Test questions and the emergency phrase list live in the repo, so every change goes
through a PR.

**Testing**: Vitest with two projects. `fast` (no AI; local Supabase in CI) and `ai` (real
models; results saved to the online database; runs on PRs and by hand, each run approved
by the owner). If the grader is down during an AI run, the run is `incomplete` and can't
be used to merge. The AI runner also reports how often answers fall back to the label
pointer (warning above 5%) and the slowest 5% of answer times. See
[research.md R15](research.md#r15-two-tiers-of-tests).

**Target Platform**: Netlify (Next.js runtime, server functions, scheduled functions). Works
in current desktop and mobile browsers. Every PR gets a deploy preview. The public site is
published **only** by the release workflow, from an owner's `v*` tag
([R21](research.md#r21-releases)).

**Project Type**: Web application (one Next.js project holding the pages and the server
code)

**AI Models**: Answer: `claude-haiku-5-5` (comparison with `claude-sonnet-5-5` planned,
[R3](research.md#r3-answer-ai-model-and-the-larger-model-comparison)). Grader: smallest
OpenAI model that passes calibration ([R4](research.md#r4-second-ai-grader)).

**Performance Goals**: Every reply fits in a 9-second time limit (FR-053). Answers in
under 10 seconds for 95% of questions. Emergency messages in under 1 second (SC-013).

**Constraints**: Netlify functions stop at 10 seconds, so the app's own limit is 9
seconds. Raw question never stored. No outside error-reporting service: Netlify's logs
only, with scrubbed text only. The label is downloaded again only when its date changes.
English only.

**Scale/Scope**: 2 drugs, about 10 screens or pages, a few reviewers, light patient
traffic at first. 500 or more real answers is enough to check the 10% grading rate
(SC-010).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against constitution **v3.0.0** (ratified and last amended 2026-11-15).

| Principle | How this plan meets it | Pre-design | Post-design |
|---|---|---|---|
| I. Accountable | All work on branches with PRs. Branch protection needs the owner's approval and passing checks. Claude uses a bot account, so approval is real ([R17](research.md#r17-branch-protection-and-the-bot-account)). Only the owner can push `v*` release tags. | ✅ | ✅ |
| II. Safe | Emergency check is plain code and runs first. Self-harm never shows label text. Rule-based plus AI refusals for dosing and comparisons. One fast test per emergency phrase ([emergency-rules](contracts/emergency-rules.md)). No skip list for false alarms (PC-6). | ✅ | ✅ |
| III. Valid and Reliable | Only stored label text is sent to the AI. Code checks every cited section and the label date. "The label doesn't cover this" only when the label really doesn't. Two test tiers. `ai-gate` reads the official list `.github/ai-related-paths.txt`. Required checks `fast-tests` and `ai-gate` block merges. The release workflow blocks releases without a passing AI test run. An `incomplete` run (grader down) never counts as passing. | ✅ | ✅ |
| III. Startup exception (v3.0.0) | Until the AI tier exists, AI-related PRs may merge with passing fast tests and the owner's approval. Tasks that use it are tagged "Startup exception" in tasks.md. Every PR merged under it gets a row (PR number, what changed, merge date) in the spec's table (task T085). It ends for good when T073 is merged and one AI test run passes with at least one signed-off entry (the calibration entries count, spec Clarifications 2026-11-16). Task T084 then records the end date and `test_runs` ID. PR #13 merged **before** the exception existed, so it is a recorded rule break (`docs/rule-incidents.md`), with a late AI test run once T073 exists, not an exception row. | ✅ | ✅ |
| IV. Fair and Equitable | Reading level is checked by code on every AI-written answer. If an answer can't pass, the app points to the label section instead of showing hard text. Synonym map and typo matching. "Three ways" tests for each drug in the AI tier. Places where Safe or Privacy win over this principle are written down (spec PC-1 to PC-8). Misspelled drug names in normal questions are matched and shown to the user (FR-056). | ✅ | ✅ |
| V. Privacy | Scrubber runs before any AI. Near-miss typos of drug names stay visible, but common first names (public SSA list, research R22) are always masked (spec PC-9, where Safe wins over Privacy). Raw question only in memory, with a test that searches all tables. Blank and non-English rows (including non-English emergencies) hold only reply type and time. Netlify logs get scrubbed text only. Made-up data in tests. Secrets in `.env`, Netlify, and GitHub secrets only. | ✅ | ✅ |
| VI. Transparent | "AI, not a doctor" banner in the shared page layout, so every screen has it, including the label page. README task included. | ✅ | ✅ |
| VII. Sustainable | Haiku 5.5 first, with a measured comparison before any change. openFDA update check downloads nothing unless the date is newer ([R6](research.md#r6-getting-the-label-from-openfda-and-checking-for-updates)). AI tests only run when the rules need them. | ✅ | ✅ |
| VIII. Enhanced | Model is told to use only the given text. The answer key has `checked_by` and `checked_on` fields. The owner signs off entries as each story adds them, and the test loader refuses unchecked entries. | ✅ | ✅ |
| When Principles Conflict | Each decision is in the spec's Clarifications section, "Principle conflict decisions" (PC-1 to PC-9), naming the principles, the winner, and why. | ✅ | ✅ |
| Release safeguards | Grader on every AI-written test answer (from the first one) and 10% of real answers. Flags need owner decisions, and `ai-gate` and the release workflow block until they have them. Disagreement rate shown. Risk review is a separate task (spec Assumptions). | ✅ | ✅ |

**Gate result**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-labeltrace-qa/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions and reasons
├── data-model.md        # Phase 1: stored data
├── quickstart.md        # Phase 1: how to prove it works
├── contracts/
│   ├── api.md           # Web addresses: what goes in, what comes out
│   └── emergency-rules.md  # Exact emergency matching and case rules
├── checklists/
│   └── requirements.md
└── tasks.md             # Made by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/                      # Next.js pages and server routes
│   ├── layout.tsx            # Shared layout with the "AI, not a doctor" banner
│   ├── page.tsx              # Patient question page
│   ├── label/[drug]/         # Saved label, one anchor per section (target of FR-052 links)
│   ├── login/                # Reviewer and owner sign-in
│   ├── review/               # Reviewer pages (sign-in required)
│   ├── owner/                # Grader flags and disagreement rate (owner only)
│   └── api/                  # Server routes (see contracts/api.md)
├── lib/
│   ├── text/                 # Text matching used by the emergency checks and search
│   ├── emergency/            # Phrase list, matching, case sorting (no AI)
│   ├── scrub/                # Personal-details masking (no AI)
│   ├── refusals/             # Dosing, comparison, other-drug, which-drug rules
│   ├── labels/               # openFDA fetch, update check, section map, retrieval
│   ├── ai/                   # Answer AI and grader clients
│   ├── prompts/              # Versioned prompt text
│   ├── checks/               # Word count, reading level, citation, dosing-number checks
│   ├── pipeline/             # The ordered steps from the Summary, time limit, language check
│   ├── grading/              # 10% sample and grading worker
│   ├── log/                  # The only server logger (Netlify logs, scrubbed text only)
│   ├── ci/                   # ai-gate and release-check decisions (pure functions)
│   └── db/                   # Supabase access (log, reviews, grades)
└── config/
    └── models.ts             # Model names in one place

netlify/functions/
├── label-check.ts            # Daily scheduled update check
└── grading-worker.ts         # Every-10-minutes grading of sampled answers

supabase/
└── migrations/               # Table definitions and access rules

tests/
├── fast/                     # No AI; runs on every PR
├── ai/                       # Real models; results saved to the online database
│   ├── questions/            # Test questions and the human-checked answer key
│   └── grader/               # Grader calibration set
└── fixtures/                 # Saved openFDA replies, fake personal details

.github/
├── ai-related-paths.txt      # Official list of AI-related files (constitution III)
├── workflows/
│   ├── fast-tests.yml
│   ├── ai-tests.yml
│   ├── ai-gate.yml
│   └── release.yml           # Runs on v* tags; needs a passing AI run; publishes to Netlify
└── CODEOWNERS                # * @alexcaldwelll
```

**Structure Decision**: One Next.js project (no separate frontend and backend). Netlify
scheduled functions live in `netlify/functions/`. The `ai-gate` check reads
`.github/ai-related-paths.txt` when it runs. It never keeps its own copy of the list.

## Tests, GitHub Actions, Branch Protection, and Releases

- **Tiers**: see [R15](research.md#r15-two-tiers-of-tests).
- **Workflows**: see [R16](research.md#r16-github-actions-automatic-checks-on-github).
- **Branch protection** ([R17](research.md#r17-branch-protection-and-the-bot-account)):
  each required check is turned on by the owner as soon as it exists.
  1. **Now**: require a PR, 1 approval from Code Owners, no bypassing, no force pushes,
     no deletions.
  2. **Right after the `fast-tests` workflow first runs** (tasks T006 → T070): make
     `fast-tests` a required check.
  3. **Right after the `ai-gate` workflow first runs** (tasks T015 → T068): make
     `ai-gate` a required check. The small AI test tier in Phase 2 (runner, test-run
     recorder, grader calibration) exists by then, so AI-related PRs can pass it.
- **Path list**: the workflow and gate files were added to `.github/ai-related-paths.txt`
  in PR #13 (task T083, done). That PR merged without a passing AI test run, which is a
  recorded rule break with a late check (`docs/rule-incidents.md`).
- **Releases** ([R21](research.md#r21-releases)): a tag ruleset lets only the owner
  create or delete `v*` tags. `release.yml` checks for a passing AI test run (with every
  grader flag decided) for the tagged commit, then publishes to Netlify with the
  `NETLIFY_AUTH_TOKEN` GitHub secret. Netlify doesn't auto-publish `main`.
- **Online setup** (owner tasks): the online Supabase project, Netlify site, secret keys,
  and scheduled functions. Secrets live only in Netlify and in GitHub environments, never
  in files.
- **Build order (tests built with each story, FR-042)**: CI workflows and the small AI test
  tier first → US1 emergencies (US-04) → US2 refusals (US-03) → **US5 scrubbing
  (US-05)** → grading of test answers (owner login, grader tables, flag decisions) → US3
  answers (US-01, first real AI call) → US4 citations (US-02) → US6 log (US-06) → US7
  label freshness (US-10) → US8 review pages (US-07) → US9 real-answer grading (US-08).
  Story labels match spec.md and tasks.md; the owner's original IDs are in brackets. Scrubbing comes before the real answer AI is connected, so no
  real AI call ever gets unscrubbed text. Grading comes before the first AI-written test
  answer, so every test answer is graded (constitution, Release Safeguards).

## Complexity Tracking

No constitution violations to justify in this plan. The earlier conflict (AI tests not
running on every PR) was settled by constitution v2.0.0, and the startup period by v3.0.0's
one-time exception. One past merge (PR #13) broke rule III and is recorded in
`docs/rule-incidents.md`. Places where one principle wins over another are written down
in the spec (PC-1 to PC-9), as the constitution requires.
