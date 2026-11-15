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
Fast tests live in `tests/fast/` (no AI). AI-tier tests live in `tests/ai/` (real models).

**Organization**: Tasks are grouped by user story. Emergencies (US1) and refusals (US2) come
first, right after the minimum setup. Scrubbing (US5) comes **before** the real answer AI is
connected (T039), so no real AI call ever gets unscrubbed text, even in development.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run at the same time as the other [P] tasks named under "Runs alongside"
  (different files, no waiting on each other)
- **[Story]**: Which user story the task serves (US1 to US9, from spec.md)
- Under each task: **Tests** = the tests built in that task; **Runs alongside** = tasks that
  can be done at the same time; **Needs** = tasks that must be finished first

## Story key (spec.md → product owner's story ID)

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

**Build order** (changed from plan.md at the owner's request): US1 → US2 → **US5** → US3 →
US4 → US6 → US7 → US8 → US9.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The bare minimum project so code and tests can exist and GitHub checks every PR.

- [ ] T001 Create the Next.js (App Router) + TypeScript project on Node.js 22: `package.json`, `tsconfig.json`, `next.config.ts`, `.nvmrc` (`22`). Add the plan's libraries: `next`, `react`, `@anthropic-ai/sdk`, `openai`, `@supabase/supabase-js`, `@supabase/ssr`, `compromise`, `syllable`, `franc-min`, `zod`; dev: `typescript`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `prettier`. Add npm scripts: `dev`, `build`, `lint`, `typecheck`, `test:fast`, `test:ai`, `db:migrate`, `db:seed`, `labels:fetch`, `labels:check`.
  - Tests: `npm run build` and `npm run typecheck` pass.
  - Runs alongside: —
- [ ] T002 [P] Set up Vitest with two projects in `vitest.config.ts`: `fast` (`tests/fast/**`, never loads real AI clients) and `ai` (`tests/ai/**`). Add `tests/fast/smoke.test.ts`.
  - Tests: `tests/fast/smoke.test.ts`.
  - Runs alongside: T003, T004, T005. Needs: T001.
- [ ] T003 [P] Add ESLint and Prettier config (`eslint.config.mjs`, `.prettierrc`) with `no-console` set to error for `src/**` (keeps raw questions out of logs, research R18).
  - Tests: `npm run lint` passes.
  - Runs alongside: T002, T004, T005. Needs: T001.
- [ ] T004 [P] Check `.env.example` has blank placeholders for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GRADER_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Add any that are missing, with no values. Confirm `.env` is listed in `.gitignore` (CLAUDE.md rule 5).
  - Tests: —
  - Runs alongside: T002, T003, T005.
- [ ] T005 [P] Create `.github/CODEOWNERS` with `* @alexcaldwelll`.
  - Tests: —
  - Runs alongside: T002, T003, T004.
- [ ] T006 Create `.github/workflows/fast-tests.yml` (check name `fast-tests`): runs on every PR and every push to `main`. Install, type-check, lint, start local Supabase, run `npm run test:fast` (research R16).
  - Tests: the workflow runs `tests/fast/smoke.test.ts` on the PR and passes.
  - Needs: T001–T003.

**Checkpoint**: Every later PR is checked automatically.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared pieces every story needs: label tables, the log table, the fake AI, the
ordered question steps, and the "AI, not a doctor" banner.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T007 Set up local Supabase (`supabase/config.toml`) and migration `supabase/migrations/0001_labels.sql` creating `drug_labels` and `label_sections` per data-model.md. Rules: `drug` is "`emgality` or `reyvow`"; `is_current` "Exactly one current label per drug" (partial unique index on `drug` where `is_current`); `label_sections.text` "Not empty. Empty openFDA fields aren't saved." (check constraint). Lock both tables to the server (service role) only.
  - Tests: `tests/fast/db/labels-schema.test.ts`: a second current label for the same drug is rejected; empty section text is rejected; `drug = 'advil'` is rejected.
  - Needs: T006.
- [ ] T008 Migration `supabase/migrations/0002_log_and_runs.sql` creating `log_entries` and `test_runs` per data-model.md. Enforce: `answer_type` in `normal`, `refusal`, `not_covered`, `emergency`, `ask_which_drug`, `error`, `prompt_for_question`, `english_only`; `drug` in `emgality`, `reyvow`, `both`, or empty; `emergency_group` in `medical`, `self_harm`, `both`, or empty; `emergency_case` in `informational`, `happening_now`, `unclear`, or empty; `review_status` "Starts `not_reviewed`"; `grading_attempts` "0 to 5"; `source` `real` or `test`; `test_runs.status` `running`, `passed`, `failed`. **No column may hold the raw question.** Server-only access for now (US8 adds reviewer read access).
  - Tests: `tests/fast/db/log-schema.test.ts`: bad `answer_type` rejected; `grading_attempts = 6` rejected; new rows default to `not_reviewed`.
  - Needs: T007.
- [ ] T009 [P] Create `src/config/models.ts` (answer model `claude-haiku-5-5`, its company `anthropic`, grader model from `GRADER_MODEL`, its company `openai`) and `src/lib/db/client.ts` (server-only Supabase client using the service role key; import guard so it can never load in the browser).
  - Tests: —
  - Runs alongside: T010, T012. Needs: T001.
- [ ] T010 [P] Save real openFDA label replies as fixtures: `tests/fixtures/openfda/emgality.json`, `tests/fixtures/openfda/reyvow.json` (public label data, not patient data). Add `scripts/seed-labels.ts` (`npm run db:seed`) that loads them into the local database as the current labels.
  - Tests: —
  - Runs alongside: T009, T012. Needs: T007.
- [ ] T011 Create `src/lib/labels/sections.ts` (fixed map from openFDA field to display name, research R7, e.g. `warnings_and_cautions` → "Warnings and Precautions"; skips empty fields) and `src/lib/labels/store.ts` (`getCurrentLabel(drug)` returns label date and sections).
  - Tests: `tests/fast/labels/sections.test.ts`: known fields get the right names; empty fields are skipped; `getCurrentLabel` returns the seeded label and date.
  - Runs alongside: T012. Needs: T009, T010.
- [ ] T012 [P] Create the AI client interface `src/lib/ai/types.ts` (answer client and grader client shapes) and `tests/helpers/fake-ai.ts` (returns fixed replies and records every call, so tests can prove the AI was or wasn't called).
  - Tests: —
  - Runs alongside: T009, T010, T011.
- [ ] T013 Create the ordered question steps `src/lib/pipeline/ask.ts` (empty slots for: emergency, basic checks, scrub, refusals, section search, answer AI, answer checks, log, grading sample) and `src/app/api/ask/route.ts` per contracts/api.md: `zod` request check; every reply has `"disclaimer": "LabelTrace is an AI, not a doctor."`; blank → `kind: "prompt_for_question"`; over 1,000 characters → cut, `truncated: true`; non-English (`franc-min`) → `kind: "english_only"` with "I can only answer in English right now." The route never logs, stores, or echoes the raw question.
  - Tests: `tests/fast/pipeline/basic-checks.test.ts`: blank, 1,001-character, and Spanish questions; disclaimer on every reply kind.
  - Runs alongside: T014, T015. Needs: T012.
- [ ] T014 [P] Create the shared layout `src/app/layout.tsx` with a visible "LabelTrace is an AI, not a doctor." banner on every page (FR-003), and a simple question page `src/app/page.tsx` that posts to `/api/ask`.
  - Tests: `tests/fast/ui/banner.test.tsx`: banner is present on the question page.
  - Runs alongside: T013, T015. Needs: T001.
- [ ] T015 [P] Create `.github/workflows/ai-tests.yml` (started by hand; inputs: branch, `model`) and `.github/workflows/ai-gate.yml` (check name `ai-gate`, every PR) with `scripts/ai-gate.ts`, **part 1**: if the PR changes any AI-related file (`src/lib/ai/**`, `src/lib/prompts/**`, `src/lib/labels/**`, `src/lib/scrub/**`, `src/lib/emergency/**`, `src/config/models.ts`), require a `test_runs` row for the PR's latest commit with `status = passed`. Put the decision in a pure function `src/lib/ci/gate.ts` so it can be tested. API keys come from GitHub Actions secrets only.
  - Tests: `tests/fast/ci/ai-gate.test.ts`: README-only change → pass; prompt change with no run → fail with "Run the ai-tests workflow on this commit"; prompt change with a passed run → pass.
  - Runs alongside: T013, T014. Needs: T008.

**Checkpoint**: Foundation ready. Story work can begin.

---

## Phase 3: User Story 1 — Emergencies get urgent help, not an AI answer (Priority: P1) 🎯 MVP

**Goal**: Emergency phrases skip the AI and show the right message at once. Informational
medical questions also show the label's exact matching sentences.

**Independent Test**: Every phrase on the list shows the right message with 0 AI calls.
Informational, happening-now, unclear, and mixed questions show label text only for
informational medical questions.

All rules: [contracts/emergency-rules.md](contracts/emergency-rules.md). No AI anywhere in
this phase.

- [ ] T016 [P] [US1] Create text matching in `src/lib/text/match.ts`: normalize (lowercase, `’` → `'`, other punctuation → space, squash spaces), split into words, edit distance, and phrase matching with the typo allowance: "1–3 letters: exact only; 4–7 letters: off by at most 1 change; 8 or more letters: off by at most 2 changes". Words must appear next to each other, in order.
  - Tests: `tests/fast/emergency/match.test.ts`: capitals; curly apostrophe; phrase inside a long sentence; a 3-letter word with one typo does **not** match; a 5-letter word off by 1 matches, off by 2 doesn't; a 9-letter word off by 2 matches.
  - Runs alongside: T017.
- [ ] T017 [P] [US1] Create the phrase list and exact messages in `src/lib/emergency/phrases.ts`: all 10 medical ids and 6 self-harm ids with their variants (contract section 2), and `MSG_911`, `MSG_988`, `MSG_NOT_COVERED` with the exact text from contract section 1.
  - Tests: `tests/fast/emergency/phrase-coverage.test.ts`: the **"every phrase has a test" check**. It reads every id in `phrases.ts` and fails if any id has no test in `tests/fast/emergency/phrases.test.ts` (FR-010).
  - Runs alongside: T016.
- [ ] T018 [US1] Create `src/lib/emergency/detect.ts`: `detectEmergency(rawText)` returns matched phrase ids and groups (`medical`, `self_harm`, or both).
  - Tests: `tests/fast/emergency/phrases.test.ts`: **one test per phrase id (16)**, using the main phrase and one variant; capitals, inside a long sentence, and a typo version (US1 scenario 4); US1 scenarios 1–3 with the spec's exact questions.
  - Runs alongside: T019, T020. Needs: T016, T017.
- [ ] T019 [P] [US1] Create `src/lib/emergency/classify.ts`: sort a medical match into `happening_now`, `informational`, or `unclear`, checking in that order (contract section 4). Happening-now words are whole words only: `i`, `i'm`, `im`, `me`, `my`, `we`, `now`, `today`, `having`, `right now`. Informational needs an exactly spelled drug name (`emgality`, `reyvow`, `galcanezumab`, `lasmiditan`) and a question word at the start or a `?` at the end.
  - Tests: `tests/fast/emergency/classify.test.ts`: each happening-now word; "Is" does not count as "I"; "worst headache of my life" → happening now; each of the 4 drug names → informational; "Does Reyvo cause chest pain?" → unclear; "reyvow chest pain" → unclear.
  - Runs alongside: T018, T020. Needs: T016.
- [ ] T020 [P] [US1] Create `src/lib/emergency/excerpts.ts`: for an informational medical question, map generic to brand (galcanezumab → emgality, lasmiditan → reyvow), split each section of the current saved label into sentences, and keep every sentence matching the **same phrase** with T016's rules. Return them word for word, grouped by section, with section name and label date. If none match, return "not covered".
  - Tests: `tests/fast/emergency/excerpts.test.ts` (fixture labels): chest pain in Reyvow returns the exact sentences; lasmiditan uses the Reyvow label; galcanezumab + trouble breathing uses the Emgality label; a phrase not in the label → not covered.
  - Runs alongside: T018, T019. Needs: T011, T016.
- [ ] T021 [US1] Create `src/lib/emergency/respond.ts`: build the `emergency` reply per contract section 5. Messages in order (`MSG_911` first, then `MSG_988`); `label_excerpts` only for medical-only + informational; `not_covered` true when no sentence matched; self-harm or both groups → `label_excerpts` always empty.
  - Tests: `tests/fast/emergency/scenarios.test.ts`: **US1 scenarios 5–17, one test each, with the spec's exact questions**; 911 is always before 988; any self-harm match → no label text.
  - Needs: T018, T019, T020.
- [ ] T022 [US1] Make the emergency check **step 1** in `src/lib/pipeline/ask.ts`, before basic checks, scrubbing, and everything else (FR-004). It runs on the full raw text in memory. A match returns the emergency reply immediately.
  - Tests: `tests/fast/pipeline/emergency-first.test.ts`: the fake AI is called **0 times** for all 16 phrases and all 17 scenarios; an emergency phrase at character 1,200 of a 1,500-character question is still caught; emergency + dosing question → emergency wins; emergency reply returns in under 1 second (SC-013).
  - Runs alongside: T023. Needs: T013, T021.
- [ ] T023 [P] [US1] Create `src/components/EmergencyReply.tsx` and use it in `src/app/page.tsx`: emergency messages at the very top, 911 above 988, then any label sentences with section name and label date, or "The label doesn't cover this."
  - Tests: `tests/fast/ui/emergency-reply.test.tsx`: messages render before anything else; 911 above 988; excerpts show section and date.
  - Runs alongside: T022. Needs: T014, T021.

**Checkpoint**: US1 works and is fully tested on its own. This is the MVP.

---

## Phase 4: User Story 2 — Refuse what the label can't answer (Priority: P1)

**Goal**: Dosing, comparison, other-drug, and not-in-label questions get the right refusal,
never a guess.

**Independent Test**: Ask dosing, comparison, other-drug, and not-covered questions and
confirm each gets the right refusal.

- [ ] T024 [P] [US2] Build the drug name lists **from openFDA data, not from memory**. Write `scripts/build-drug-names.ts`, which queries the openFDA drug label endpoint: (a) brand and generic names of labels whose `indications_and_usage` mentions migraine (`count=openfda.brand_name.exact` and `count=openfda.generic_name.exact`), and (b) the most common brand and generic names overall (same count fields). Save the result to `src/lib/refusals/other-drugs.json`, removing our 4 names (`emgality`, `reyvow`, `galcanezumab`, `lasmiditan`). Put our names and the loader in `src/lib/refusals/drug-names.ts`. Add **research.md R20** recording the exact query URLs, the download date, and the number of names.
  - Tests: `tests/fast/refusals/drug-names.test.ts`: our 4 names are never on the other list; Imitrex (sumatriptan) and Ubrelvy (ubrogepant) are on it; the JSON file records its source URL and date.
  - Runs alongside: T025.
- [ ] T025 [P] [US2] Create the AI-tier answer-key loader `tests/ai/questions/load.ts` with a `zod` shape matching data-model.md "Test questions and answer key". `category` in `normal`, `refusal_dosing`, `refusal_compare`, `refusal_other_drug`, `not_covered`, `three_ways`, `privacy`. `checked_by / checked_on` "**Required.** The loader refuses any entry without them" (FR-044, constitution VIII).
  - Tests: `tests/fast/ai-key/loader.test.ts`: an entry without `checked_by` is refused; a bad category is refused; a good entry loads.
  - Runs alongside: T024.
- [ ] T026 [US2] Create refusal rules in `src/lib/refusals/rules.ts` (no AI, research R14): other drug named → `other_drug`; comparison words ("better than", "vs", "compared to", "instead of", "or") with two drug names → `comparison`; personal-dosing patterns ("how much should I", "my weight", "I weigh", "for my age") → `personal_dosing`; no drug named → `ask_which_drug`; both our drugs named without comparison words → pass through with `drug = both`.
  - Tests: `tests/fast/refusals/rules.test.ts`: US2 scenarios 1–3 with the spec's exact questions; "Does it cause nausea?" → ask which drug; "How are Emgality and Reyvow given?" → not refused, `both`.
  - Needs: T024.
- [ ] T027 [US2] Create `src/lib/refusals/respond.ts` and add refusals as **step 4** in `src/lib/pipeline/ask.ts`. Comparison and other-drug replies are rule-based text with "talk to your doctor or pharmacist" and no AI call. `ask_which_drug` → "Do you mean Emgality or Reyvow?". **Personal dosing**: "Ask your doctor or pharmacist" plus a plain-language summary of the label's "Dosage and Administration" section written by the answer AI from that section only, with `sections[]` and `label_date` (contracts/api.md `refusal` shape). Uses the fake AI until T039 exists. Once T038/T044 exist, the summary also passes the word-count, reading-level, and citation checks (wired in T040).
  - Tests: `tests/fast/pipeline/refusals.test.ts`: each refusal kind returns the right `reason` and wording; fake AI called 0 times for comparison, other drug, and which drug; dosing reply has "Ask your doctor or pharmacist", a section, and a label date.
  - Needs: T013, T026.
- [ ] T028 [US2] Create the dosing **number check** in `src/lib/checks/dosing-numbers.ts` and use it in the dosing reply. Every number and unit pair in the AI's dosing summary (e.g. `120 mg`, `1 mL`, `once monthly`, `2 doses`) must appear **exactly** in that drug's saved "Dosage and Administration" section text. The only allowed difference is spacing (`120 mg` = `120mg`). If **any** number or unit doesn't match, or the AI is down, fall back to showing the section text **word for word** with section name and label date, plus "Ask your doctor or pharmacist".
  - Tests: `tests/fast/checks/dosing-numbers.test.ts`: summary with numbers that match the label → AI summary shown; summary with a wrong number (`240 mg` when the label says `120 mg`) → word-for-word fallback; a wrong unit (`mL` vs `mg`) → fallback; a number not in the label at all → fallback; AI down → fallback; the fallback text exactly equals the stored section text.
  - Needs: T027.
- [ ] T029 [US2] Add "not covered" and the AI safety net to `src/lib/pipeline/ask.ts`: if the AI marks its answer `not_covered` → reply `kind: "not_covered"`, `text: "The label doesn't cover this."` with drug and label date; if the AI marks it `refusal` → refusal reply. Never show a guess (FR-014).
  - Tests: `tests/fast/pipeline/not-covered.test.ts`: fake AI says `not_covered` → exact text; fake AI says `refusal` → refusal reply with doctor or pharmacist wording.
  - Needs: T028.
- [ ] T030 [P] [US2] Add AI-tier refusal questions in `tests/ai/questions/refusals.json`: personal dosing for each drug (including "How much Emgality should I take? I weigh 200 pounds"), "Is Reyvow better than Emgality?", "Is Reyvow better than Imitrex?", "What are the side effects of Ubrelvy?", and not-covered for each drug (including "Can I take Reyvow on a plane?"). Leave `checked_by` / `checked_on` empty for the owner (T065).
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T026–T029. Needs: T025.

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
- [ ] T032 [P] [US5] Create `src/lib/scrub/names.ts` with three layers (research R10): intro phrases ("I'm X", "my name is X", "this is X", "thanks, X"); `compromise` name finding; any capitalized word that isn't at the start of a sentence and isn't on the known-word list (drug names, section names, common English words) → `[NAME]`. When unsure, mask.
  - Tests: `tests/fast/scrub/names.test.ts`: "Hi, I'm Jane Doe"; "my name is Sam Lee"; "thanks, Pat"; an unknown capitalized word mid-sentence → masked; "Emgality", "Reyvow", and "Warnings and Precautions" are not masked.
  - Runs alongside: T031.
- [ ] T033 [US5] Create `src/lib/scrub/index.ts` (`scrub(raw)` returns a **`ScrubbedText`** branded type, so other code can tell scrubbed text apart from raw text) and add scrubbing as **step 3** in `src/lib/pipeline/ask.ts`, right after the emergency check and basic checks, before refusals and any AI. Blank and non-English questions stop at step 2 and are never scrubbed.
  - Tests: `tests/fast/privacy/scrub-pipeline.test.ts`: US5 scenario 1 → the fake AI receives `[NAME]`, `[EMAIL]`, `[PHONE]` and none of the raw details; a spy on `console.*` and on the error reporter never sees the raw text, including when the AI throws.
  - Needs: T013, T031, T032.
- [ ] T034 [US5] Create `tests/fast/privacy/raw-search.test.ts`: run every privacy question (and one emergency question that contains made-up personal details) through the pipeline, then search **every text and JSON column in every table** of the local database for each raw string and each raw personal detail (SC-006).
  - Tests: this file; it must find 0 matches. It becomes a stronger check once US6 writes log rows (re-run in T047).
  - Needs: T033.
- [ ] T035 [P] [US5] Add AI-tier privacy questions in `tests/ai/questions/privacy.json` (made-up details only, e.g. US5 scenario 1). Leave `checked_by` / `checked_on` for the owner.
  - Tests: these entries are AI-tier tests.
  - Runs alongside: T033, T034. Needs: T025.

**Checkpoint**: Scrubbing is in place before any real AI is connected.

---

## Phase 6: User Story 3 — Plain-language answers (Priority: P1)

**Goal**: Normal questions get a short, easy answer drawn only from the label.

**Independent Test**: Ask side-effect, how-it's-given, and storage questions. Each answer is
120 words or fewer and grade 9 or lower.

- [ ] T036 [P] [US3] Create `src/lib/labels/synonyms.ts` (everyday words → label words: "shot" → "injection", "throw up" → "vomiting", "side effects" → "adverse reactions", and more) and `src/lib/labels/retrieve.ts` (keyword scoring with synonyms and T016 typo matching; top 3 sections, up to about 4,000 tokens; research R12).
  - Tests: `tests/fast/labels/retrieve.test.ts`: "shot" finds the injection section; "throw up" finds vomiting; "side efects" (typo) finds Adverse Reactions; the medical, everyday, and typo versions of one question pick the same top section; never more than 3 sections.
  - Runs alongside: T037, T038.
- [ ] T037 [P] [US3] Create the answer prompt `src/lib/prompts/answer-v1.ts` (version id `answer-v1`; use only the given label text; plain language, 8th grade; 120 words or fewer; never compare drugs; never give personal advice; mark `not_covered` or `refusal` when needed) and the fixed answer shape in `src/lib/ai/answer-schema.ts` (`zod`: answer text, sections used, answer type).
  - Tests: `tests/fast/ai/answer-schema.test.ts`: missing fields are rejected; the prompt exports its version id.
  - Runs alongside: T036, T038.
- [ ] T038 [P] [US3] Create `src/lib/checks/word-count.ts` (120 or fewer, FR-015) and `src/lib/checks/reading-level.ts` (Flesch-Kincaid grade using `syllable`; drug names and section names are left out of the score; pass at grade 9 or lower, FR-016).
  - Tests: `tests/fast/checks/answer-checks.test.ts`: 120 words passes, 121 fails; a known grade-6 sample passes; a known grade-14 sample fails; a sentence repeating "galcanezumab" isn't pushed over by the drug name.
  - Runs alongside: T036, T037.
- [ ] T039 [US3] Create the real answer AI client `src/lib/ai/anthropic.ts` using `@anthropic-ai/sdk`, model from `src/config/models.ts`, structured output with T037's shape, 8-second timeout. Its input type **accepts only `ScrubbedText`** (from T033), so code that passes raw text won't compile.
  - Tests: `tests/fast/ai/anthropic-client.test.ts` (mocked SDK, no real call): timeout → error the pipeline turns into `try_again`; the model name comes from config; a type test (`// @ts-expect-error`) proves passing a plain string fails to compile.
  - Needs: T033, T037.
- [ ] T040 [US3] Add the normal answer path to `src/lib/pipeline/ask.ts`: section search → answer AI → word-count and reading-level checks → one retry if a check fails → otherwise "The label doesn't cover this." Both drugs named without comparing → one answer per drug. AI down or slow → `kind: "try_again"`, nothing made up. Personal-dosing summaries (T027) go through the same checks before the T028 number check.
  - Tests: `tests/fast/pipeline/answer.test.ts` (fake AI): a too-long first answer, then a good one → good one shown; bad twice → not covered; AI throws → `try_again`; both drugs → two `answers` items.
  - Needs: T036, T038, T039.
- [ ] T041 [P] [US3] Create `src/components/AnswerReply.tsx` and use it in `src/app/page.tsx` for `answer`, `refusal`, `not_covered`, `ask_which_drug`, `try_again`, `prompt_for_question`, `english_only`.
  - Tests: `tests/fast/ui/answer-reply.test.tsx`: each reply kind renders its text, with the banner still visible.
  - Runs alongside: T042. Needs: T040.
- [ ] T042 [P] [US3] Add AI-tier questions `tests/ai/questions/normal.json` (side effects, how it's given, storage, for both drugs) and `tests/ai/questions/three-ways.json` (at least one `three_ways_group` per drug: medical words, everyday words, typos; FR-043). Create the AI test runner `tests/ai/answers.test.ts`: real pipeline, real answer AI; checks 120 words or fewer, grade 9 or lower, expected facts present, and that the three versions in a group give the same facts. Leave `checked_by` / `checked_on` for the owner.
  - Tests: this runner and these entries are the AI-tier tests.
  - Runs alongside: T041. Needs: T025, T040.

**Checkpoint**: The main job works. A real AI is connected, and it only ever sees scrubbed text.

---

## Phase 7: User Story 4 — Show where the answer came from (Priority: P1)

**Goal**: Every label-based answer names at least one real section and shows the label date.

**Independent Test**: Ask any normal question. The answer names a section that exists in
the saved label and shows the label date.

- [ ] T043 [US4] Create `src/lib/checks/citations.ts`: every cited section exists (present and not empty) in the saved label for that drug (FR-018); at least one section is cited and `label_date` is present (FR-017).
  - Tests: `tests/fast/checks/citations.test.ts`: real section passes; made-up section fails; no section fails; missing date fails; a section that exists only in the *other* drug's label fails.
- [ ] T044 [US4] Add the citation check to the answer checks in `src/lib/pipeline/ask.ts` (same one-retry rule as T040). Every `answers` item and every dosing refusal carries `sections[]` and `label_date`.
  - Tests: extend `tests/fast/pipeline/answer.test.ts`: every normal answer has at least 1 real section and a date; fake AI citing a made-up section twice → not covered.
  - Runs alongside: T045. Needs: T040, T043.
- [ ] T045 [P] [US4] Show section names and label date in `src/components/AnswerReply.tsx`. In `tests/ai/answers.test.ts`, check that `expected_sections` are cited and that every cited section exists.
  - Tests: extend `tests/fast/ui/answer-reply.test.tsx` (section and date visible); the AI-tier check above.
  - Runs alongside: T044.

**Checkpoint**: All P1 stories are done.

---

## Phase 8: User Story 6 — Log every answer (Priority: P2)

**Goal**: Every reply creates one complete log row, with no raw question.

**Independent Test**: Ask a question. One log row exists with all required fields.

- [ ] T046 [US6] Create `src/lib/db/log.ts`: `writeLogEntry()` with a `zod` shape matching data-model.md `log_entries`. It takes the question only as `ScrubbedText` (or nothing). For `prompt_for_question` and `english_only` rows, store **only** `id`, `created_at`, `answer_type`, `answer`, `source`, `review_status`, with no question text at all, because the scrubber is English-only. `grading_status` is `not_applicable` for emergencies, rule-based refusals, `prompt_for_question`, and `english_only`.
  - Tests: `tests/fast/log/log-writer.test.ts`: rejects a bad `answer_type`; a `english_only` row with question text is rejected; a plain string can't be passed as the question (type test).
- [ ] T047 [US6] Write exactly one log row at **every** exit of `src/lib/pipeline/ask.ts`. Emergency rows: scrub the question after the emergency check and before saving; `answer_type = emergency`, `ai_skipped = true`, `model_name` empty, `emergency_group`, `emergency_case`, `label_text_shown`, and when shown, `sections_used` and `label_date` (FR-025). AI answers record `model_name` and `prompt_version`.
  - Tests: `tests/fast/log/every-reply.test.ts`: normal, refusal (each kind), not covered, emergency (informational, happening now, unclear, self-harm, mixed), ask which drug, try again, **blank, and non-English** each → exactly 1 row with the right fields; blank and non-English rows have an empty question field and only reply type and time filled in. Re-run `tests/fast/privacy/raw-search.test.ts` (T034), which now searches real log rows and must still find 0.
  - Needs: T046.

**Checkpoint**: Every reply is recorded for review, with no raw question.

---

## Phase 9: User Story 7 — Keep label data current without extra downloads (Priority: P2)

**Goal**: Labels are downloaded once and again only when openFDA has a newer date.

**Independent Test**: No saved label → one download. Same date → nothing downloaded. Newer
date → new label saved and used.

- [ ] T048 [US7] Add fixtures `tests/fixtures/openfda/no-matches.json` and `tests/fixtures/openfda/reyvow-newer.json` (the Reyvow fixture with a later `effective_time`).
  - Tests: —
- [ ] T049 [US7] Create `src/lib/labels/openfda.ts` (research R6): `fetchInitial(drug)` uses the brand-name + Eli Lilly search and saves the record, `set_id`, and `effective_time`; `checkForNewer(drug)` asks only for the same `set_id` with `effective_time` after the saved date. A newer label → new `drug_labels` row; the old row's `is_current` becomes no. No match → nothing downloaded or saved. openFDA unreachable → keep the saved label and log the failed check (no question text involved). Fetch is passed in, so tests never call openFDA.
  - Tests: `tests/fast/labels/freshness.test.ts`: no saved label → downloads and saves; same date → no full download and the `drug_labels` row count doesn't change (SC-008); newer → new row is current, old row kept, and a new answer shows the new date; network error → saved label still used.
  - Needs: T048.
- [ ] T050 [US7] Create `scripts/labels-fetch.ts` (`npm run labels:fetch`), `scripts/labels-check.ts` (`npm run labels:check`), and `netlify/functions/label-check.ts` (daily schedule) that all call T049's code.
  - Tests: `tests/fast/labels/label-check-function.test.ts`: the scheduled function calls `checkForNewer` for both drugs (fake fetch).
  - Needs: T049.

**Checkpoint**: Answers always use the current label, with no needless downloads.

---

## Phase 10: User Story 8 — Human review of answers (Priority: P3)

**Goal**: Reviewers sign in with their own login and approve or flag logged answers.

**Independent Test**: Sign in as a reviewer, approve one answer, flag another with a reason,
and confirm both are saved with name and time. Signed-out users are blocked.

- [ ] T051 [US8] Migration `supabase/migrations/0003_reviewers.sql`: `reviewers` (`role` "`reviewer` or `owner`", `active`) and `review_decisions` (`decision` `approve` or `flag`; `reviewer_id` "Required (FR-031)"; `reason` "**Required when `flag`** (FR-032)"; `decided_at` required). Access rules: active reviewers and the owner can read `log_entries`; patients and the public can't. Turn off public sign-up in `supabase/config.toml`.
  - Tests: `tests/fast/db/review-rls.test.ts`: the anonymous client can't read `log_entries`; an inactive reviewer can't; an active reviewer can; a `flag` row with no reason is rejected.
- [ ] T052 [US8] Create `src/lib/auth/session.ts` (`@supabase/ssr`; `requireReviewer()` and `requireOwner()`, where owner counts as reviewer, FR-033) and the login page `src/app/login/page.tsx` (email and password).
  - Tests: `tests/fast/review/session.test.ts`: signed out → 401; inactive → 403; owner passes `requireReviewer`.
  - Needs: T051.
- [ ] T053 [US8] Create `src/app/api/review/entries/route.ts` (GET; filters `status`, `type`, `page`; newest first) and `src/app/api/review/entries/[id]/decision/route.ts` (POST; saves reviewer and time; updates `review_status`; flag without reason → 400).
  - Tests: `tests/fast/review/api.test.ts`: signed out → 401; inactive → 403; approve saves reviewer id and time and sets `approved`; flag without reason → 400; flag with reason → `flagged`; a later review changes the status and both decisions are kept.
  - Runs alongside: T054. Needs: T052.
- [ ] T054 [P] [US8] Create the review page `src/app/review/page.tsx` (list entries, approve, flag with a required reason box).
  - Tests: `tests/fast/ui/review-page.test.tsx`: signed out → sent to login; the flag button is disabled until a reason is typed.
  - Runs alongside: T053.

**Checkpoint**: People can check answers.

---

## Phase 11: User Story 9 — Second-AI grader (Priority: P3)

**Goal**: An OpenAI grader checks every test answer and a random 10% of real answers.
Failed grades go to the owner, who records a decision. The disagreement rate is visible.

**Independent Test**: Run the AI tests; every answer is graded. Send many real answers; about
10% are graded. Force a failed grade; it's flagged for the owner.

- [ ] T055 [US9] Migration `supabase/migrations/0004_grader.sql`: `grader_results` (`grade` `pass` or `fail`; `source` `real` or `test`; `needs_owner_decision` "Yes when `grade = fail` (FR-037)") and `owner_flag_decisions` ("One decision per flag", unique on `grader_result_id`; `owner_id` "Must have role `owner`"; `reason` "Required (FR-038)"). Only the owner can insert decisions.
  - Tests: `tests/fast/db/grader-schema.test.ts`: a second decision on the same flag is rejected; a reviewer (not owner) can't insert; a decision with no reason is rejected.
- [ ] T056 [P] [US9] Create the grader prompt `src/lib/prompts/grader-v1.ts` and client `src/lib/ai/grader.ts` (`openai` SDK; model from `GRADER_MODEL`). The client refuses to start if the grader's company equals the answer model's company (FR-034). Input: the scrubbed question (`ScrubbedText` only), the sections given to the answer AI, and the answer. Output: `pass` or `fail` plus a short reason.
  - Tests: `tests/fast/ai/grader-client.test.ts` (mocked SDK): same-company config throws; the request contains no raw personal details; reply shape is checked.
  - Runs alongside: T057. Needs: T055.
- [ ] T057 [P] [US9] Create `src/lib/grading/sample.ts`: for real AI answers, a secure random number below 0.10 → `grading_status = waiting`, else `not_sampled` (FR-036). Emergencies, rule-based refusals, `prompt_for_question`, and `english_only` → `not_applicable`. Call it from the log step.
  - Tests: `tests/fast/grading/sample.test.ts`: injected 0.09 → waiting, 0.10 → not sampled; emergency → not applicable; 10,000 real draws land between 8% and 12% (SC-010).
  - Runs alongside: T056. Needs: T047.
- [ ] T058 [US9] Create `src/lib/grading/worker.ts` and `netlify/functions/grading-worker.ts` (every 10 minutes): grade `waiting` and `not_graded_yet` entries; save a `grader_results` row; fail → `needs_owner_decision = yes`; grader down → `not_graded_yet` and `grading_attempts + 1`; after 5 tries → `grading_gave_up`.
  - Tests: `tests/fast/grading/worker.test.ts` (fake grader): pass saved; fail flags for the owner; grader down → not graded yet; 5th failure → gave up; a failed grade never throws.
  - Needs: T056, T057.
- [ ] T059 [US9] Create `tests/ai/setup.ts`: each AI-tier run creates a `test_runs` row (commit, branch, answer model), grades **every** answer right away (FR-035), saves results with `source = test`, and finishes the row with passed/failed/total. A failed **grade** does not fail the test (FR-037).
  - Tests: `tests/fast/grading/test-run-recorder.test.ts` (fake AI and fake grader): every answer gets a grade; a failed grade leaves the run `passed`.
  - Needs: T058.
- [ ] T060 [US9] Create owner routes `src/app/api/owner/flags/route.ts` (GET, filter `source`), `src/app/api/owner/flags/[grader_result_id]/decision/route.ts` (POST; reason required; second decision → 409), and `src/app/api/owner/grader-summary/route.ts` (total, disagreements, rate, `by_month`).
  - Tests: `tests/fast/owner/api.test.ts`: reviewer → 403; no reason → 400; second decision → 409; 6 disagreements out of 40 → rate 0.15 with the right month counts; 0 decisions → rate 0 with no error.
  - Needs: T052, T055.
- [ ] T061 [P] [US9] Create owner pages `src/app/owner/flags/page.tsx` and `src/app/owner/grader-summary/page.tsx` (shows `grading_gave_up` entries and the disagreement rate).
  - Tests: `tests/fast/ui/owner-pages.test.tsx`: a non-owner is blocked; the rate is displayed.
  - Runs alongside: T062. Needs: T060.
- [ ] T062 [P] [US9] Extend `src/lib/ci/gate.ts` and `scripts/ai-gate.ts` with **part 2**: every `grader_results` row with `needs_owner_decision = yes` from the PR's run must have an `owner_flag_decisions` row. Fail message: "N grader flags need your decision".
  - Tests: extend `tests/fast/ci/ai-gate.test.ts`: a passed run with 3 undecided flags → fail with "3 grader flags need your decision"; all decided → pass.
  - Runs alongside: T061. Needs: T055.
- [ ] T063 [US9] Create the grader calibration set `tests/ai/grader/calibration.json` (10 hand-made answers: 5 that stick to the label, 5 with a known mistake such as an added fact or a wrong section) and `tests/ai/grader/calibrate.test.ts`. Pick the smallest OpenAI model that catches all 5 bad answers and passes at least 4 of the 5 good ones. Record the model ID and results in research.md R4 (research R4).
  - Tests: the calibration set itself (AI tier).
  - Needs: T056.

**Checkpoint**: All stories are done.

---

## Phase 12: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Write `README.md`: how the app works (the ordered steps), where the data comes from (openFDA only), and what it can't do (no personal advice, no comparisons, English only, not a doctor) (constitution VI).
- [ ] T065 [P] Create `tests/fast/meta/question-count.test.ts`: at least 20 AI-tier questions in total (FR-040); every category in FR-041 has at least one; each drug has a `three_ways_group` (FR-043).
- [ ] T066 **Owner task**: check every answer-key entry in `tests/ai/questions/*.json` against the real label and fill in `checked_by` and `checked_on` (FR-044, constitution VIII). The loader (T025) refuses unchecked entries until this is done.
- [ ] T067 Run the first full AI test run, then the Haiku 5.5 vs Sonnet 5.5 comparison on the same commit (quickstart section 5). Fill in the table in research.md R3 and apply its decision rule (constitution VII). Needs: T066.
- [ ] T068 **Owner task**: in GitHub branch protection for `main`, add `fast-tests` and `ai-gate` as required checks (research R17, stage 2).
- [ ] T069 Run [quickstart.md](quickstart.md) end to end, including all hands-on checks and the speed targets (SC-013: answers under 10 seconds for 95%, emergencies under 1 second).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Setup. Blocks all stories.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs Foundational. Uses T016 (text matching) from US1 for drug-name typo handling.
- **US5 (Phase 5)**: needs Foundational. Can be built alongside US1 and US2, but **must be finished before T039**.
- **US3 (Phase 6)**: needs US5 (T033's `ScrubbedText`) and T016.
- **US4 (Phase 7)**: needs US3 (T040).
- **US6 (Phase 8)**: needs US1, US2, US3, US5 (it logs every reply type).
- **US7 (Phase 9)**: needs Foundational only. Can run alongside US3–US6.
- **US8 (Phase 10)**: needs US6.
- **US9 (Phase 11)**: needs US6 and US8 (owner login).
- **Polish (Phase 12)**: needs all stories.

### Story order

```text
Setup → Foundation → US1 → US2 → US5 → US3 → US4 → US6 → US8 → US9 → Polish
                                         └──────── US7 (any time after Foundation) ────────┘
```

### Within each story

- Each task builds its tests in the same task. The task is done only when they pass.
- Data and rules before the pipeline step that uses them; pipeline before the page.

---

## Parallel Examples

```text
# Setup: after T001
T002, T003, T004, T005

# Foundation
T009, T010, T012          then  T013, T014, T015

# US1 Emergencies
T016 + T017               then  T018 + T019 + T020   then  T021   then  T022 + T023

# US2 Refusals
T024 + T025               then  T026 → T027 → T028 → T029  (T030 alongside, after T025)

# US5 Scrubbing
T031 + T032               then  T033 → T034  (T035 alongside)

# US3 Answers
T036 + T037 + T038        then  T039 → T040   then  T041 + T042

# US9 Grader
T056 + T057               then  T058 → T059;   T061 + T062 after T060 / T055
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
3. US3 → US4: real answers, with sources.
4. US6 → US7: logging and fresh labels.
5. US8 → US9: human review and the grader.

**Do not let the public use the app** until US1–US7 are done, T066 is signed off, and the
risk review (outside this feature) is approved.

---

## Notes

- Every task is done on a branch and merged by PR after owner review (constitution I).
- PRs that touch AI-related files need a passing AI test run (`ai-gate`).
- Never use real patient data, including in tests (constitution V).
- Secrets stay in `.env`, Netlify, or GitHub Actions secrets, never in committed files.
