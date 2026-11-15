# Implementation Plan: LabelTrace Patient Q&A

**Branch**: `001-labeltrace-qa` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-labeltrace-qa/spec.md`

## Summary

LabelTrace is a web app that answers patient questions about Emgality and Reyvow using
only the FDA label text from openFDA. Every question goes through fixed steps, in this
order:

1. **Emergency check**: plain code, no AI. Medical emergencies get "Call 911 or see a
   doctor now." Self-harm phrases get the 988 Lifeline message. Clearly informational
   medical questions also get the label's matching sentences, word for word.
2. **Basic checks**: blank, too long, not English.
3. **Scrub**: names, emails, and phone numbers are masked.
4. **Refusal rules**: dosing, comparisons, other drugs, no drug named.
5. **Pick label sections**: keyword search with synonyms.
6. **Answer AI**: Claude Haiku 5.5, with a fixed answer shape.
7. **Answer checks**: 120 words or fewer, reading grade 9 or lower, real sections, label
   date.
8. **Audit log**: the scrubbed question only.
9. **Grading sample**: 10% of real answers are sent to the OpenAI grader in the
   background.

Reviewers sign in to approve or flag answers. The owner records decisions on grader
flags, and the app shows how often the owner disagrees with the grader.

Tests come in two tiers. **Fast tests** (no AI) run on every PR. **AI tests** run on
demand, before release, and before merging AI-related changes, as constitution v1.1.0
requires ([PR #7](https://github.com/alexcaldwelll/labeltrace/pull/7)). GitHub Actions
and branch protection enforce both tiers.

## Technical Context

**Language/Version**: TypeScript 5 on Node.js 22 LTS

**Primary Dependencies**: Next.js (App Router); `@anthropic-ai/sdk` (answer AI); `openai`
(grader); `@supabase/supabase-js` and `@supabase/ssr` (database and logins); `compromise`
(name finding in the scrubber); `syllable` (reading-level score); `franc-min` (language
check); `zod` (checking data shapes)

**Storage**: Supabase Postgres, with Row Level Security. Test questions and the emergency
phrase list live in the repo, so every change goes through a PR.

**Testing**: Vitest with two projects. `fast` (no AI; local Supabase in CI) and `ai` (real
models). See [research.md R15](research.md#r15-two-tiers-of-tests).

**Target Platform**: Netlify (Next.js runtime, server functions, scheduled functions). Works
in current desktop and mobile browsers.

**Project Type**: Web application (one Next.js project holding the pages and the server
code)

**AI Models**: Answer: `claude-haiku-5-5` (comparison with `claude-sonnet-5-5` planned,
[R3](research.md#r3-answer-ai-model-and-the-larger-model-comparison)). Grader: smallest
OpenAI model that passes calibration ([R4](research.md#r4-second-ai-grader)).

**Performance Goals**: Answers in under 10 seconds for 95% of questions. Emergency
messages in under 1 second (SC-013).

**Constraints**: Netlify function time limit (8-second AI timeout). Raw question never
stored. The label is downloaded again only when its date changes. English only.

**Scale/Scope**: 2 drugs, about 10 screens or pages, a few reviewers, light patient
traffic at first. 500 or more real answers is enough to check the 10% grading rate
(SC-010).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against constitution **v1.1.0** (pending owner approval in PR #7). If PR #7 is not
approved, the test split in this plan must change. All AI tests would then run on every
PR.

| Principle | How this plan meets it | Pre-design | Post-design |
|---|---|---|---|
| I. Accountable | All work on branches with PRs. Branch protection needs the owner's approval and passing checks. Claude uses a bot account, so approval is real ([R17](research.md#r17-branch-protection-and-the-bot-account)). | ✅ | ✅ |
| II. Safe | Emergency check is plain code and runs first. Self-harm never shows label text. Rule-based plus AI refusals for dosing and comparisons. One fast test per emergency phrase ([emergency-rules](contracts/emergency-rules.md)). | ✅ | ✅ |
| III. Valid and Reliable | Only stored label text is sent to the AI. Code checks every cited section and the label date. "The label doesn't cover this" when unsure. Two test tiers, with required checks `fast-tests` and `ai-gate`. | ✅ (with v1.1.0) | ✅ (with v1.1.0) |
| IV. Fair and Equitable | Reading level is checked by code. Synonym map and typo matching. "Three ways" tests for each drug in the AI tier. | ✅ | ✅ |
| V. Privacy | Scrubber runs before any AI. Raw question only in memory, with a test that searches all tables. Made-up data in tests. Secrets in `.env`, Netlify, and GitHub secrets only. | ✅ | ✅ |
| VI. Transparent | "AI, not a doctor" banner in the shared page layout, so every screen has it. README task included. | ✅ | ✅ |
| VII. Sustainable | Haiku 5.5 first, with a measured comparison before any change. openFDA update check downloads nothing unless the date is newer ([R6](research.md#r6-getting-the-label-from-openfda-and-checking-for-updates)). AI tests not run on every PR. | ✅ | ✅ |
| VIII. Enhanced | Model is told to use only the given text. The answer key has `checked_by` and `checked_on` fields, and the test loader refuses unchecked entries. | ✅ | ✅ |
| Release safeguards | Grader on every test answer and 10% of real answers. Flags need owner decisions, and `ai-gate` blocks merges until they have them. Disagreement rate shown. Risk review is a separate task (spec Assumptions). | ✅ | ✅ |

**Gate result**: PASS, provided PR #7 (constitution v1.1.0) is approved.

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
└── tasks.md             # Made later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/                      # Next.js pages and server routes
│   ├── layout.tsx            # Shared layout with the "AI, not a doctor" banner
│   ├── page.tsx              # Patient question page
│   ├── review/               # Reviewer pages (sign-in required)
│   ├── owner/                # Grader flags and disagreement rate (owner only)
│   └── api/                  # Server routes (see contracts/api.md)
├── lib/
│   ├── emergency/            # Phrase list, matching, case sorting (no AI)
│   ├── scrub/                # Personal-details masking (no AI)
│   ├── refusals/             # Dosing, comparison, other-drug, which-drug rules
│   ├── labels/               # openFDA fetch, update check, section map, retrieval
│   ├── ai/                   # Answer AI and grader clients
│   ├── prompts/              # Versioned prompt text
│   ├── checks/               # Word count, reading level, citation checks
│   ├── pipeline/             # The ordered steps from the Summary
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
│   ├── emergency/            # One test per phrase, plus case and mixed tests
│   ├── scrub/
│   ├── refusals/
│   ├── checks/
│   ├── labels/               # Uses saved openFDA sample replies
│   ├── pipeline/             # Fake AI with fixed replies
│   ├── privacy/              # Raw-question search across all tables
│   └── review/
├── ai/                       # Real models; run on demand and before release
│   ├── questions/            # Test questions and the human-checked answer key
│   └── grader/               # Grader calibration set
└── fixtures/                 # Saved openFDA replies, fake personal details

.github/
├── workflows/
│   ├── fast-tests.yml
│   ├── ai-tests.yml
│   └── ai-gate.yml
└── CODEOWNERS                # * @alexcaldwelll
```

