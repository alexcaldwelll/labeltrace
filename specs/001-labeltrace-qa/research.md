# Research: LabelTrace Patient Q&A

**Feature**: `001-labeltrace-qa` | **Date**: 2026-11-15 | **Plan**: [plan.md](plan.md)

Each section below records one decision: what we chose, why, and what else we looked at.
Words that may be new are explained the first time they appear.

---

## R1. Language and web framework

- **Decision**: Next.js (App Router) with TypeScript, on Node.js 22 (long-term support).
- **Why**: One codebase holds both the web pages and the server code. TypeScript is
  JavaScript with type checks, which catch many mistakes before the code runs. The
  project's `.gitignore` already expects a Node project.
- **Alternatives**: Python (FastAPI) backend plus a separate frontend. Rejected: two
  projects to build, test, and host instead of one.
- **TypeScript version (added 2026-11-23, task T003)**: TypeScript is held at **6.0.3**
  because `typescript-eslint` (the add-on that lets ESLint read TypeScript) doesn't support
  TypeScript 7 yet. Upgrade to 7 once `typescript-eslint` supports it.

## R2. Hosting

- **Decision**: Netlify, using its built-in Next.js support. Every pull request gets a
  Netlify "deploy preview" (a private test copy of the site). The public site is
  published only by the release workflow (R21). Netlify's automatic publishing of `main`
  is turned off.
- **Details that matter**:
  - Netlify server functions stop after 10 seconds. The app sets its own **9-second time
    limit** for the whole reply (FR-053), so there's always time to save the log row and
    send a reply. See R13 for how the time is shared.
  - Two **scheduled functions** (code Netlify runs on a timer):
    `label-check` (once a day, see R6) and `grading-worker` (every 10 minutes, see R11).
    They run only on the published site, so the owner checks them after the first
    release.
  - Secrets (API keys) are set in the Netlify dashboard as environment variables, never
    in files. Deploy previews use test keys, not production keys.
  - **No outside error-reporting service.** Server messages go only to Netlify's function
    logs, through one small logger (R18).
- **Alternatives**: Vercel (first suggestion). Changed at the owner's request because they
  already use Netlify.

## R3. Answer AI model, and the larger-model comparison

- **Decision**: Start with **Claude Haiku 5.5** (`claude-haiku-5-5`), Anthropic's smallest
  current model. The model name lives in one config file, `src/config/models.ts`, and is
  saved in every log entry.
- **Why**: The constitution (VII) says to use the smallest model that passes all tests.
- **Comparison test (planned)**: Run the full AI test suite twice on the same commit,
  once with Haiku 5.5 and once with **Claude Sonnet 5.5** (`claude-sonnet-5-5`). Started
  by hand from GitHub Actions (`ai-tests` workflow, `model` input). For each model,
  record:

  | Measure | Haiku 5.5 | Sonnet 5.5 |
  |---|---|---|
  | AI tests passed (out of total) | _pending_ | _pending_ |
  | Answers flagged by the grader | _pending_ | _pending_ |
  | Answers over 120 words | _pending_ | _pending_ |
  | Answers above grade 9 reading level | _pending_ | _pending_ |
  | Slowest 5% of answers (seconds) | _pending_ | _pending_ |
  | Cost per 100 questions (USD) | _pending_ | _pending_ |
  | Run date and commit | _pending_ | _pending_ |

  **Result**: _Pending. This table is filled in after the first full AI test run (a task
  in tasks.md), in a PR the owner reviews._

- **Decision rule**: Keep Haiku if it passes every AI test. Move to Sonnet only if Haiku
  fails tests that Sonnet passes. That move needs a written reason in the PR
  (constitution VII).
- **Alternatives**: Starting with a larger model. Rejected: it breaks the "smallest model"
  rule unless the tests show it's needed.

## R4. Second-AI grader

- **Decision**: An **OpenAI** model (a different company from the answer AI, per FR-034).
  The exact model is set **only** in `src/config/models.ts`, which is on the AI-related
  list. There is no setting that can change it, so a model change always needs a PR and
  a passing AI test run (constitution I and III). We pick it with a **calibration test**: 10 hand-made answers (5 that stick to
  the label, 5 with a known mistake, such as an added fact or a wrong section). Choose the
  smallest OpenAI model that catches all 5 bad answers and passes at least 4 of the 5 good
  ones. Then run that model a second time: if any of its 10 grades differ between the two
  runs, it doesn't win, and the next model up is tried. Record the chosen model ID and the
  calibration results (both runs) in this file.
