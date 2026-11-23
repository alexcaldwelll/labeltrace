---
description: "Task list for LabelTrace Patient Q&A"
---

# Tasks: LabelTrace Patient Q&A

**Input**: Design documents from `specs/001-labeltrace-qa/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/emergency-rules.md](contracts/emergency-rules.md), [quickstart.md](quickstart.md)

**Tests**: Required. Tests are built **inside the same task** as the code they check, not in
a separate phase (spec "How testing works", FR-042). A task is not done until its tests pass.
Fast tests live in `tests/fast/` (no AI). AI-tier tests live in `tests/ai/` (real models,
results saved to the online database).

**Organization**: Tasks are grouped by user story. A small AI test tier is built in Phase 2,
so `ai-gate` can be a required check from the start. Emergencies (US1) and refusals (US2)
come first. Scrubbing (US5) comes **before** the real answer AI is connected (T039), so no
real AI call ever gets unscrubbed text, even in development. Grading of test answers comes
**before** the first test answer from a story. So the AI-tier entries for US1, US2, and
US5 that don't need the answer AI (T076, T030, T035) are added at the end of the grading
phase, after T059, and every test answer is graded. The AI-tier entries that **do** need
the answer AI (personal dosing, not covered, and normal questions with personal details)
are added in T087, after the real answer AI is connected (T039, T040). Until then they
could only fail, and a single failing entry fails the whole AI test run.

**Task IDs**: Tasks added after `/speckit-analyze` use IDs T070 and up, so existing IDs
don't change. Some tasks moved to a different phase. They kept their IDs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run at the same time as the other [P] tasks named under "Runs alongside"
  (different files, no waiting on each other)
- **[Story]**: Which user story the task serves (US1 to US9, from spec.md)
- **Owner task**: done by the owner (`alexcaldwelll`), not by Claude
- **Startup exception**: the task's PR changes an AI-related file before the AI test tier
  can run, so it merges under constitution III's one-time startup exception (passing fast
  tests and owner approval). Its PR must get a row in the spec's exception table (T085).
  After T084 closes the exception, every AI-related PR needs a passing AI test run.
- Under each task: **Tests** = the tests built in that task; **Runs alongside** = tasks that
  can be done at the same time; **Needs** = tasks that must be finished first

## Story key (spec.md → owner's story ID)

| Label | Story | Priority | Owner ID |
|---|---|---|---|
| US1 | Emergencies get urgent help, not an AI answer | P1 | US-04 |
| US2 | Refuse what the label can't answer | P1 | US-03 |
| US3 | Plain-language answers | P1 | US-01 |
| US4 | Show where the answer came from | P1 | US-02 |
| US5 | Remove personal details before the AI sees them | P2 | US-05 |
| US6 | Log every answer | P2 | US-06 |
| US7 | Keep label data current | P2 | US-10 |
| US8 | Human review of answers | P3 | US-07 |
| US9 | Second-AI grader | P3 | US-08 |

**Build order**: Setup → Foundation (with the small AI test tier) → US1 → US2 → **US5** →
**grading of test answers** (parts of US8 and US9) → US3 → US4 → US6 → US7 → US8 (rest) →
US9 (rest) → Polish.

---

## Standing owner tasks (repeat during the whole build)

- [ ] T066 **Owner task**: check every new answer-key entry (`tests/ai/questions/*.json`
  and `tests/ai/grader/calibration.json`) against the real label, and fill in `checked_by`
  and `checked_on` **in the same PR that adds the entry** (FR-044, constitution VIII). The
  loader (T025) refuses unchecked entries, so the AI test run, and `ai-gate`, fail until
  they're signed off.
- [ ] T082 **Owner task**: after a PR with a new file in `supabase/migrations/` merges,
  apply it to the online database (`supabase db push` with your own login). The bot never
  holds the online database's admin key (research R16).
- [ ] T085 **Owner task** (Claude drafts the row): every PR merged under the startup
  exception (constitution III, v3.0.0) adds a row to the spec's table "PRs merged under
  the startup exception": PR number, what it changed, and the date it merged. Add the row
  in the same PR when possible; if the number or date isn't known until it merges, add it
  in the next PR that touches spec.md, or a dedicated PR opened right after. Tasks that use
  the exception are tagged **Startup exception** below: T006, T007, T009, T010, T011, T012,
  T013, T025, T056, T063, and T073. T015, T062, and T074 can't
  use it: the first passing AI test run happens on T015's PR, after T068 (see T068). This
  stops for good when T084 merges.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The bare minimum project so code and tests can exist and GitHub checks every PR.

- [X] T001 Create the Next.js (App Router) + TypeScript project on Node.js 22: `package.json`, `tsconfig.json`, `next.config.ts`, `.nvmrc` (`22`). Add the plan's libraries: `next`, `react`, `@anthropic-ai/sdk`, `openai`, `@supabase/supabase-js`, `@supabase/ssr`, `compromise`, `syllable`, `franc-min`, `zod`; dev: `typescript`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `prettier`. Add npm scripts: `dev`, `build`, `lint`, `typecheck`, `test:fast`, `test:ai`, `db:migrate`, `db:seed`, `labels:fetch`, `labels:check`.
  - Tests: `npm run build` and `npm run typecheck` pass.
  - Runs alongside: —
- [X] T002 [P] Set up Vitest with two projects in `vitest.config.ts`: `fast` (`tests/fast/**`, never loads real AI clients) and `ai` (`tests/ai/**`). Add `tests/fast/smoke.test.ts`.
  - Tests: `tests/fast/smoke.test.ts`.
  - Runs alongside: T003, T004. Needs: T001.
- [X] T003 [P] Add ESLint and Prettier config (`eslint.config.mjs`, `.prettierrc`) with `no-console` set to error for `src/**`, **except** the one server logger `src/lib/log/server-log.ts` (research R18). There is no outside error-reporting service.
  - Tests: `npm run lint` passes.
  - Runs alongside: T002, T004. Needs: T001.
- [X] T004 [P] Check `.env.example` has blank placeholders for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`, so it can't reach the browser), `NETLIFY_AUTH_TOKEN`, and `NETLIFY_SITE_ID` (the last two are names only; the real values are GitHub secrets, research R21). There is no grader-model setting: the grader model lives only in `src/config/models.ts` (research R4). Add any that are missing, with no values. Confirm `.env` is listed in `.gitignore` (CLAUDE.md rule 5). (Done. All 7 names were already there; the 5 sample values were blanked, and a comment shows the Supabase URL format. `.env` is git-ignored; `.gitignore` was not changed.)
  - Tests: —
  - Runs alongside: T002, T003.
- [x] T005 Create `.github/CODEOWNERS` with `* @alexcaldwelll`. (Done. It also names the owner for `/.github/ai-related-paths.txt`.)
- [X] T006 **Startup exception.** Create `.github/workflows/fast-tests.yml` (check name `fast-tests`): runs on every PR and every push to `main`. Install, type-check, lint, start local Supabase, run `npm run test:fast` (research R16, FR-045).
  - Tests: the workflow runs `tests/fast/smoke.test.ts` on the PR and passes.
  - Note: Done in PR #25 except the "start local Supabase" step. That step needs `supabase/config.toml`, which T007 creates, so T007's PR adds it to `fast-tests.yml` (T007 uses the startup exception for this).
  - Needs: T001–T003.
- [X] T070 **Owner task**: right after `fast-tests` first runs on T006's PR, add `fast-tests` as a required check in branch protection for `main` (research R17).
  - Needs: T006.

**Checkpoint**: Every later PR must pass fast tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared pieces every story needs: label tables, the log table, the fake AI, the
ordered question steps, the "AI, not a doctor" banner, the online setup, the small AI test
tier, `ai-gate`, and the release workflow.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T007 **Startup exception** (`.github/workflows/fast-tests.yml` is AI-related). Set up local Supabase (`supabase/config.toml`) and migration `supabase/migrations/0001_labels.sql` creating `drug_labels` and `label_sections` per data-model.md. Rules: `drug` is "`emgality` or `reyvow`"; `is_current` "Exactly one current label per drug" (partial unique index on `drug` where `is_current`); `label_sections.text` "Not empty. Empty openFDA fields aren't saved." (check constraint). Lock both tables to the server (service role) only.
  - Tests: `tests/fast/db/labels-schema.test.ts`: a second current label for the same drug is rejected; empty section text is rejected; `drug = 'advil'` is rejected.
  - Needs: T006.
- [ ] T008 Migration `supabase/migrations/0002_log_and_runs.sql` creating `log_entries` and `test_runs` per data-model.md. Enforce: `answer_type` in `normal`, `label_pointer`, `refusal`, `not_covered`, `emergency`, `ask_which_drug`, `error`, `prompt_for_question`, `english_only`; `drug` in `emgality`, `reyvow`, `both`, or empty; `emergency_group` in `medical`, `self_harm`, `both`, or empty; `emergency_phrase_ids` (list of text); `emergency_case` in `informational`, `happening_now`, `unclear`, or empty; `review_status` "Starts `not_reviewed`"; `grading_attempts` "0 to 5"; `source` `real` or `test`; `test_runs.status` `running`, `passed`, `failed`, `incomplete` (the grader was down for at least one answer, T059); `test_runs.answer_model` and `test_runs.grader_model` both required (FR-045); `test_runs.pointer_rate` a number from 0 to 1 (filled in by T042, SC-004). **No column defaults** on `log_entries`: the log writer (T046) fills in every field, including `review_status`, so a blank or non-English row stays truly empty (FR-055). **Rule for rows with no question** (FR-055): a row whose `scrubbed_question` is empty must have every field except `id`, `created_at`, and `answer_type` empty; every other row must have a `scrubbed_question`. **No column may hold the raw question.** Server-only access for now (T051 adds reviewer read access).
  - Tests: `tests/fast/db/log-schema.test.ts`: bad `answer_type` rejected; `grading_attempts = 6` rejected; a row with a question but no `review_status` is rejected (no default); `test_runs.status = 'incomplete'` is accepted; a `test_runs` row with no `grader_model` is rejected; a row with no question but a `source` or `answer` filled in is rejected; a row with only `id`, `created_at`, `answer_type` is accepted.
  - Needs: T007.
- [ ] T009 [P] **Startup exception.** Create `src/config/models.ts` (answer model `claude-haiku-5-5`, its company `anthropic`; grader model ID written in this file, never read from a setting, and left empty until T063 picks it; its company `openai`) and `src/lib/db/client.ts` (server-only Supabase client using the service role key; import guard so it can never load in the browser).
  - Tests: —
  - Runs alongside: T010, T012. Needs: T001.
- [ ] T010 [P] **Startup exception** (`scripts/seed-labels.ts` is AI-related). Save real openFDA label replies as fixtures: `tests/fixtures/openfda/emgality.json`, `tests/fixtures/openfda/reyvow.json` (public label data, not patient data). Add `scripts/seed-labels.ts` (`npm run db:seed`) that loads them into the local database as the current labels.
  - Note: Node 22.23.5 runs this script directly (`node scripts/seed-labels.ts`) by stripping out the TypeScript type labels. So every import needs its full `.ts` file ending (for example `../src/lib/labels/store.ts`, not `../src/lib/labels/store`), and the script and the files it imports can't use `enum` or `namespace`.
  - Tests: —
  - Runs alongside: T009, T012. Needs: T007.
- [ ] T011 **Startup exception.** Create `src/lib/labels/sections.ts` (fixed map from openFDA field to display name, research R7, e.g. `warnings_and_cautions` → "Warnings and Precautions"; skips empty fields) and `src/lib/labels/store.ts` (`getCurrentLabel(drug)` returns label date and sections).
  - Tests: `tests/fast/labels/sections.test.ts`: known fields get the right names; empty fields are skipped; `getCurrentLabel` returns the seeded label and date.
  - Runs alongside: T012. Needs: T009, T010.
- [ ] T012 [P] **Startup exception.** Create the AI client interface `src/lib/ai/types.ts` (answer client and grader client shapes), the **`ScrubbedText`** branded type in `src/lib/scrub/types.ts` (a type that plain strings can't pass as; only `scrub()` in T033 makes real ones), and `tests/helpers/fake-ai.ts` (returns fixed replies and records every call, so tests can prove the AI was or wasn't called).
  - Tests: a type test (`// @ts-expect-error`) proves a plain string can't be used as `ScrubbedText`.
  - Runs alongside: T009, T010, T011.
- [ ] T013 **Startup exception.** Create the ordered question steps `src/lib/pipeline/ask.ts` (empty slots for: emergency, basic checks, scrub, refusals, section search, answer AI, answer checks, log, grading sample), the language check `src/lib/pipeline/language.ts` (`franc-min`; shared with the emergency path in T047), and `src/app/api/ask/route.ts` per contracts/api.md: `zod` request check; every reply has `"disclaimer": "LabelTrace is an AI, not a doctor."`; blank → `kind: "prompt_for_question"`; over 1,000 characters → cut, `truncated: true`; non-English → `kind: "english_only"` with "I can only answer in English right now." The route never logs, stores, or echoes the raw question.
  - **Short questions** (FR-055): a question under 30 characters counts as English only if every word is an English word, a drug name (T024's lists), or a number. Write `scripts/build-english-words.ts`, which downloads a **published** English word list (never written from memory) and saves it to `src/lib/pipeline/english-words.json` with its source URL, download date, and count. Fill in research.md R19 with the source, the exact URL, the download date, and the number of words.
  - Tests: `tests/fast/pipeline/basic-checks.test.ts`: blank, 1,001-character, and Spanish questions; disclaimer on every reply kind; **"chest pain?" counts as English**; **"¿Reyvow causa náuseas?" → `english_only`**; `english-words.json` records its source URL and date.
  - Runs alongside: T014. Needs: T012.
- [ ] T014 [P] Create the shared layout `src/app/layout.tsx` with a visible "LabelTrace is an AI, not a doctor." banner on every page (FR-003), and a simple question page `src/app/page.tsx` that posts to `/api/ask`.
  - Tests: `tests/fast/ui/banner.test.tsx`: banner is present on the question page.
  - Lint: Add React and Next.js lint rules. Pick the exact package(s) during T014 after confirming they support the project's ESLint and TypeScript versions, and run npm audit. Files: `eslint.config.mjs`, `package.json`, `package-lock.json`.
  - Runs alongside: T013. Needs: T001.
- [ ] T071 **Owner task**: set up the online database and GitHub secrets (research R16).
  1. Create the online Supabase project. Turn off public sign-up. Apply migrations 0001 and 0002 (and every later one, T082).
  2. Create a **read-only** database login that can only read `test_runs`. Save its connection string as the GitHub secret `AI_GATE_DATABASE_URL`. (The grader tables don't exist yet; T086 adds read access to them after T055.)
  3. Create a GitHub environment `ai-tests` that needs your approval for each run. Put in it: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, the online `NEXT_PUBLIC_SUPABASE_URL`, and the online `SUPABASE_SERVICE_ROLE_KEY`. (No grader-model setting: the model is in `src/config/models.ts`.)
  4. Never put the online admin key in a local `.env` file.
  - Needs: T008.
- [ ] T072 **Owner task**: set up the Netlify site (research R2, R21). Connect the repo, turn on deploy previews for PRs, and **turn off automatic publishing of `main`** (the live site is published only by the release workflow). Add the app's secrets (Anthropic, OpenAI, online Supabase keys) as Netlify environment variables, with test keys for deploy previews.
  - Needs: T001.
- [ ] T025 [P] **Startup exception** (`tests/ai/**` is AI-related). Create the AI-tier answer-key loader `tests/ai/questions/load.ts` with a `zod` shape matching data-model.md "Test questions and answer key". `category` in `normal`, `refusal_dosing`, `refusal_compare`, `refusal_other_drug`, `not_covered`, `three_ways`, `privacy`, `emergency`. Blank and non-English questions are refused (research R15). `checked_by / checked_on` "**Required.** The loader refuses any entry without them" (FR-044, constitution VIII). *(Moved here from US2.)*
  - Tests: `tests/fast/ai-key/loader.test.ts`: an entry without `checked_by` is refused; a bad category is refused; a blank question is refused; a good entry loads.
  - Runs alongside: T056. Needs: T001.
- [ ] T056 [P] [US9] **Startup exception.** Create the grader prompt `src/lib/prompts/grader-v1.ts` and client `src/lib/ai/grader.ts` (`openai` SDK; model from `src/config/models.ts` only). The client refuses to start if the grader model is empty or if the grader's company equals the answer model's company (FR-034). Input: the scrubbed question (`ScrubbedText` only), the label sections behind the answer (for emergency replies, the sections of any label sentences shown; may be none), and the answer. Output: `pass` or `fail` plus a short reason. The prompt says the fixed emergency messages (911 and 988) and the "talk to your doctor or pharmacist" wording are app text, not label facts, so they don't count against the answer. *(Moved here from US9.)*
  - Tests: `tests/fast/ai/grader-client.test.ts` (mocked SDK): same-company config throws; empty grader model throws; the request contains no raw personal details; reply shape is checked.
  - Runs alongside: T025. Needs: T009, T012.
- [ ] T063 [US9] **Startup exception.** Create the grader calibration set `tests/ai/grader/calibration.json` (10 hand-made answers: 5 that stick to the label, 5 with a known mistake such as an added fact or a wrong section) and `tests/ai/grader/calibrate.test.ts`. Pick the smallest OpenAI model that catches all 5 bad answers and passes at least 4 of the 5 good ones. **Calibration runs locally, by hand** (the runner T073 doesn't exist yet): use your own `OPENAI_API_KEY` from `.env`, try models from smallest up, and record each model tried, its result, and the run date in research.md R4. **Write the chosen model ID into `src/config/models.ts`** (the only place it's set). These are the AI tier's **first checked entries**: the owner signs them off (T066). The first `ai-tests` run (T073, on T015's PR) includes them, so it re-confirms the chosen model on GitHub. *(Moved here from US9.)*
  - Tests: the calibration set itself (AI tier), run by hand now and again in the first `ai-tests` run.
  - Needs: T025, T056.
- [ ] T073 **Startup exception.** Create the AI-tier runner and test-run recorder: `tests/ai/setup.ts` and `.github/workflows/ai-tests.yml`. It runs **on pull requests** (the PR's latest commit) **and by hand** (inputs: branch, `model`). Every run uses the `ai-tests` environment, so it waits for the owner's approval before it can read any secret key (research R16). **The owner approves no `ai-tests` run until T068 is done**, so the first passing run always comes after `ai-gate` is a required check. Each run creates a `test_runs` row in the **online** database (commit, branch, answer model, grader model; FR-045), runs every checked entry (calibration set now; each story adds more), and finishes the row with passed/failed/total. A run is `passed` only if **at least one** checked entry ran and all passed (research R15, FR-045). Put the pass rule in a pure function in **`src/lib/ci/run-status.ts`** (on the AI-related list) so it can be tested, and call it from `tests/ai/setup.ts`. **The first passing run must include the signed-off calibration entries (T063)**; they count as human-checked entries for ending the startup exception (spec Clarifications 2026-11-16, T084).
  - Tests: `tests/fast/ai/test-run-recorder.test.ts` (fake AI, fake database): 0 entries → `failed`; all pass → `passed`; one fails → `failed`; a run with only the signed-off calibration entries, all passing → `passed`; an unsigned calibration entry is refused by the loader, so it isn't counted; the row records commit and model. A check on `ai-tests.yml` confirms it has both a `pull_request` and a `workflow_dispatch` trigger and that its job uses `environment: ai-tests`.
  - Needs: T008, T025, T063, T071.
- [ ] T084 Close the startup exception (constitution III, v3.0.0). As soon as T073 is merged **and** one AI test run passes with at least 1 checked entry, open a PR that changes the Status line in spec.md, "PRs merged under the startup exception", to: **Status: ended on [date]** by the passing `test_runs` row **[test_runs ID]**. Use the date and ID of the first passing run after T073 merged. The owner confirms the ID in the online database. From then on, every AI-related PR needs a passing AI test run.
  - Tests: — (the passing `test_runs` row is the proof)
  - Needs: T073, T068, and the first passing AI test run (on T015's PR, after T068).
- [x] T083 Add `.github/workflows/**`, `scripts/ai-gate.ts`, and `src/lib/ci/**` to `.github/ai-related-paths.txt`. (Done in PR #13, 2026-11-15.) PR #13 merged **without** a passing AI test run while constitution v2.0.0 was in force. That is a rule break, recorded in `docs/rule-incidents.md`. **Late check:** the first passing `ai-tests` run on a `main` commit that includes `ac46453` (PR #13's change), after T073 is merged **and T068 is done**. (Running on `ac46453` itself isn't possible: that commit has no `ai-tests` workflow or runner.) Record the `test_runs` ID, the commit, and the date in that incident row.
  - Tests: the late-check `test_runs` row. After T015 exists, its every-pattern test also covers the new lines.
- [ ] T015 Create `.github/workflows/ai-gate.yml` (check name `ai-gate`, every PR) with `scripts/ai-gate.ts`, **part 1** (FR-045): read **`.github/ai-related-paths.txt`** each run (never a copied list; skip `#` comments and blank lines; `**` means everything in that folder); if any changed file matches, require a `test_runs` row for the PR's latest commit with `status = passed` **whose `answer_model` and `grader_model` both match `src/config/models.ts` at that commit**. This PR can't use the startup exception: `ai-gate` fails on it first, the owner makes it required (T068), and only then approves the first `ai-tests` run, on this PR's latest commit. Reads results with `AI_GATE_DATABASE_URL` (read-only). Put the decision in a pure function `src/lib/ci/gate.ts` so it can be tested.
  - Tests: `tests/fast/ci/ai-gate.test.ts`: README-only change → pass; for **every** pattern in the real `.github/ai-related-paths.txt`, a matching file with no run → fail with "Run the ai-tests workflow on this commit" (so adding a line to the list automatically adds a test); a change to `.github/ai-related-paths.txt` itself with no run → fail; prompt change with a passed run → pass; **prompt change whose only run is `incomplete` (grader was down) → fail** with "The AI test run is incomplete. Run the ai-tests workflow again"; **a passed run whose answer model or grader model doesn't match `src/config/models.ts` at that commit → fail** with "The AI test run used a different model than src/config/models.ts. Run the ai-tests workflow with the configured models"; comment lines are ignored.
  - Needs: T008, T073.
- [ ] T068 **Owner task**: right after `ai-gate` first runs on T015's PR (it fails there, because no `ai-tests` run has been approved yet), add `ai-gate` as a required check in branch protection for `main` (research R17). **Only then** approve the first `ai-tests` run, on T015's latest commit. That run is the one that can end the startup exception (T084). *(Moved here from Polish.)*
  - Needs: T015.
- [ ] T074 Create `.github/workflows/release.yml` (runs on `v*` tags; uses the `release` environment) and `scripts/release-check.ts`: (1) fail with "Only the owner can release" unless the tag was pushed by `alexcaldwelll`; (2) use `src/lib/ci/gate.ts` to require a passing `test_runs` row for the tagged commit (the grader-flag check is added in T062, and the pointer-rate check in T042); (3) publish that commit to Netlify's live site using the `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets (research R21).
  - Tests: `tests/fast/ci/release-check.test.ts`: tag by the bot → fail; no run → fail with "Run the ai-tests workflow on this commit before releasing"; failed run → fail; passed run with a model that doesn't match `src/config/models.ts` at the tagged commit → fail; passed run with matching models, owner tag → pass.
  - Needs: T015.
- [ ] T075 **Owner task**: lock down releases (research R17, R21).
  1. Add a tag ruleset for `v*`: restrict creations and deletions, block force pushes, and put **only** `alexcaldwelll` on the bypass list (not the bot).
  2. Create a GitHub environment `release` that needs your approval. Put `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` in it. Never put them in a file.
  - Needs: T072, T074.

**Checkpoint**: Foundation ready. `fast-tests` and `ai-gate` are required checks, the AI
tier runs and saves results online, and only the owner can release. Story work can begin.
(T083 is done in PR #13; its late check is the first passing AI test run on a `main`
commit that includes PR #13's change, after T073 and T068.)

---

## Phase 3: User Story 1 — Emergencies get urgent help, not an AI answer (Priority: P1) 🎯 MVP

**Goal**: Emergency phrases skip the AI and show the right message at once. Informational
medical questions also show the label's exact matching sentences.

**Independent Test**: Every phrase on the list shows the right message with 0 AI calls.
Informational, happening-now, unclear, and mixed questions show label text only for
informational medical questions.

All rules: [contracts/emergency-rules.md](contracts/emergency-rules.md). No AI anywhere in
this phase.

- [ ] T016 [P] [US1] Create text matching in `src/lib/text/match.ts`: normalize (lowercase, `’` → `'`, other punctuation → space, squash spaces), split into words, edit distance, and phrase matching with the typo allowance: "1–3 letters: exact only; 4–7 letters: off by at most 1 change; 8 or more letters: off by at most 2 changes". Words must appear next to each other, in order (FR-009).
  - Tests: `tests/fast/emergency/match.test.ts`: capitals; curly apostrophe; phrase inside a long sentence; a 3-letter word with one typo does **not** match; a 5-letter word off by 1 matches, off by 2 doesn't; a 9-letter word off by 2 matches.
  - Runs alongside: T017.
- [ ] T017 [P] [US1] Create the phrase list and exact messages in `src/lib/emergency/phrases.ts`: all 10 medical ids and 6 self-harm ids with their variants (contract section 2), and `MSG_911`, `MSG_988`, `MSG_NOT_COVERED` with the exact text from contract section 1 (FR-005, FR-006, FR-007). No skip list (contract section 3, rule 5).
  - Tests: `tests/fast/emergency/phrase-coverage.test.ts`: the **"every phrase has a test" check**. It reads every id in `phrases.ts` and fails if any id has no test in `tests/fast/emergency/phrases.test.ts` (FR-010).
  - Runs alongside: T016.
- [ ] T018 [US1] Create `src/lib/emergency/detect.ts`: `detectEmergency(rawText)` returns matched phrase ids and groups (`medical`, `self_harm`, or both).
  - Tests: `tests/fast/emergency/phrases.test.ts`: **one test per phrase id (16)**, using the main phrase and one variant; capitals, inside a long sentence, and a typo version (US1 scenario 4); US1 scenarios 1–3 with the spec's exact questions. `tests/fast/emergency/false-alarms.test.ts`: "paint", "saint", "painting", and "painted" in otherwise normal questions **do** return `fainting` (spec PC-6); the returned ids are exactly the ones that matched.
  - Runs alongside: T019, T020. Needs: T016, T017.
- [ ] T019 [P] [US1] Create `src/lib/emergency/classify.ts`: sort a medical match into `happening_now`, `informational`, or `unclear`, checking in that order (contract section 4; FR-047, FR-050). Happening-now words are whole words only: `i`, `i'm`, `im`, `me`, `my`, `we`, `now`, `today`, `having`, `right now`. Informational needs an exactly spelled drug name (`emgality`, `reyvow`, `galcanezumab`, `lasmiditan`) and a question word at the start or a `?` at the end.
  - Tests: `tests/fast/emergency/classify.test.ts`: each happening-now word; "Is" does not count as "I"; "worst headache of my life" → happening now; each of the 4 drug names → informational; "Does Reyvo cause chest pain?" → unclear; "reyvow chest pain" → unclear.
  - Runs alongside: T018, T020. Needs: T016.
- [ ] T020 [P] [US1] Create `src/lib/emergency/excerpts.ts`: for an informational medical question, map generic to brand (galcanezumab → emgality, lasmiditan → reyvow), split each section of the current saved label into sentences, and keep every sentence matching the **same phrase** with T016's rules. Return them word for word, grouped by section, with section name and label date. If none match, return "not covered" (FR-048).
  - Tests: `tests/fast/emergency/excerpts.test.ts` (fixture labels): chest pain in Reyvow returns the exact sentences; lasmiditan uses the Reyvow label; galcanezumab + trouble breathing uses the Emgality label; a phrase not in the label → not covered.
  - Runs alongside: T018, T019. Needs: T011, T016.
- [ ] T021 [US1] Create `src/lib/emergency/respond.ts`: build the `emergency` reply per contract section 5. Messages in order (`MSG_911` first, then `MSG_988`); `label_excerpts` only for medical-only + informational; `not_covered` true when no sentence matched; self-harm or both groups → `label_excerpts` always empty (FR-046, FR-049, FR-050, FR-051).
  - Tests: `tests/fast/emergency/scenarios.test.ts`: **US1 scenarios 5–17, one test each, with the spec's exact questions**; 911 is always before 988; any self-harm match → no label text.
  - Needs: T018, T019, T020.
- [ ] T022 [US1] Make the emergency check **step 1** in `src/lib/pipeline/ask.ts`, before basic checks, scrubbing, and everything else (FR-004). It runs on the full raw text in memory. A match returns the emergency reply immediately, without sending the question to the AI (FR-008).
  - Tests: `tests/fast/pipeline/emergency-first.test.ts`: the fake AI is called **0 times** for all 16 phrases and all 17 scenarios; an emergency phrase at character 1,200 of a 1,500-character question is still caught; emergency + dosing question → emergency wins; a Spanish question containing "chest pain" still shows `MSG_911`; emergency reply returns in under 1 second (SC-013).
  - Runs alongside: T023. Needs: T013, T021.
- [ ] T023 [P] [US1] Create `src/components/EmergencyReply.tsx` and use it in `src/app/page.tsx`: emergency messages at the very top, 911 above 988, then any label sentences with section name and label date, or "The label doesn't cover this."
  - Tests: `tests/fast/ui/emergency-reply.test.tsx`: messages render before anything else; 911 above 988; excerpts show section and date.
  - Runs alongside: T022. Needs: T014, T021.

**Checkpoint**: US1 works and is fully tested on its own with fast tests. This is the MVP. (Its AI-tier entries, T076, come at the end of Phase 6.)

---

## Phase 4: User Story 2 — Refuse what the label can't answer (Priority: P1)

**Goal**: Dosing, comparison, other-drug, and not-in-label questions get the right refusal,
never a guess.

**Independent Test**: Ask dosing, comparison, other-drug, and not-covered questions and
confirm each gets the right refusal.

- [ ] T024 [P] [US2] Build the drug name lists **from openFDA data, not from memory**. Write `scripts/build-drug-names.ts`, which queries the openFDA drug label endpoint: (a) brand and generic names of labels whose `indications_and_usage` mentions migraine (`count=openfda.brand_name.exact` and `count=openfda.generic_name.exact`), and (b) the most common brand and generic names overall (same count fields). Save the result to `src/lib/refusals/other-drugs.json`, removing our 4 names (`emgality`, `reyvow`, `galcanezumab`, `lasmiditan`). Put our names and the loader in `src/lib/refusals/drug-names.ts`. Fill in **research.md R20** with the exact query URLs, the download date, and the number of names.
  - Tests: `tests/fast/refusals/drug-names.test.ts`: our 4 names are never on the other list; Imitrex (sumatriptan) and Ubrelvy (ubrogepant) are on it; the JSON file records its source URL and date.
- [ ] T026 [US2] Create refusal rules in `src/lib/refusals/rules.ts` (no AI, research R14). **Drug names are matched with T016's typo rules** (FR-013, FR-056): a word that is a near-miss of an other-drug name counts as that drug; a word that is a near-miss of one of our 4 names counts as that drug, and the reply carries `typed_as` (the word as typed) so the page shows "Answering about Reyvow (you typed 'Reyvo')." An exact match always wins over a typo match. This applies only to normal questions; the emergency path still uses exact names (PC-1). Rules (FR-001, FR-012, FR-019): other drug named → `other_drug`; comparison words ("better than", "vs", "compared to", "instead of") with two drug names → `comparison`; the word **"or" counts only inside comparison phrasing** (with "which", "better", "best", "worse", "stronger", "safer", "choose", or "should I take/use … or …"); personal-dosing patterns ("how much should I", "my weight", "I weigh", "for my age") → `personal_dosing`; no drug named → `ask_which_drug`; both our drugs named without comparison phrasing → pass through with `drug = both`.
  - Tests: `tests/fast/refusals/rules.test.ts`: US2 scenarios 1–3 with the spec's exact questions; "Does it cause nausea?" → ask which drug; "How are Emgality and Reyvow given?" → not refused, `both`; **"How are Emgality or Reyvow given?" → not refused, `both`**; "Which is better, Emgality or Reyvow?" → `comparison`; "Should I take Emgality or Reyvow?" → `comparison`; **"Is Imitrx safe?" → `other_drug`**; **"Is Reyvow better than Imitrx?" → `comparison`**; **"Does Reyvo cause nausea?" → not refused, `drug = reyvow`, `typed_as = "Reyvo"`**; "Does lasmiditen cause nausea?" → `drug = reyvow`, `typed_as = "lasmiditen"`; "Does Reyvow cause nausea?" → no `typed_as`.
  - Needs: T016, T024.
- [ ] T027 [US2] Create `src/lib/refusals/respond.ts` and add refusals as **step 4** in `src/lib/pipeline/ask.ts`. Comparison and other-drug replies are rule-based text with "talk to your doctor or pharmacist" and no AI call (FR-012). `ask_which_drug` follows FR-019; personal dosing follows FR-011. `ask_which_drug` → "Do you mean Emgality or Reyvow?". **Personal dosing**: "Ask your doctor or pharmacist" plus a plain-language summary of the label's "Dosage and Administration" section written by the answer AI from that section only, with `sections[]` and `label_date` (contracts/api.md `refusal` shape). Create its own prompt **`src/lib/prompts/dosing-v1.ts`** (version id `dosing-v1`): summarize only the given section, in plain language at an 8th-grade level, 120 words or fewer; general label dosing only, never advice for this person; copy every number and unit exactly from the label. The reply records `prompt_version = dosing-v1` for the log (T047). Uses the fake AI until T039 exists. Once T038/T044 exist, the summary also passes the word-count, reading-level, and citation checks (wired in T040).
  - Tests: `tests/fast/pipeline/refusals.test.ts`: each refusal kind returns the right `reason` and wording; fake AI called 0 times for comparison, other drug, and which drug; dosing reply has "Ask your doctor or pharmacist", a section, and a label date; the dosing call uses the `dosing-v1` prompt and the reply carries `prompt_version = dosing-v1`; `dosing-v1.ts` exports its version id.
  - Needs: T013, T026.
- [ ] T028 [US2] Create the dosing **number check** in `src/lib/checks/dosing-numbers.ts` and use it in the dosing reply. Every number and unit pair in the AI's dosing summary (e.g. `120 mg`, `1 mL`, `once monthly`, `2 doses`) must appear **exactly** in that drug's saved "Dosage and Administration" section text. The only allowed difference is spacing (`120 mg` = `120mg`). If **any** number or unit doesn't match, the summary fails the answer checks, or the AI is down, fall back to showing the section text **word for word** with section name and label date, plus "Ask your doctor or pharmacist". This word-for-word fallback is on purpose (spec PC-7: Safe over Fair and Equitable).
  - Tests: `tests/fast/checks/dosing-numbers.test.ts`: summary with numbers that match the label → AI summary shown; summary with a wrong number (`240 mg` when the label says `120 mg`) → word-for-word fallback; a wrong unit (`mL` vs `mg`) → fallback; a number not in the label at all → fallback; AI down → fallback; the fallback text exactly equals the stored section text.
  - Needs: T027.
- [ ] T029 [US2] Add "not covered" and the AI safety net to `src/lib/pipeline/ask.ts`: if the AI marks its answer `not_covered` → reply `kind: "not_covered"`, `text: "The label doesn't cover this."` with drug and label date; if the AI marks it `refusal` → refusal reply. Never show a guess (FR-014). ("Not covered" is used only when the AI says the label doesn't answer. Failed checks use the label pointer instead, T040.)
  - Tests: `tests/fast/pipeline/not-covered.test.ts`: fake AI says `not_covered` → exact text; fake AI says `refusal` → refusal reply with doctor or pharmacist wording.
  - Needs: T028.

**Checkpoint**: US1 and US2 work. Nothing unsafe gets through the rules.

---

## Phase 5: User Story 5 — Remove personal details before the AI sees them (Priority: P2)

**Goal**: Names, emails, and phone numbers are masked before any AI sees the question, and
the raw question is never stored.

**Why it's here**: Moved ahead of US3 at the owner's request, so the scrubber exists before
the real answer AI is connected (T039). No real AI call ever gets unscrubbed text, even in
development.

**Independent Test**: Send questions with made-up names, emails, and phone numbers. The AI
gets only masked text, and the raw text is found nowhere in storage.

All personal details in tests are made up (FR-022).

- [ ] T031 [P] [US5] Create `src/lib/scrub/email.ts` (standard email pattern → `[EMAIL]`) and `src/lib/scrub/phone.ts` (US and international formats → `[PHONE]`).
  - Tests: `tests/fast/scrub/email-phone.test.ts`: `jane@example.com`; `555-123-4567`; `(555) 123 4567`; `+44 20 7946 0958`; a dose like `120 mg` is **not** masked.
  - Runs alongside: T032.
- [ ] T032 [P] [US5] Create `src/lib/scrub/names.ts` with three layers (research R10): intro phrases ("I'm X", "my name is X", "this is X", "thanks, X"); `compromise` name finding; any capitalized word that isn't at the start of a sentence and isn't on the known-word list → `[NAME]`. The known-word list holds our 4 drug names, **every name in `src/lib/refusals/other-drugs.json`** (loaded through T024's `drug-names.ts`), label section names, and common English words. A known word is never masked, even if `compromise` flags it. **Near-miss drug names (spec PC-9):** a word that is a near-miss typo of a drug name on the known-word list (T016's typo rules) is also not masked, **unless** it is on the common first-name list, in which case it is always masked. When unsure about any other word, mask.
  - **Common first-name list**: write `scripts/build-first-names.ts`, which downloads the U.S. Social Security Administration's national baby-name data (research R22) and saves every name with at least 1,000 recorded births in total to `src/lib/scrub/common-first-names.json`, with the source URL, download date, and count. The list comes from that data, **never written from memory**. Fill in research.md R22 with the exact URL, the download date, and the number of names.
  - Tests: `tests/fast/scrub/names.test.ts`: "Hi, I'm Jane Doe"; "my name is Sam Lee"; "thanks, Pat"; an unknown capitalized word mid-sentence → masked; "Emgality", "Reyvow", and "Warnings and Precautions" are not masked; **"Imitrex", "Ubrelvy", and "sumatriptan" mid-sentence are not masked**; **"Imitrx" and "Reyvo" mid-sentence stay visible**; **a common first name one letter off a drug name stays masked**. That test searches the real `common-first-names.json` for names within one change of a drug name on the known-word list and checks each one is masked. If the real lists have no such pair, it uses a small made-up fixture pair instead, so the test always checks something. Also: `common-first-names.json` records its source URL and date.
  - Runs alongside: T031. Needs: T016, T024.
- [ ] T033 [US5] Create `src/lib/scrub/index.ts` (`scrub(raw)` returns a **`ScrubbedText`** (the branded type from T012), so other code can tell scrubbed text apart from raw text; FR-020) and add scrubbing as **step 3** in `src/lib/pipeline/ask.ts`, right after the emergency check and basic checks, before refusals and any AI. Blank and non-English questions stop at step 2 and are never scrubbed.
  - Tests: `tests/fast/privacy/scrub-pipeline.test.ts`: US5 scenario 1 → the fake AI receives `[NAME]`, `[EMAIL]`, `[PHONE]` and none of the raw details; a spy on `console.*` and on the server logger (T078) never sees the raw text, including when the AI throws.
  - Needs: T013, T031, T032.
- [ ] T077 [US5] Run the refusal rules on **scrubbed** text. Create `tests/fast/refusals/rules-after-scrub.test.ts`: every question in `tests/fast/refusals/rules.test.ts` is passed through `scrub()` first and must get the same result. Includes "Is Reyvow better than Imitrex?" → `comparison` and "What are the side effects of Ubrelvy?" → `other_drug`, plus a version with a made-up name and phone number added.
  - Tests: this file.
  - Needs: T026, T033.
- [ ] T078 [P] [US5] Create the only server logger `src/lib/log/server-log.ts` (research R18): writes to Netlify's function logs; accepts question text only as `ScrubbedText`; takes **no** question text for blank and non-English questions; logs errors by type and message only, never the request body. There is no outside error-reporting service.
  - Tests: `tests/fast/log/server-log.test.ts`: a plain string can't be passed as the question (type test); an error with the raw question in its message is logged without it; blank and non-English calls write no question text.
  - Runs alongside: T077. Needs: T012.
- [ ] T034 [US5] Create `tests/fast/privacy/raw-search.test.ts`: run every privacy question (and one emergency question that contains made-up personal details) through the pipeline, then search **every text and JSON column in every table** of the local database for each raw string and each raw personal detail (SC-006).
  - Tests: this file; it must find 0 matches. It becomes a stronger check once US6 writes log rows (re-run in T047).
  - Needs: T033.

**Checkpoint**: Scrubbing is in place before any real AI is connected. Drug names survive
scrubbing, so refusals still work.

---

## Phase 6: Grading test answers (before the first test answer from a story)

**Purpose**: The constitution says the second-AI grader must grade **every** test answer,
and changes with flagged answers can't merge until the owner records a decision. The first
test answers from a story come from the AI-tier entries for US1, US2, and US5, so the owner's
login, the grader tables, and the flag-decision pages must exist first. T059 scrubs each
test question with `scrub()` (T033), so this phase comes after US5. The grading tasks come
from US8 and US9. The AI-tier entries T076 (US1), T030 (US2), and T035 (US5) moved here
from their stories and come last, after T059. All of these keep their IDs. They hold only
entries that don't need the answer AI. The entries that do (dosing, not covered, and
normal questions with personal details) are in T087, after T040.

- [ ] T051 [US8] Migration `supabase/migrations/0003_reviewers.sql`: `reviewers` (`role` "`reviewer` or `owner`", `active`) and `review_decisions` (`decision` `approve` or `flag`; `reviewer_id` "Required (FR-031)"; `reason` "**Required when `flag`** (FR-032)"; `decided_at` required). Access rules (FR-029): active reviewers and the owner can read `log_entries`; patients and the public can't. Turn off public sign-up in `supabase/config.toml`.
  - Tests: `tests/fast/db/review-rls.test.ts`: the anonymous client can't read `log_entries`; an inactive reviewer can't; an active reviewer can; a `flag` row with no reason is rejected.
- [ ] T079 **Owner task**: after T051 is applied online (T082), create your own login in the online Supabase project and add your `reviewers` row with `role = owner`, `active = yes`.
  - Needs: T051.
- [ ] T052 [US8] Create `src/lib/auth/session.ts` (`@supabase/ssr`; `requireReviewer()` and `requireOwner()`, where owner counts as reviewer, FR-033) and the login page `src/app/login/page.tsx` (email and password).
  - Tests: `tests/fast/review/session.test.ts`: signed out → 401; inactive → 403; owner passes `requireReviewer`.
  - Needs: T051.
- [ ] T055 [US9] Migration `supabase/migrations/0004_grader.sql`: `grader_results` (`grade` `pass` or `fail`; `source` `real` or `test`; `needs_owner_decision` "Yes when `grade = fail` (FR-037)") and `owner_flag_decisions` ("One decision per flag", unique on `grader_result_id`; `owner_id` "Must have role `owner`"; `reason` "Required (FR-038)"). Only the owner can insert decisions.
  - Tests: `tests/fast/db/grader-schema.test.ts`: a second decision on the same flag is rejected; a reviewer (not owner) can't insert; a decision with no reason is rejected.
  - Needs: T051.
- [ ] T086 **Owner task**: after T055 is applied to the online database (T082), give the read-only `AI_GATE_DATABASE_URL` login read access to `grader_results` and `owner_flag_decisions` too (it already reads `test_runs`, T071). Check that it still can't insert rows or read `log_entries` (quickstart.md, read-only gate login).
  - Needs: T055, T082.
- [ ] T059 [US9] Extend the AI-tier recorder (`tests/ai/setup.ts`, T073): grade **every** test answer right away with the T056 client (FR-035, constitution Release Safeguards), **including emergency replies and rule-based refusals**, not only AI-written answers. The test question is scrubbed (`scrub()`, T033) before it goes to the grader. Grading happens in the runner **after** the pipeline has made its reply, so the reply itself still calls no AI (SC-001, SC-014). Save results to `grader_results` with `source = test`. A failed **grade** does not fail the test (FR-037). **If the grader is down for any test answer, the run ends as `incomplete`** (not `passed`), so `ai-gate` and the release check block it until a complete run passes.
  - Tests: `tests/fast/grading/test-run-recorder.test.ts` (fake AI and fake grader): every test answer gets a grade; a failed grade leaves the run `passed` and creates a flag; **an emergency entry gets a grade, and the pipeline's fake AI is still called 0 times for it**; a rule-based refusal entry gets a grade; **the grader throwing on one answer → run `incomplete`**, even if every answer passed its checks.
  - Needs: T055, T056, T073.
- [ ] T060 [US9] Create owner routes `src/app/api/owner/flags/route.ts` (GET, filter `source`), `src/app/api/owner/flags/[grader_result_id]/decision/route.ts` (POST; reason required; second decision → 409), and `src/app/api/owner/grader-summary/route.ts` (total, disagreements, rate, `by_month`; FR-039).
  - Tests: `tests/fast/owner/api.test.ts`: reviewer → 403; no reason → 400; second decision → 409; 6 disagreements out of 40 → rate 0.15 with the right month counts; 0 decisions → rate 0 with no error.
  - Needs: T052, T055.
- [ ] T061 [P] [US9] Create owner pages `src/app/owner/flags/page.tsx` and `src/app/owner/grader-summary/page.tsx` (shows `grading_gave_up` entries and the disagreement rate).
  - Tests: `tests/fast/ui/owner-pages.test.tsx`: a non-owner is blocked; the rate is displayed.
  - Runs alongside: T062. Needs: T060.
- [ ] T062 [P] [US9] Extend `src/lib/ci/gate.ts` and `scripts/ai-gate.ts` with **part 2** (FR-039): every `grader_results` row with `needs_owner_decision = yes` from the PR's run must have an `owner_flag_decisions` row. Fail message: "N grader flags need your decision". The release check (T074) uses the same code.
  - Tests: extend `tests/fast/ci/ai-gate.test.ts`: a passed run with 3 undecided flags → fail with "3 grader flags need your decision"; all decided → pass. Extend `tests/fast/ci/release-check.test.ts` the same way.
  - Runs alongside: T061. Needs: T015, T055, T074, T086.

- [ ] T076 [P] [US1] Add a few AI-tier emergency entries in `tests/ai/questions/emergency.json` (category `emergency`): one medical informational, one happening now, one self-harm, one mixed. The AI runner sends them through the real pipeline with the real clients set up and checks that **the pipeline calls no AI client** while making the reply and the right messages show. Afterward, the runner sends each finished reply to the grader (T059). Owner signs off (T066).
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T030, T035. Needs: T022, T059.
- [ ] T030 [P] [US2] Add AI-tier refusal questions in `tests/ai/questions/refusals.json` that don't need the answer AI: "Is Reyvow better than Emgality?", "Is Reyvow better than Imitrex?", and "What are the side effects of Ubrelvy?". (Personal dosing and not covered need the answer AI, so they're in T087.) Owner signs off `checked_by` / `checked_on` in the same PR (T066).
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T076, T035. Needs: T025, T059.
- [ ] T035 [P] [US5] Add AI-tier privacy questions in `tests/ai/questions/privacy.json` that don't need the answer AI (made-up details only), for example "I'm Jane Doe, 555-123-4567. Is Reyvow better than Emgality?" and an emergency question with a made-up name and email. (US5 scenario 1 is a normal question, so it's in T087.) Owner signs off in the same PR (T066).
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T076, T030. Needs: T025, T059.

**Checkpoint**: Every test answer will be graded, and the owner can decide flags
before anything merges. The AI-tier entries for US1, US2, and US5 that don't need the
answer AI are in place.

---

## Phase 7: User Story 3 — Plain-language answers (Priority: P1)

**Goal**: Normal questions get a short, easy answer drawn only from the label, within 9
seconds.

**Independent Test**: Ask side-effect, how-it's-given, and storage questions. Each answer is
120 words or fewer and grade 9 or lower, or points to the label section if it can't be.

- [ ] T036 [P] [US3] Create `src/lib/labels/synonyms.ts` (everyday words → label words: "shot" → "injection", "throw up" → "vomiting", "side effects" → "adverse reactions", and more) and `src/lib/labels/retrieve.ts` (keyword scoring with synonyms and T016 typo matching; top 3 sections, up to about 4,000 tokens; research R12).
  - Tests: `tests/fast/labels/retrieve.test.ts`: "shot" finds the injection section; "throw up" finds vomiting; "side efects" (typo) finds Adverse Reactions; the medical, everyday, and typo versions of one question pick the same top section; never more than 3 sections.
  - Runs alongside: T037, T038.
- [ ] T037 [P] [US3] Create the answer prompt `src/lib/prompts/answer-v1.ts` (version id `answer-v1`; use only the given label text, never the AI's own memory (FR-002); plain language, 8th grade; 120 words or fewer; never compare drugs; never give personal advice; mark `not_covered` or `refusal` when needed) and the fixed answer shape in `src/lib/ai/answer-schema.ts` (`zod`: answer text, sections used, answer type).
  - Tests: `tests/fast/ai/answer-schema.test.ts`: missing fields are rejected; the prompt exports its version id.
  - Runs alongside: T036, T038.
- [ ] T038 [P] [US3] Create `src/lib/checks/word-count.ts` (120 or fewer, FR-015) and `src/lib/checks/reading-level.ts` (Flesch-Kincaid grade using `syllable`; drug names and section names are left out of the score; pass at grade 9 or lower, FR-016).
  - Tests: `tests/fast/checks/answer-checks.test.ts`: 120 words passes, 121 fails; a known grade-6 sample passes; a known grade-14 sample fails; a sentence repeating "galcanezumab" isn't pushed over by the drug name.
  - Runs alongside: T036, T037.
- [ ] T039 [US3] Create the real answer AI client `src/lib/ai/anthropic.ts` using `@anthropic-ai/sdk`, model from `src/config/models.ts`, structured output with T037's shape. It takes a **deadline** from the pipeline and sets its timeout to the time left minus 0.5 seconds (research R13). Its input type **accepts only `ScrubbedText`** (from T033), so code that passes raw text won't compile.
  - Tests: `tests/fast/ai/anthropic-client.test.ts` (mocked SDK, no real call): timeout → error the pipeline turns into `try_again`; the timeout follows the deadline; the model name comes from config; a type test (`// @ts-expect-error`) proves passing a plain string fails to compile.
  - Needs: T033, T037.
- [ ] T040 [US3] Add the normal answer path to `src/lib/pipeline/ask.ts` (research R13, FR-052, FR-053):
  - A **9-second limit** for the whole reply, starting when the request arrives.
  - Section search → answer AI → word-count and reading-level checks.
  - **One retry only if at least 3 seconds are left.**
  - If the checks fail twice, or fail once with no time to retry → **label pointer**: "I couldn't put this into plain language reliably. The answer is in the [section name] section of the label (dated [date])." with `link: /label/[drug]#[field_key]`. The section is the first one the AI cited that exists in the saved label, else the top section from the search. **Never** "The label doesn't cover this" here.
  - First AI call runs out of time or the AI is down → `kind: "try_again"`, nothing made up.
  - Both drugs named without comparing → both drug answers run **at the same time** with the same deadline, one `answers` item each.
  - Personal-dosing summaries (T027) are made with the `dosing-v1` prompt, go through the same checks before the T028 number check, and use T028's fallback, not the pointer.
  - When T026 matched a misspelled drug name, the answer item carries `typed_as` (FR-056).
  - Tests: `tests/fast/pipeline/answer.test.ts` (fake AI with controllable delays): a too-long first answer, then a good one → good one shown as `type: "ai"`; bad twice → `label_pointer` with the cited section, date, and link, and the text never contains "doesn't cover"; bad once with only 2 seconds left → `label_pointer` with no second AI call; AI cites only a made-up section → pointer names the top search section; first call times out → `try_again`; both drugs → two items, and the two fake AI calls overlap in time (total time ≈ the slower one, not the sum); every reply is sent before 9 seconds.
  - Needs: T036, T038, T039.
- [ ] T080 [P] [US3] Create the label page `src/app/label/[drug]/page.tsx` (contracts/api.md "GET /label/{drug}"): shows the **saved** current label for `emgality` or `reyvow`, its label date, and every section with its display name and an anchor `id` equal to its `field_key`. Unknown drug → 404. Uses the shared layout, so the banner shows.
  - Tests: `tests/fast/ui/label-page.test.tsx`: each section has the right anchor; the label date shows; the banner shows; `/label/advil` → not found.
  - Runs alongside: T041. Needs: T011, T014.
- [ ] T041 [P] [US3] Create `src/components/AnswerReply.tsx` and use it in `src/app/page.tsx` for `answer` (including `label_pointer` items, with their link), `refusal`, `not_covered`, `ask_which_drug`, `try_again`, `prompt_for_question`, `english_only`.
  - Also show the long-question notice when the reply has `truncated: true`, and the "Answering about Reyvow (you typed 'Reyvo')." note when an answer item has `typed_as` (FR-056).
  - Tests: `tests/fast/ui/answer-reply.test.tsx`: each reply kind renders its text, with the banner still visible; a `label_pointer` item shows the section name, date, and a working link; **a reply with `truncated: true` shows the notice that the question was cut off**, and one without it doesn't; **an item with `typed_as: "Reyvo"` shows "Answering about Reyvow (you typed 'Reyvo')."**, and one without `typed_as` shows no note.
  - Runs alongside: T042, T080. Needs: T040.
- [ ] T042 [P] [US3] Add AI-tier questions `tests/ai/questions/normal.json` (side effects, how it's given, storage, for both drugs, plus "How are Emgality or Reyvow given?") and `tests/ai/questions/three-ways.json` (at least one `three_ways_group` per drug: medical words, everyday words, typos; FR-043). Create the AI test runner `tests/ai/answers.test.ts`: real pipeline, real answer AI; checks AI-written answers are 120 words or fewer and grade 9 or lower, expected facts present, and that the three versions in a group give the same facts. Every test answer is graded (T059). Owner signs off in the same PR (T066).
  - **Run report** (saved with the `test_runs` row and printed in the workflow summary):
    - **Pointer rate** (SC-004): the share of label answers that came back as `label_pointer` instead of an AI-written answer, saved as `test_runs.pointer_rate` (0 when the run had no label answers). On a PR, above 5% → a clear warning for the owner; it doesn't fail the run or block the merge. **On a release, above 5% fails the release check**: extend `src/lib/ci/gate.ts` and `scripts/release-check.ts` with this rule.
    - **Answer times** (SC-013): each answer's time from request to reply is recorded. The report shows the slowest 5% (the 95th percentile) next to the 10-second goal, and lists any answer over 9 seconds (FR-053).
  - Tests: this runner and these entries are the AI-tier tests. `tests/fast/ai/run-report.test.ts` (made-up results): 1 pointer in 20 → 5%, no warning; 2 in 20 → 10%, warning; 0 label answers → rate 0; the 95th-percentile time is worked out correctly for a known list of times. Extend `tests/fast/ci/release-check.test.ts`: passed run with pointer rate 0.10 → fail with "The label-pointer rate is above 5%"; pointer rate 0.05 → pass. Extend `tests/fast/ci/ai-gate.test.ts`: a PR run with pointer rate 0.10 → still passes `ai-gate`.
  - Runs alongside: T041. Needs: T025, T040, T059, T074.
- [ ] T087 [P] [US2] [US5] Add the AI-tier entries that need the real answer AI (moved here from T030 and T035):
  - In `tests/ai/questions/refusals.json`: personal dosing for each drug (including "How much Emgality should I take? I weigh 200 pounds"), and not covered for each drug (including "Can I take Reyvow on a plane?").
  - In `tests/ai/questions/privacy.json`: US5 scenario 1 ("Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does Emgality cause injection site pain?") and other normal questions with made-up details only.
  - The runner sends them through the real pipeline with the real answer AI. Every answer is graded (T059). Owner signs off in the same PR (T066).
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T041, T042. Needs: T030, T035, T040.

**Checkpoint**: The main job works. A real AI is connected, it only ever sees scrubbed text,
and every test answer it writes is graded.

---

## Phase 8: User Story 4 — Show where the answer came from (Priority: P1)

**Goal**: Every label-based answer names at least one real section and shows the label date.

**Independent Test**: Ask any normal question. The answer names a section that exists in
the saved label and shows the label date.

- [ ] T043 [US4] Create `src/lib/checks/citations.ts`: every cited section exists (present and not empty) in the saved label for that drug (FR-018); at least one section is cited and `label_date` is present (FR-017).
  - Tests: `tests/fast/checks/citations.test.ts`: real section passes; made-up section fails; no section fails; missing date fails; a section that exists only in the *other* drug's label fails.
- [ ] T044 [US4] Add the citation check to the answer checks in `src/lib/pipeline/ask.ts` (same retry and label-pointer rules as T040). Every `answers` item and every dosing refusal carries `sections[]` and `label_date`.
  - Tests: extend `tests/fast/pipeline/answer.test.ts`: every normal answer has at least 1 real section and a date; fake AI citing a made-up section twice → `label_pointer` naming the top search section (not "not covered").
  - Runs alongside: T045. Needs: T040, T043.
- [ ] T045 [P] [US4] Show section names and label date in `src/components/AnswerReply.tsx`. In `tests/ai/answers.test.ts`, check that `expected_sections` are cited and that every cited section exists.
  - Tests: extend `tests/fast/ui/answer-reply.test.tsx` (section and date visible); the AI-tier check above.
  - Runs alongside: T044.

**Checkpoint**: All P1 stories are done.

---

## Phase 9: User Story 6 — Log every answer (Priority: P2)

**Goal**: Every reply creates one complete log row, with no raw question.

**Independent Test**: Ask a question. One log row exists with all required fields.

- [ ] T046 [US6] Create `src/lib/db/log.ts`: `writeLogEntry()` with a `zod` shape matching data-model.md `log_entries` (FR-024, including which fields stay empty for emergency and rule-based replies). It takes the question only as `ScrubbedText` (or nothing). **Rows with no question** (blank, non-English, and non-English emergency; FR-055) store **only** `id`, `created_at`, and `answer_type`. Every other field is left empty. `grading_status` is `not_applicable` for emergencies, rule-based refusals, and `label_pointer` rows. **The writer fills in every field itself** (the database has no defaults, T008): rows with a question get `review_status = not_reviewed`. **A `try_again` reply is logged as `answer_type = error`.**
  - Tests: `tests/fast/log/log-writer.test.ts`: rejects a bad `answer_type`; an `english_only` row with question text, `answer`, or `source` is rejected; a plain string can't be passed as the question (type test); a row with a question gets `review_status = not_reviewed` from the writer; a blank row gets no `review_status`; a `try_again` reply → `answer_type = error`.
- [ ] T047 [US6] Write exactly one log row at **every** exit of `src/lib/pipeline/ask.ts` (FR-023).
  - **Emergency rows**: after the emergency reply is built and **before saving**, run the language check (`src/lib/pipeline/language.ts`). Not English → save only `id`, `created_at`, `answer_type = emergency` (FR-055). English → scrub the question, then save `answer_type = emergency`, **`answer` = the emergency messages that were shown, in order, plus any label sentences shown below them (or "The label doesn't cover this.")**, `ai_skipped = true`, `model_name` empty, `emergency_group`, `emergency_phrase_ids` (FR-054), `emergency_case`, `label_text_shown`, and when shown, `sections_used` and `label_date` (FR-025).
  - AI answers record `model_name` and `prompt_version`. Personal-dosing replies that show the AI summary record `prompt_version = dosing-v1`. `label_pointer` replies record the pointed-to section and date.
  - Tests: `tests/fast/log/every-reply.test.ts`: normal, label pointer, refusal (each kind), not covered, emergency (informational, happening now, unclear, self-harm, mixed), ask which drug, try again, **blank, and non-English** each → exactly 1 row with the right fields; blank and non-English rows hold only `id`, `created_at`, `answer_type`; English emergency rows hold the right `emergency_phrase_ids` (for example "Can I go painting after Reyvow?" → `["fainting"]`); an English informational emergency row's `answer` holds `MSG_911` and the exact label sentences; a mixed row's `answer` holds `MSG_911` then `MSG_988`; try again → `answer_type = error`. `tests/fast/log/non-english-emergency.test.ts`: a Spanish question containing "chest pain" → the reply shows `MSG_911` first, and its row holds only `id`, `created_at`, `answer_type = emergency`, with no question text and no phrase ids. Re-run `tests/fast/privacy/raw-search.test.ts` (T034), which now searches real log rows and must still find 0.
  - Needs: T046.

**Checkpoint**: Every reply is recorded for review, with no raw question.

---

## Phase 10: User Story 7 — Keep label data current without extra downloads (Priority: P2)

**Goal**: Labels are downloaded once and again only when openFDA has a newer date.

**Independent Test**: No saved label → one download. Same date → nothing downloaded. Newer
date → new label saved and used.

- [ ] T048 [US7] Add fixtures `tests/fixtures/openfda/no-matches.json` and `tests/fixtures/openfda/reyvow-newer.json` (the Reyvow fixture with a later `effective_time`).
  - Tests: —
- [ ] T049 [US7] Create `src/lib/labels/openfda.ts` (research R6; FR-026, FR-027, FR-028): `fetchInitial(drug)` uses the brand-name + Eli Lilly search and saves the record, `set_id`, and `effective_time`; `checkForNewer(drug)` asks only for the same `set_id` with `effective_time` after the saved date. A newer label → new `drug_labels` row; the old row's `is_current` becomes no. No match → nothing downloaded or saved. openFDA unreachable → keep the saved label and log the failed check through the server logger (no question text involved). Fetch is passed in, so tests never call openFDA.
  - Tests: `tests/fast/labels/freshness.test.ts`: no saved label → downloads and saves; same date → no full download and the `drug_labels` row count doesn't change (SC-008); newer → new row is current, old row kept, and a new answer shows the new date; network error → saved label still used.
  - Needs: T048.
- [ ] T050 [US7] Create `scripts/labels-fetch.ts` (`npm run labels:fetch`), `scripts/labels-check.ts` (`npm run labels:check`), and `netlify/functions/label-check.ts` (daily schedule) that all call T049's code.
  - Note: Node 22.23.5 runs `scripts/labels-fetch.ts` and `scripts/labels-check.ts` directly (`node scripts/….ts`) by stripping out the TypeScript type labels. So every import in those scripts needs its full `.ts` file ending (for example `../src/lib/labels/openfda.ts`, not `../src/lib/labels/openfda`), and the scripts and the files they import can't use `enum` or `namespace`.
  - Tests: `tests/fast/labels/label-check-function.test.ts`: the scheduled function calls `checkForNewer` for both drugs (fake fetch).
  - Needs: T049.

**Checkpoint**: Answers always use the current label, with no needless downloads.

---

## Phase 11: User Story 8 — Human review of answers (Priority: P3)

**Goal**: Reviewers sign in with their own login and approve or flag logged answers.
(Logins and the `reviewers` table were built in Phase 6.)

**Independent Test**: Sign in as a reviewer, approve one answer, flag another with a reason,
and confirm both are saved with name and time. Signed-out users are blocked.

- [ ] T053 [US8] Create `src/app/api/review/entries/route.ts` (GET; filters `status`, `type`, `page`; newest first) and `src/app/api/review/entries/[id]/decision/route.ts` (POST; saves reviewer and time; updates `review_status`; flag without reason → 400; FR-030).
  - Tests: `tests/fast/review/api.test.ts`: signed out → 401; inactive → 403; approve saves reviewer id and time and sets `approved`; flag without reason → 400; flag with reason → `flagged`; a later review changes the status and both decisions are kept.
  - Runs alongside: T054. Needs: T052.
- [ ] T054 [P] [US8] Create the review page `src/app/review/page.tsx` (list entries, approve, flag with a required reason box). Emergency entries show their matched phrase ids, so false alarms are easy to spot and flag (FR-054).
  - Tests: `tests/fast/ui/review-page.test.tsx`: signed out → sent to login; the flag button is disabled until a reason is typed; an emergency entry shows its phrase ids.
  - Runs alongside: T053.

**Checkpoint**: People can check answers.

---

## Phase 12: User Story 9 — Second-AI grader for real answers (Priority: P3)

**Goal**: The grader also checks a random 10% of real AI-written answers, including
personal-dosing summaries. (The grader client, test-answer
grading, flag decisions, and the disagreement rate were built in Phases 2 and 6.)

**Independent Test**: Send many real AI-written answers; about 10% are graded. Force a failed grade;
it's flagged for the owner.

- [ ] T057 [P] [US9] Create `src/lib/grading/sample.ts`: for real AI-written answers, **including personal-dosing replies that show the AI summary** (`prompt_version = dosing-v1`), a secure random number below 0.10 → `grading_status = waiting`, else `not_sampled` (FR-036). Emergencies, rule-based refusals (comparison, other drug, ask which drug), dosing replies that show the word-for-word fallback (PC-7), and `label_pointer` replies → `not_applicable`. Blank and non-English rows have no grading status. Call it from the log step.
  - Tests: `tests/fast/grading/sample.test.ts`: injected 0.09 → waiting, 0.10 → not sampled; a dosing reply with the AI summary and 0.09 → waiting; a dosing reply with the word-for-word fallback → not applicable; a comparison refusal → not applicable; emergency → not applicable; label pointer → not applicable; 10,000 real draws land between 8% and 12% (SC-010).
  - Needs: T047.
- [ ] T058 [US9] Create `src/lib/grading/worker.ts` and `netlify/functions/grading-worker.ts` (every 10 minutes): grade `waiting` and `not_graded_yet` entries; save a `grader_results` row; fail → `needs_owner_decision = yes`; grader down → `not_graded_yet` and `grading_attempts + 1`; after 5 tries → `grading_gave_up`.
  - Tests: `tests/fast/grading/worker.test.ts` (fake grader): pass saved; fail flags for the owner; grader down → not graded yet; 5th failure → gave up; a failed grade never throws.
  - Needs: T056, T057.

**Checkpoint**: All stories are done.

---

## Phase 13: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Write `README.md`: how the app works (the ordered steps and the 9-second limit), where the data comes from (openFDA only), what it can't do (no personal advice, no comparisons, English only, not a doctor), and how releases work (owner's `v*` tag, passing AI test run) (constitution VI).
- [ ] T065 [P] Create `tests/fast/meta/question-count.test.ts`: reads the **raw JSON files** in `tests/ai/questions/` directly (not through the T025 loader, so unsigned entries are still counted): at least 20 AI-tier questions in total (FR-040); every category in FR-041 has at least one; each drug has a `three_ways_group` (FR-043).
- [ ] T067 Run the first full AI test run, then the Haiku 5.5 vs Sonnet 5.5 comparison on the same commit (quickstart section 5). Fill in the table in research.md R3 and apply its decision rule (constitution VII). Needs: every answer-key entry signed off (T066).
- [ ] T069 Run [quickstart.md](quickstart.md) end to end, including all hands-on checks and the speed targets (SC-013: answers under 10 seconds for 95%, emergencies under 1 second; FR-053: every reply under 9 seconds).
- [ ] T081 **Owner task**: after the first release (T074 workflow on a `v*` tag), check in Netlify that the scheduled functions `label-check` (daily) and `grading-worker` (every 10 minutes) are running, and that their logs show no question text.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T070 right after T006.
- **Foundational (Phase 2)**: needs Setup. Blocks all stories. Owner tasks T071 and T072
  come early, because the AI tier (T073) saves results online. T083 is done (PR #13); its
  late check is the first passing AI test run on a `main` commit that includes PR #13's
  change, after T073 and T068. T068 right after `ai-gate` first runs on T015's
  PR; the owner approves no `ai-tests` run before T068. T084 right after the first
  passing AI run, which comes after T068. T085 applies to every PR merged under the startup exception until T084.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs Foundational. T026 uses T016 (text matching) from US1 for
  drug-name typo matching (FR-013, FR-056).
- **US5 (Phase 5)**: needs Foundational, T016 and T024 (typo rules and the other-drug list,
  for T032). **Must be finished before T039.**
- **Grading test answers (Phase 6)**: needs Foundational and T033 (T059 scrubs each test
  question first). T076 also needs T022. T086 (owner) right after T055 is applied
  online; T062 needs it. **Must be finished before T042.**
- **US3 (Phase 7)**: needs US5 (T033's `ScrubbedText`), Phase 6 (T059), and T016. T087
  (the AI-tier entries that need the answer AI) needs T040.
- **US4 (Phase 8)**: needs US3 (T040).
- **US6 (Phase 9)**: needs US1, US2, US3, US5 (it logs every reply type).
- **US7 (Phase 10)**: needs Foundational only. Can run alongside US3–US6.
- **US8 rest (Phase 11)**: needs Phase 6 (T052) and US6.
- **US9 rest (Phase 12)**: needs Phase 6 and US6.
- **Polish (Phase 13)**: needs all stories.

### Story order

```text
Setup → Foundation (+ AI tier, ai-gate, release) → US1 → US2 → US5 → Grading test answers
      (+ AI-tier entries for US1, US2, US5 that don't need the answer AI)
      → US3 (+ T087: AI-tier entries that need the answer AI) → US4 → US6 → US8 rest → US9 rest → Polish
                    └──────── US7 (any time after Foundation) ────────┘
```

### Within each story

- Each task builds its tests in the same task. The task is done only when they pass.
- Data and rules before the pipeline step that uses them; pipeline before the page.
- Any PR that adds AI-tier entries also carries the owner's sign-off (T066).

---

## Parallel Examples

```text
# Setup: after T001
T002, T003, T004            then  T006 → T070 (owner)

# Foundation
T009, T010, T012            then  T013, T014;  T025 + T056  then  T063 → T073 → T015 → T068 (owner) → first passing AI run on T015's PR → T084;  T083 late check on the first passing run on `main` after that;  T074 → T075 (owner)

# US1 Emergencies
T016 + T017               then  T018 + T019 + T020   then  T021   then  T022 + T023

# US2 Refusals
T024                      then  T026 → T027 → T028 → T029

# US5 Scrubbing
T031 + T032               then  T033 → T077, T034  (T078 alongside)

# Grading test answers
T051 → T052, T055         then  T086 (owner), T059, T060   then  T061 + T062;  after T059: T076 + T030 + T035

# US3 Answers
T036 + T037 + T038        then  T039 → T040   then  T041 + T042 + T080 + T087
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundation → Phase 3 US1.
2. **Stop and check**: every emergency phrase and scenario test passes, with 0 AI calls.
3. This is the safety core. It shows no AI answers yet.

### Incremental delivery

1. US1 → US2: nothing unsafe gets through the rules.
2. US5: scrubbing is ready **before** any real AI is connected.
3. Grading test answers: every test answer will be graded. Then the AI-tier entries for
   US1, US2, and US5 that don't need the answer AI.
4. US3 → US4: real answers, with sources. The AI-tier dosing, not-covered, and
   normal-question privacy entries (T087) come once the answer AI is connected.
5. US6 → US7: logging and fresh labels.
6. US8 → US9: review pages and grading of real answers.

**Do not let the public use the app** until US1–US7 are done, every answer-key entry is
signed off (T066), the risk review (outside this feature) is approved, and the owner
releases a `v*` tag that passes the release workflow (T074).

---

## Notes

- Every task is done on a branch and merged by PR after owner review (constitution I).
- PRs that touch a file on `.github/ai-related-paths.txt` need a passing AI test run (`ai-gate`).
- Releases are `v*` tags pushed only by the owner, with a passing AI test run (`release`).
- Never use real patient data, including in tests (constitution V).
- Secrets stay in `.env` (local only), Netlify, or GitHub environments, never in committed files.