**Structure Decision**: One Next.js project (no separate frontend and backend). Netlify
scheduled functions live in `netlify/functions/`. The AI-related folders listed in
[R16](research.md#r16-github-actions-automatic-checks-on-github) are exactly the ones
that trigger the `ai-gate` requirement.

## Tests, GitHub Actions, and Branch Protection

- **Tiers**: see [R15](research.md#r15-two-tiers-of-tests).
- **Workflows**: see [R16](research.md#r16-github-actions-automatic-checks-on-github).
  They're created in the first implementation PR, together with `package.json`.
- **Branch protection settings**: see
  [R17](research.md#r17-branch-protection-and-the-bot-account). The owner turns them on
  in two stages:
  1. **Now**: require a PR, 1 approval from Code Owners, no bypassing, no force pushes,
     no deletions. This only works after the bot account is set up. Otherwise the owner
     couldn't approve PRs they opened themselves.
  2. **After the first workflow PR**: add the required checks `fast-tests` and `ai-gate`.
- **Build order (tests built with each story, FR-042)**: US-04 emergencies → US-03
  refusals → US-01 answers → US-02 citations → US-05 scrubbing → US-06 log → US-10 label
  freshness → US-07 review → US-08 grader. The CI workflows and CODEOWNERS come first,
  so every later PR is checked.

## Complexity Tracking

No constitution violations to justify. The one conflict found (AI tests not running on
every PR) is being fixed by changing the constitution openly
([PR #7](https://github.com/alexcaldwelll/labeltrace/pull/7)), not by an exception.