- **How calibration runs (task T063)**: locally, by hand, before the AI test runner
  (T073) exists. The developer runs `tests/ai/grader/calibrate.test.ts` with their own
  `OPENAI_API_KEY` from `.env` (never committed), tries models from smallest up, and
  records each model tried, its result (bad answers caught out of 5, good answers passed
  out of 5), and the run date in this file. The first `ai-tests` run (T073, on T015's PR)
  includes the signed-off calibration entries, so it re-confirms the chosen model on
  GitHub.
- **Calibration results (task T063, run by the owner on 2026-11-24, U.S. Central)**:
  - **Model tried**: `gpt-6-luna` with reasoning effort `low`. Only this model was tried; the
    owner picked it from OpenAI's official models page.
    gpt-6-luna is the smallest non-deprecated OpenAI text model: it is the lowest-priced
    flagship model, and OpenAI's deprecations page lists it as the replacement for the older
    small models (gpt-5-nano, gpt-5.4-nano, GPT-4.1 mini, GPT-4o mini), which are all
    scheduled for shutdown. Sources: https://developers.openai.com/api/docs/models and
    https://developers.openai.com/api/docs/deprecations (checked 2026-11-24).
    Sources checked 2026-11-24: the deprecations page directly; the prices from the owner's
    screenshot of the models page.
  - **Run 1** (8:07 PM): passed. Per-entry grades weren't captured, because Vitest hides
    printed output from passing tests unless `--silent=false` is given.
  - **Run 2** (8:08 PM): bad answers caught **5 of 5**, good answers passed **5 of 5**.
  - **Run 3** (8:09 PM, the repeat run): bad answers caught **5 of 5**, good answers passed
    **5 of 5**. All 10 grades were the same as in run 2.
  - **Chosen grader model**: `gpt-6-luna`, reasoning effort `low`, written in
    `src/config/models.ts`.
  - **How to run calibration**: `node --env-file=.env node_modules/vitest/vitest.mjs run
    --project ai tests/ai/grader --silent=false`. `--env-file=.env` loads `OPENAI_API_KEY`
    (the test tool doesn't read `.env` by itself), and `--silent=false` shows each entry's
    grade and reason (Vitest hides printed output from passing tests otherwise).
- **What the grader sees**: the scrubbed question, the label sections given to the answer
  AI, and the answer. Never the raw question (FR-020).
- **Output**: `pass` or `fail`, plus a short reason.
- **Alternatives**: Google Gemini. It would also work. OpenAI was picked because its key
  is already in `.env.example`.

## R5. Database and reviewer logins

- **Decision**: **Supabase** (a hosted Postgres database with built-in logins).
  - Reviewers and the owner sign in with Supabase Auth (email and password). Public
    sign-up is turned off, and the owner creates each account. Patients never sign in.
  - **Row Level Security** (database rules that decide who can read or change each row)
    makes sure only signed-in reviewers can read logs, and only the owner can record
    grader-flag decisions.
  - The service role key (full admin power) is used only in server code.
- **Alternatives**: Netlify Blobs or plain files. Rejected: no logins, no access rules,
  and harder to search for the privacy test (SC-006).

## R6. Getting the label from openFDA, and checking for updates

- **Decision**:
  - **First download**: Ask openFDA's drug label endpoint for the Eli Lilly label of each
    drug, for example
    `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"REYVOW"+AND+openfda.manufacturer_name:"Eli Lilly"&limit=1`.
    Save the whole record, its `set_id` (the label's permanent ID), and its
    `effective_time` (the label date) in Supabase.
  - **Update check** (once a day, by the `label-check` scheduled function): Ask openFDA
    only for a label with the same `set_id` **and** a date **newer** than the saved one:
    `search=set_id:"<id>"+AND+effective_time:[<saved date + 1 day>+TO+99991231]`.
    If nothing is newer, openFDA answers "no matches" (a tiny reply), and **no label is
    downloaded**. If something is newer, that reply is the new label, and we save it.
  - **openFDA down**: Keep using the saved label (FR-028). Log the failed check (no
    question text is involved).
- **Why**: This meets constitution VII and SC-008. The label is downloaded again only when
  its date changes.
- **Alternatives**:
  - Re-download and compare each day. Rejected: it downloads the label every day.
  - DailyMed version API. Rejected: the constitution says openFDA is the only data source.

## R7. Label sections

- **Decision**: openFDA splits a label into named fields (for example
  `warnings_and_cautions`, `adverse_reactions`, `dosage_and_administration`). We keep a
  fixed map from field name to the section name people see (for example
  `warnings_and_cautions` → "Warnings and Precautions"). A section "really exists"
  (FR-018) when that field is present and not empty in the saved label.

## R8. Finding emergency phrases (no AI)

- **Decision**: Plain code that runs before anything else (FR-004). Full rules are in
  [contracts/emergency-rules.md](contracts/emergency-rules.md). In short:
  1. **Normalize**: lowercase the text, turn punctuation into spaces, and squash repeated
     spaces.
  2. **Exact match** against each phrase and its listed variants (for example "suicidal",
     "kill my self", "killing myself").
  3. **Typo match**: each word may be off by a small number of letters, judged by *edit
     distance* (how many single-letter changes turn one word into another). Words of 4–7
     letters may be off by 1. Words of 8 or more letters may be off by 2.
- **Why**: It's fast (well under SC-013's 1 second), it's predictable, and every phrase
  can be tested. Catching a few non-emergencies by mistake is acceptable. The spec says
  that's safer than missing one.
- **No skip list**: Real words close to emergency words ("paint", "painting", "saint"
  next to "faint", "fainting") still trigger the emergency message. A real word can also
  be a typo hiding a real emergency, and Safe comes before Fair and Equitable (spec
  PC-6). Fast tests show these false alarms on purpose. Each emergency log row records
  which phrase IDs matched (FR-054), so the owner can measure how often false alarms
  happen before considering a constitution amendment.
- **Alternatives**: An AI classifier. Rejected: the constitution says emergency phrases
  must skip the AI completely.

## R9. Sorting emergency questions into cases (no AI)

- **Decision**: Fixed word rules exactly as FR-047 says. They're spelled out in
  [contracts/emergency-rules.md](contracts/emergency-rules.md). "Happening now" signs
  ("I", "me", "now", …) are matched as **whole words** only, so "Is" doesn't count as "I".
  The drug name must be spelled correctly (any capitalization). A misspelled drug name
  makes the question "unclear".

## R10. Removing personal details (scrubber)

- **Decision**: Plain code, no AI. It runs right after the emergency check and before any
  AI or storage.
  - **Emails**: a standard email pattern → `[EMAIL]`.
  - **Phone numbers**: US and international number patterns → `[PHONE]`.
  - **Names**, in three layers. "Mask when unsure" wins. Each run of name words becomes
    one `[NAME]` ("Jane Doe" → `[NAME]`):
    1. Intro phrases: "I'm X", "I am X", "my name is X", "this is X", and sign-offs
       ("thanks", "thank you", "thx", "regards", "best", "cheers", "sincerely", then X).
       X is masked only if it starts with a capital letter and isn't a protected word;
       capitalized words right after it (the last name) are masked with it. So "I'm
       pregnant" stays (owner's decision 3A, 2026-11-27).
    2. A name finder from the `compromise` text library, which runs on our server.
       Titles in front (Dr., Mr., Mrs., Ms.) stay visible. **Guard**: a single everyday
       English word it flags at the start of a sentence is left alone ("Will Emgality
       make me tired?"); a two-word name there ("Bob Johnson said…") is still masked.
    3. Any capitalized word that isn't at the start of a sentence and isn't protected →
       `[NAME]`, if it isn't an everyday English word **or** it is on the common
       first-name list (R22). So "Grace" and "Will" mid-sentence are masked; so is "in
       May" (owner's decision 2A, 2026-11-27).
  - **Protected words** (never masked by any layer; owner's decision 1A, 2026-11-27):
    our 4 drug names, **every name on the other-drug list**
    (`src/lib/refusals/other-drugs.json`, R14) and the class words, their near-miss
    typos (below), label section names, and **relationship words** (57 words such as
    sister, wife, mom, son, grandma, aunt, friend, doctor, nurse, with "-s" or "'s";
    owner-approved 2026-11-27). When the name finder flags a relationship word with a
    name ("sister Maria"), only the name is masked: "My sister [NAME]". Everyday English
    words are **not**
    protected: the English word list holds nearly every common name (jane, smith, maria,
    grace), so protecting them would let the name finder's finds through. English words
    only stop layer 3.
  - **Why other drugs are known words**: the scrubber runs **before** the refusal rules.
    If "Imitrex" or "Ubrelvy" were masked as `[NAME]`, the comparison and other-drug
    refusals could never see them. Drug names aren't personal details, so keeping them
    is safe. The scrubber never masks a protected word, even when the name finder (layer
    2) flags it.
  - **Misspelled drug names (spec PC-9)**: a word that is a near-miss typo of a protected
    drug name (same typo rules as R8) is also left visible, so "Imitrx" and
    "Reyvo" still reach the refusal rules and drug matching. **Safeguard**: if that word is
    also on the common first-name list (R22), it is masked anyway. This keeps the privacy
    cost small: only an unusual name one or two letters off a drug name could stay
    visible.
- **Alternatives**: Sending text to an AI to find names. Rejected: the raw text would
  reach an AI before being scrubbed.

## R11. Grader timing and the 10% sample

- **Decision**: When a real answer is made, the server draws a secure random number. If
  it's below 0.10, the answer is marked "to be graded" (FR-036). This applies to every
  AI-written answer shown to a patient, **including personal-dosing summaries**, which
  are the highest-risk text the app shows. Emergencies, rule-based refusals, label
  pointers, and the word-for-word dosing fallback (spec PC-7) show no AI text, so they
  aren't sampled. The `grading-worker`
  runs every 10 minutes and grades waiting answers. If the grader is down, the status
  stays "not graded yet", and it tries again later, up to 5 times (Edge Cases).
- **Test answers**: The AI test suite grades **every** answer right away (FR-035).
- **Why**: Patients never wait on the grader.

## R12. Choosing which label sections to send to the AI

- **Decision**: Simple keyword scoring over the saved label sections, plus a
  **synonym map** that links everyday words to label words ("shot" → "injection",
  "throw up" → "vomiting", "side effects" → "adverse reactions"). Words with typos are
  matched with the same edit-distance rule as R8. The top 3 sections (up to about 4,000
  tokens, or roughly 3,000 words) are sent to the AI.
- **Why**: Smaller input means a small model works well and costs less (VII). The synonym
  map and typo matching help the "same question three ways" tests (FR-043).
- **Alternatives**: Embeddings (number-based meaning search). Rejected for now. It adds
  a service and cost, and a label is short enough for keyword search.

## R13. Checking answers before they're shown

- **Decision**: Every AI answer must pass code checks before anyone sees it:
  - 120 words or fewer (FR-015).
  - Reading level grade 9 or lower using the **Flesch-Kincaid grade** formula. Drug names
    and label section names are left out of the score (spec Assumptions).
  - Every cited section exists in the saved label (FR-018).
  - The answer cites at least one section and shows the label date (FR-017).
  - If a check fails, the AI tries once more, but **only if at least 3 seconds are left**
    in the 9-second limit. If it fails again, or there's no time to retry, the app shows
    the **label-section pointer** (FR-052): "I couldn't put this into plain language
    reliably. The answer is in the [section name] section of the label (dated [date])."
    with a link to `/label/[drug]#[section]`. It doesn't show an unchecked answer, and it
    doesn't say "The label doesn't cover this," because that would be false.
  - **Which section the pointer names**: the first section the AI cited that really
    exists in the saved label. If none does, the top section from the section search
    (R12).
  - **Time sharing** (FR-053): the 9 seconds start when the request arrives. Each AI call
    gets a timeout equal to the time left minus 0.5 seconds, which is kept back for
    building the reply and saving the log row. If the **first** AI call runs out of time,
    the reply is "try again later." When both drugs are asked about, the two drug
    answers run at the same time, each with the same deadline.
  - Personal-dosing summaries go through the same checks. If they fail, the dosing
    fallback (word-for-word "Dosage and Administration" text, spec PC-7) is used, not the
    pointer. The fallback is also used when no answer AI is available (down, failing, or
    not built yet), and when the dosing AI marks its summary `not_covered` or `refusal`.
- The AI returns **structured output** (a fixed JSON shape: answer text, sections used,
  answer type), so code can check it reliably.

## R14. Refusals (dosing, comparisons, other drugs, which drug)

- **Decision**: Two layers.
  1. **Rules first (no AI)**, in `src/lib/refusals/rules.ts`. Checked top to bottom; the
     first match wins:
     1. **Comparison**: two *different* drugs are named (a brand and its generic count as
        one; a drug-class word counts as a drug) plus comparison words: "better than",
        "vs", "compared to", "instead of". The word "or" counts **only inside comparison
        phrasing**: together with "which", "better", "best", "worse", "stronger", "safer",
        "choose", or "should I take/use … or …". So "Which is better, Emgality or
        Reyvow?" is refused, but "How are Emgality or Reyvow given?" is answered for each
        drug.
     2. **Other drug**: any drug that isn't ours is named. The other-drug list (R20) has
        the openFDA names plus the owner-reviewed **drug-class words** ("triptan",
        "SSRI", "beta blocker", and the rest in `src/lib/refusals/drug-names.ts`). This
        includes interaction questions ("Can I take Reyvow with an SSRI?"), even when the
        label covers them (docs/risk-review-notes.md).
     3. **Which drug**: neither of our drugs is named → "Do you mean Emgality or Reyvow?"
     4. **Personal dosing** (FR-011). Always counts: "how much … should I" and "how many
        … should I" (up to 4 words between), "I weigh", "for my age", "take another",
        "a second dose", "take two" / "take 2" (not when the next word is a time word:
        minute, hour, day, week, month, year, or their plurals), "double my dose".
        Counts only together with a dose word (dose, doses, dosing, dosage, mg, tablet,
        pill, injection, shot, their plurals, "how much", "how many"): "my weight",
        "safe for me", "my son", "my daughter", "my child", "my kid", "my kids",
        "my children". With both of our drugs named, the reply asks which drug instead
        (owner's decision 4A, 2026-11-26). Known false alarms are kept on purpose and
        recorded as tests (for example "How many days should I wait…").
     5. Otherwise the question isn't refused and goes on as `emgality`, `reyvow`, or
        `both`.
  - **Drug names are matched with the R8 typo rules**: "Imitrx" counts as Imitrex
    (FR-013), and "Reyvo" counts as Reyvow, with the reply saying "Answering about Reyvow
    (you typed 'Reyvo')." (FR-056). An exact match wins; "'s" and a plural "s" are
    ignored. Two limits (owner's decisions, 2026-11-26):
    - A word on the English word list (R19) is never a typo of a drug name (2A):
      "clarity" isn't Claritin.
    - **Closer-English rule**: a misspelled word at least as close to an English word as
      to another drug's name isn't that drug ("migrane" is migraine, not the product
      "migraide"). English words that are themselves on the drug list (aspirin) don't
      count. The trade-off: some misspelled drug names pass the rules (for example
      "Botx", 1 change from "box"); in a check of 1,367 simple typos of well-known names,
      88 (6%) passed, almost all of names with 7 letters or fewer. They rely on layer 2.
    - If a misspelled word is equally close to one of our names and another drug, it
      counts as the other drug (refused).
  - **Trigger words other than drug names must be exact** (capitals, punctuation, and
    "'s" ignored). Typo matching only added false alarms ("make another", "same for me").
  - The emergency path doesn't use any of this; there, only exact names count (PC-1).
  2. **AI backstop**: The prompt tells the AI to label its answer type as `refusal` when
     a question slips past the rules.
- Personal-dosing questions still get the general dosing text from the label, with "Ask
  your doctor or pharmacist" (FR-011). The summary is written with the `dosing-v1` prompt
  from the "Dosage and Administration" section only. The AI never sees the question: it
  gets a fixed app sentence through `appText()` (owner's decision 3A, 2026-11-26).

## R15. Two tiers of tests

- **Decision**: **Vitest** (a test runner) with two test groups:

  | Tier | Folder | Calls an AI? | When it runs |
  |---|---|---|---|
  | **Fast** | `tests/fast/` | No. AI calls are replaced by a fake that gives fixed replies. | Every PR, automatically |
  | **AI** | `tests/ai/` | Yes: Haiku 5.5 plus the OpenAI grader | On pull requests and by hand (GitHub Actions "Run workflow" button). Every run waits for the owner's approval in the `ai-tests` environment. Required before merging PRs that change a file on `.github/ai-related-paths.txt`, and before every release (constitution v3.0.0, III). |

- **Fast tier** covers every emergency phrase and case (FR-010, FR-050, FR-051), the
  scrubber, refusal rules, answer checks (R13), label caching (with saved openFDA sample
  replies, so no live calls), logging, and review-page access. It runs against a local
  Supabase database started inside GitHub Actions. That lets the "search all stored data
  for the raw question" test (SC-006) run for real.
- **AI tier** runs the test question set through the real pipeline and real AI clients.
  The grader grades every test answer, including emergency replies and rule-based
  refusals. It checks the finished reply after the pipeline has made it, so the reply
  itself never calls an AI for an emergency. Results are saved to the **online**
  Supabase database, tagged with the commit ID, so `ai-gate`, the release workflow, and
  the owner's flag page can all see them.
- **The AI tier starts small, in Phase 2** (before any story): the runner, the test-run
  recorder, and the grader calibration set (R4) as its first checked entries. Each story
  then adds its own AI-tier questions, and the owner signs them off (`checked_by`,
  `checked_on`) in the same PR. By the end it has at least 20 questions (FR-040).
- **A run passes only when** at least one checked entry ran and all of them passed. A run
  with no entries fails, so a pass always means something was tested. If the grader is
  down for any test answer, the run is `incomplete`, which never counts as passing.
- **Model match**: each run records its answer model and grader model. `ai-gate` and the
  release check accept a run only if both match `src/config/models.ts` at that commit.
  So a hand-started run with a different model (for example, the Sonnet comparison in
  R3) can never let a PR merge or a release go out.
- **The first passing run** must include the signed-off calibration entries. They count
  as human-checked entries for ending the startup exception (constitution III v3.0.0;
  spec Clarifications 2026-11-16).
- **Run report**: each run reports the label-pointer rate (SC-004) and each answer's
  time, with the slowest 5% compared to the 10-second goal (SC-013). The pointer rate is
  saved on the `test_runs` row. Above 5% is a clear warning on a PR (it doesn't block the
  merge) and fails the release check (R21).
- **Pass rule**: the rule that decides whether a run is `passed`, `failed`, or
  `incomplete` is a pure function in `src/lib/ci/run-status.ts`, which is on the
  AI-related list. The whole AI test tier (`tests/ai/**`) is on the list too.
- **The AI tier never sends blank or non-English questions.** Those make no AI calls and
  are fully covered by fast tests. This keeps every AI-tier log row marked
  `source = test`, while blank and non-English rows hold only reply type and time
  (FR-055).

## R16. GitHub Actions (automatic checks on GitHub)

- **Decision**: Four workflow files in `.github/workflows/`. They're created during
  implementation, once the code and `package.json` exist. Before that, they would fail
  every PR.

  | Workflow | Runs when | What it does | Check name |
  |---|---|---|---|
  | `fast-tests.yml` | Every PR, every push to `main` | Install, type-check, lint, start local Supabase, run fast tests | `fast-tests` |
  | `ai-tests.yml` | Every PR (the PR's latest commit) and by hand (choose branch and model). Each run waits for the owner's approval in the `ai-tests` environment. | Run the AI test tier, grade every test answer, save results for that commit (including which answer model and grader model were used) to the online database | `ai-tests` |
  | `ai-gate.yml` | Every PR | (1) If the PR changes a file on `.github/ai-related-paths.txt`, require a passing AI test run for the PR's latest commit. (2) For every PR, require that all grader flags from that run have an owner decision. | `ai-gate` |
  | `release.yml` | A `v*` tag is pushed | Check the tag was pushed by the owner, require a passing AI test run with all flags decided and a pointer rate of 5% or less for the tagged commit, then publish to Netlify (R21) | `release` |

- **AI-related files**: `ai-gate` reads the official list, **`.github/ai-related-paths.txt`**,
  every time it runs (constitution v3.0.0, III). It never keeps its own copy, so a change
  to the list takes effect right away. The list includes itself, so changing the list
  also needs a passing AI test run. CODEOWNERS names the owner for that file.
- **Workflow and gate files**: `.github/workflows/**`, `scripts/ai-gate.ts`, and
  `src/lib/ci/**` were added to the list in PR #13 (task T083). That PR merged without a
  passing AI test run, which broke constitution III (v2.0.0). It is recorded in
  `docs/rule-incidents.md`. Its late check is the first passing AI test run on a `main`
  commit that includes PR #13's change (`ac46453`), after T073 is merged and T068 is done.
- **Pattern rules**: one pattern per line. `**` means "everything inside this folder."
  Lines starting with `#` and blank lines are skipped. A line with no `*` matches that
  exact file.
- **Secrets**: API keys are stored as **GitHub Actions secrets** (encrypted settings on
  GitHub, not files in the repo). Rule 5 is followed.
  - The AI keys for `ai-tests` and its database login live in a GitHub
    **environment** named `ai-tests`. The Netlify token lives in an environment named
    `release`. A GitHub environment is a locked group of secrets that a workflow can use
    only after the owner approves the run. This stops a changed workflow on a branch from
    reading the keys without the owner knowing.
  - `ai-tests` writes results with a **limited writer login**, `ai_tests_writer`
    (`AI_TESTS_DATABASE_URL`, migration `0004_ai_tests_writer.sql`), never the online
    database's admin key (owner's decision 2026-11-24). It can only add `test_runs` rows
    with status `running` (starting fields only) and finish a row that is still `running`
    through the database function `finish_test_run`. It can't read, change, or delete any
    row directly, or touch any other table, so a leaked key can't flip a finished run to
    `passed`. It can still add and finish a new fake row; T015 considers a check against
    GitHub's own record of the workflow run. The connection string must be Supabase's
    **pooler** address, because GitHub can't reach the direct database address. When
    later tasks write more (for example `grader_results` in T059), they give this login
    just that extra access.
  - **Encrypted, checked connections**: every connection string to the online database
    (`AI_TESTS_DATABASE_URL`, and `AI_GATE_DATABASE_URL` later) ends in
    `?sslmode=verify-full&sslrootcert=supabase/certs/supabase-root-2021.crt`. The
    pooler's certificate is signed by Supabase's own root ("Supabase Root 2021 CA"),
    not a public one, so the `pg` library needs that root to confirm it's really talking
    to Supabase. The root certificate is public, not a secret, and is committed at that
    path (checked 2026-11-25: same fingerprint as the root the pooler sends). The online
    project also has "Enforce SSL on incoming connections" turned on (T071 step 6), so
    unencrypted connections are refused.
  - `ai-gate` reads results with a **read-only** database login, `ai_gate_reader`
    (`AI_GATE_DATABASE_URL`, migration `0005_ai_gate_reader.sql`), that can only read
    `test_runs`, `grader_results`, and `owner_flag_decisions`. It starts with `test_runs`
    only (task T071). Read access to the two grader tables is added once they exist, by a
    migration (task T086, after T055). Because Row Level Security is on, each table needs
    a row rule for this role as well as the read permission; without it the gate would
    see zero rows, with no error. Its password is set only through a scrambled version
    (SCRAM verifier, `scripts/scram-verifier.mjs`), never typed into SQL, because the
    database logs those commands word for word. `AI_GATE_DATABASE_URL` is a
    **repo-wide** secret (ai-gate runs on every PR without approval), so any branch's
    workflow can use it; that is why the login must stay read-only.
  - **Leftover risks (owner's decision 2026-11-25, to be closed by T089):** `ai-gate` runs on `pull_request`, so GitHub uses the **PR's own copy** of `ai-gate.yml` and `scripts/ai-gate.ts`. A PR could edit them to pass, or add its own job named `ai-gate` (required checks may be matched only by name). `ai-tests` likewise runs the PR's own runner and tests. A leaked `ai_tests_writer` key could add and finish a fake passing row. Until T089, the owner reads every PR's changes to the gate and runner before approving an `ai-tests` run (T068, quickstart section 9 step 8), and reviews every PR before merge (R17). The gate reads the AI-related list from both `main` and the PR, so a PR can't remove its own files from the list.
  - The online database's admin key is **never** put in a local `.env` file. Local work
    uses the local database. That way the bot account can't write test results to the
    online database by itself.
- **Alternatives**: Netlify's build step running the tests. Rejected: GitHub can't use
  that as a required check as cleanly, and AI tests would run on every deploy.

## R17. Branch protection and the bot account

- **Decision**: Claude opens PRs from a separate GitHub account (a "machine user", for
  example `labeltrace-bot`). That way the owner (`alexcaldwelll`) can truly approve them.
  GitHub never lets people approve their own PRs. GitHub's terms allow one free machine
  account per person.
- **Bot setup (owner does this)**:
  1. Create the bot GitHub account with its own email.
  2. Add it to the repo as a collaborator with **Write** access (not Admin).
  3. On this computer, sign the `gh` tool in as the bot (`gh auth login`). Git pushes
     also use the bot's login.
  4. Set this repo's git identity to the bot (this repo only, not global):
     `git config --local user.name "labeltrace-bot"` and
     `git config --local user.email "357053411+labeltrace-bot@users.noreply.github.com"`.
     This is GitHub's no-reply email for the bot (account ID `357053411`), so commits
     show up as the bot's without exposing a real email.
- **Branch protection settings for `main`** (Settings → Branches → Add rule, pattern
  `main`):

  | Setting | Value |
  |---|---|
  | Require a pull request before merging | ✅ On |
  | → Required approvals | **1** |
  | → Dismiss stale approvals when new commits are pushed | ✅ On |
  | → Require review from Code Owners | ✅ On (needs `.github/CODEOWNERS` with `* @alexcaldwelll`) |
  | → Require approval of the most recent reviewable push | ✅ On |
  | Require status checks to pass before merging | ✅ On |
  | → Require branches to be up to date before merging | ✅ On |
  | → Required checks | `fast-tests`, `ai-gate` |
  | Require conversation resolution before merging | ✅ On |
  | Do not allow bypassing the above settings | ✅ On (rules apply to admins too) |
  | Allow force pushes | ❌ Off |
  | Allow deletions | ❌ Off |

- **Order matters**: GitHub only lists a check name after it has run at least once. So
  each check becomes required as soon as it first runs:
  - `fast-tests`: right after its workflow (task T006) runs. Owner task T070.
  - `ai-gate`: right after its workflow (task T015) runs. Owner task T068. The small AI
    test tier is built in Phase 2, before this, so AI-related PRs can pass it from the
    start.
- **Tag ruleset for releases** (Settings → Rules → Rulesets → New tag ruleset), owner
  task T075:

  | Setting | Value |
  |---|---|
  | Target tags | `v*` |
  | Restrict creations | ✅ On |
  | Restrict deletions | ✅ On |
  | Block force pushes | ✅ On |
  | Bypass list | The owner (`alexcaldwelll`) only. **Not** the bot. |

  The release workflow also checks that the tag was pushed by `alexcaldwelll`, as a
  second lock.
- **Alternatives**: Admin override, or zero required approvals. Rejected by the owner on
  2026-11-15.

## R18. Keeping the raw question out of storage

- **Decision**: The raw question exists only in memory during one request. There is **no
  outside error-reporting service**. Server messages go only to Netlify's function logs,
  through one logger, `src/lib/log/server-log.ts`:
  - It accepts question text only as `ScrubbedText` (the scrubbed type), so passing raw
    text won't compile.
  - For blank and non-English questions it takes no question text at all (FR-055).
  - Errors are logged by type and message only, never with the request body. Before an
    error message is written (owner's decisions, 2026-11-27):
    1. The raw question is cut out of it and replaced with `[QUESTION]`. The logger
       gets the raw question only for this cut; it never writes it.
    2. The rest of the message is scrubbed like a question (names, emails, phones).
    3. Any run of 4 or more digits, even split by dashes, dots, or spaces, becomes
       `[NUMBER]`, so part of a phone number ("555-123") can't show. This is for error
       messages only; questions keep their numbers ("1000 mg").
  - A thrown value that isn't an Error is logged only by its kind (for example
    "string"), never its value, since the value could be anything, even the request
    body.
  - Lint bans `console` everywhere in `src/**` except this one file.
- A fast test spies on the logger and on `console` and fails if raw text shows up. The
  fast tier's SC-006 test searches every database table for the raw text after the
  privacy tests.

## R19. Language and length checks

- **Decision**: Blank question → friendly "Please type a question." Longer than 1,000
  characters → cut to 1,000, and the user is told. Non-English questions are found with
  the small `franc-min` library and get "I can only answer in English right now." The
  emergency check still runs first on the full text.
- **Language check on the emergency path**: the same language check (in
  `src/lib/pipeline/language.ts`) runs after an emergency match and **before the log row
  is saved**. The emergency message shows either way. If the question isn't English, the
  row holds only the reply type (`emergency`) and the time (FR-055, spec PC-8).
- **Short questions**: language detection often gets very short text wrong. A question
  under 30 characters counts as English only if every word is an English word, a drug
  name, or a number (FR-055). So "chest pain?" is English, but "¿Reyvow causa náuseas?"
  is not, and a short non-English question is never cleaned by the English-only scrubber
  or logged with text (constitution V).
  - **English word list**: comes from a **published** word list, never written from
    memory. Built by `scripts/build-english-words.ts` (task T013) and saved to
    `src/lib/pipeline/english-words.json` with its source URL, download date, and count.
- **Word list record** (task T013):
  - **Source**: SCOWL (Spell Checker Oriented Word Lists), size 60, American English, made
    with the English Speller Database (ESDB, the newer name for SCOWL) web tool by Kevin
    Atkinson. Header settings: Size 60, Spelling US, Variant Level 1 (default), no special
    lists, accents stripped. ESDB revision `1e5b7d3`.
  - **Exact URL**: `https://app.aspell.net/create?max_size=60&spelling=US&diacritic=strip&download=wordlist&encoding=utf-8&format=inline`
  - **Download date**: 2026-11-23
  - **SHA-256 checksum** of the downloaded bytes: `bfbc258a6baaa50aec6fe07330b25b57cd90f3dd429345b8280df0414ccf242c`
  - **License**: SCOWL/ESDB license. Free to use, copy, change, share, and sell, as long
    as the copyright notice and permission notice stay with every copy. The full notice
    is saved in the `notice` field of `english-words.json`.
  - **Number of words**: 106,859 (lowercase, no repeats).
- **Longer questions**: the "every word is known" rule also counts a question of 30
  characters or more as English, before `franc-min` is asked. `franc-min` alone gets
  some plain English questions wrong (it reads "Can I drive after taking Reyvow
  tablets?" as Dutch and "Is it safe to take Reyvow while pregnant?" as French). Only
  text made entirely of known words gets through this way, so it stays safe for
  privacy.
- **Drug names**: until T024, only our 4 names (`emgality`, `galcanezumab`, `reyvow`,
  `lasmiditan`) count as drug names. T024 adds the full lists.

## R20. Other-drug name list

- **Source**: the openFDA drug label endpoint, built by `scripts/build-drug-names.ts`
  (`npm run drugs:build`) and saved to `src/lib/refusals/other-drugs.json`. Never written
  from memory. The 4 queries (run 2026-11-26):
  1. `https://api.fda.gov/drug/label.json?search=indications_and_usage:migraine&count=openfda.brand_name.exact&limit=1000`
  2. `https://api.fda.gov/drug/label.json?search=indications_and_usage:migraine&count=openfda.generic_name.exact&limit=1000`
  3. `https://api.fda.gov/drug/label.json?count=openfda.brand_name.exact&limit=1000`
  4. `https://api.fda.gov/drug/label.json?count=openfda.generic_name.exact&limit=1000`
- **Download date**: 2026-11-26. **Number of names**: 999 (897 from the 4 queries, plus
  102 common brands).
- **Cleaning** (owner's decision 1A, 2026-11-26): openFDA's names are product names
  ("Dove", "Water", "Migraine Relief"), so each name is split into words and words under 4
  letters are dropped. A word that isn't on the English word list (R19) is kept
  automatically (imitrex, ubrelvy, sumatriptan). Of the 385 words that are English words,
  the owner reviewed every one (`src/lib/refusals/english-word-drugs.json`): 59 kept (for
  example aspirin, ibuprofen, tylenol, magnesium), 326 left off (for example water,
  alcohol, caffeine, headache, migraine). An English word that the owner hasn't reviewed
  is left off and printed by the script for review. Our 4 names and the "never on the
  list" words (cgrp, ditan, antibody, monoclonal, serotonin, medicine, medication, drug,
  vitamin, supplement) are always removed.
- **Drug-class words**: hand-written and reviewed by the owner (2026-11-26), like the
  emergency phrase list, because openFDA has no field with the class words people type.
  They live in `src/lib/refusals/drug-names.ts` (`DRUG_CLASS_WORDS`, `DRUG_CLASS_PHRASES`).
- **Known gap**: these queries count labels, so a brand sold under one label (for example
  Zoloft, Lexapro, Xanax, Prozac, Ambien, Benadryl, Ozempic, Aleve) isn't in the top
  1,000. The common-brands list below adds the best-known ones; any other such brand
  isn't on the list, and questions about it rely on the AI backstop (R14 layer 2).
  A fuller openFDA source is follow-up task T091.
- **Common brands** (owner-reviewed 2026-11-26, `src/lib/refusals/common-brands.json`):
  102 very common brands the count queries miss (for example Zoloft, Lexapro, Xanax,
  Ozempic, Lipitor). Hand-picked, but never added from memory: every time the script
  runs, it confirms each brand with an openFDA query, first in the drug label data
  (`openfda.brand_name:"<brand>"`), then in Drugs@FDA (`products.brand_name:"<brand>"`),
  and stops if any isn't confirmed. On 2026-11-26, 76 were confirmed in the label data and
  26 in Drugs@FDA. `other-drugs.json` records each brand's dataset, query address, and
  number of matches (`common_brands`). The 13 migraine brands the owner asked about
  (Topamax, Inderal, Depakote, Maxalt, Zomig, Relpax, Treximet, Nurtec, Ubrelvy, Qulipta,
  Aimovig, Ajovy, Vyepti) were already on the list from the queries.

## R21. Releases

- **Decision**: A **release** is a `v*` tag (for example `v1.0.0`) pushed by the owner,
  with a **passing AI test run for that commit** and every grader flag from that run
  decided. Nothing else counts as a release.
  - Only the owner can create or delete `v*` tags (tag ruleset, R17). The bot can't.
  - `release.yml` runs on the tag. It (1) checks the tag was pushed by `alexcaldwelll`,
    (2) uses the same check code as `ai-gate` (`src/lib/ci/gate.ts`) to require a passing
    `test_runs` row for the tagged commit with all flags decided and a label-pointer
    rate of 5% or less (SC-004), and (3) publishes that
    commit to Netlify's live site (T074b, at the release milestone). The tagged commit
    must be on `main`.
  - **How publishing will work (planned, T074b; owner's decision 2026-11-25)**: until
    Netlify's site exists (T072), `release.yml` runs the release check only, in a job
    with no environment and only the read-only `AI_GATE_DATABASE_URL`; a passing check
    publishes nothing. The planned method (PUB-A): Netlify builds every `main` commit but
    doesn't publish it (auto-publishing off). A `publish` job, which runs only after the
    check passes and is the only job using the `release` environment and its Netlify
    secrets, finds Netlify's deploy for the tagged commit and publishes it through
    Netlify's API. No Netlify command-line tool is installed. To be confirmed against
    Netlify's API docs at T074b.
  - Netlify's automatic publishing of `main` is turned off. Merges to `main` don't
    change the public site. Deploy previews for PRs still work.
- **Secrets (names only)**: `NETLIFY_AUTH_TOKEN` (lets the workflow publish) and
  `NETLIFY_SITE_ID` are GitHub secrets in the `release` environment. They're never put in
  a file. `.env.example` lists `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` as names with
  no values, so people know they exist.
- **Why**: Netlify publishes `main` on every merge by default, which would make every
  merge a release. A tag pushed by the owner keeps releases rare, deliberate, and always
  tested (constitution III).
- **Alternatives**: Every merge is a release (AI tests on every PR, more cost). A manual
  publish button in Netlify (no automated check). Both rejected by the owner on
  2026-11-15.

## R22. Common first-name list (scrubber safeguard)

- **Decision**: The scrubber leaves near-miss typos of drug names visible (spec PC-9), but
  always masks a word that is also a common first name. The list of common first names
  comes from public government data, **not from memory**:
  - **Source**: the U.S. Social Security Administration's national baby-name data (every
    first name given to at least 5 babies in a year, by year, from 1880 on), downloaded as
    `names.zip` from the SSA's baby-names data page
    (`https://www.ssa.gov/oact/babynames/limits.html`).
  - **Which names count as "common"**: names with at least 1,000 recorded births in
    total, across all years and both sexes.
  - **Built by**: `scripts/build-first-names.ts` (task T032), saved to
    `src/lib/scrub/common-first-names.json` with its source URL, download date, and count.
- **The download**: `https://www.ssa.gov/oact/babynames/names.zip`, from the SSA page
  "Beyond the Top 1000 Names" (`https://www.ssa.gov/oact/babynames/limits.html`). The
  SSA site refuses automated downloads (HTTP 403), so the owner downloads the zip by
  hand in a browser, and the script reads that file (owner's decision 4A, 2026-11-27):
  `npm run names:build -- ~/Downloads/names.zip`.
- **This list**: downloaded 2026-11-27; data for 1880–2025; SHA-256 of the zip
  `cd78e975ed7bb358e018dd62fbe14ced89295e9581c49172ca4eedcb011b3724`; **11,872 names**
  with 1,000+ births.
- **Why SSA data**: it's public, free, official, and covers U.S. first names going back
  many decades. U.S. Census data mostly covers last names, so it fits this job less well.
- **Alternatives**: A hand-written list (rejected: written from memory, and incomplete).
  No safeguard (rejected: a real first name that happens to be close to a drug name
  would be left visible).

---

All "NEEDS CLARIFICATION" items are resolved. Two results are **measured later**, not
guessed now: the grader model ID (R4 calibration) and the Haiku-vs-Sonnet comparison
(R3).
