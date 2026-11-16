# Contract: Web API

**Feature**: `001-labeltrace-qa` | **Plan**: [../plan.md](../plan.md)

This file lists the server's web addresses ("endpoints"). For each one it says who may use
it, what it takes in, and what it sends back. All bodies are JSON. Field names here are
binding: code and tests must match them.

---

## POST /api/ask

**Who**: Anyone (patients don't sign in).

**Request**

```json
{ "question": "Does Emgality cause injection site pain?" }
```

- `question` is required. Blank → `kind: "prompt_for_question"`. Over 1,000 characters →
  cut, with `truncated: true` in the reply.
- The server must never log, store, or echo the raw `question`.
- **Time limit**: the whole reply is sent within 9 seconds (FR-053). See
  [R13](../research.md#r13-checking-answers-before-theyre-shown).

**Reply**: always HTTP 200 with one of the shapes below. Every reply has
`"disclaimer": "LabelTrace is an AI, not a doctor."`

| `kind` | When | Extra fields |
|---|---|---|
| `emergency` | Emergency phrase found | `messages` (in order: 911 first, then 988), `case`, `label_excerpts` (informational medical only, else empty), `not_covered` (yes/no) |
| `answer` | Normal answer | `answers`: list of `{ drug, type, text, sections[], label_date, link? }`. One item per drug. Two items when both drugs are asked about without a comparison (made at the same time). `type` is `ai` (AI-written, passed every check) or `label_pointer` (FR-052, see below). `link` is only on `label_pointer` items. |
| `refusal` | Dosing, comparison, other drug | `reason` (`personal_dosing`, `comparison`, `other_drug`), `text`, plus for dosing: `sections[]`, `label_date` |
| `not_covered` | Label doesn't answer | `text: "The label doesn't cover this."`, `drug`, `label_date` |
| `ask_which_drug` | No drug named | `text: "Do you mean Emgality or Reyvow?"` |
| `prompt_for_question` | Blank question | `text` |
| `english_only` | Not English | `text: "I can only answer in English right now."` |
| `try_again` | Answer AI down or slow | `text`. Nothing made up. |

**Emergency example (informational, medical)**

```json
{
  "kind": "emergency",
  "case": "informational",
  "messages": ["Call 911 or see a doctor now."],
  "label_excerpts": [
    { "drug": "reyvow", "section": "Adverse Reactions",
      "label_date": "2024-01-01", "sentences": ["<exact label sentence>"] }
  ],
  "not_covered": false,
  "disclaimer": "LabelTrace is an AI, not a doctor."
}
```

(The date above is only an example.)

**Label-pointer item** (FR-052): used when an AI answer fails the checks twice, or once
with no time left to retry.

```json
{
  "drug": "emgality",
  "type": "label_pointer",
  "text": "I couldn't put this into plain language reliably. The answer is in the Adverse Reactions section of the label (dated 2024-01-01).",
  "sections": ["Adverse Reactions"],
  "label_date": "2024-01-01",
  "link": "/label/emgality#adverse_reactions"
}
```

- The section is the first one the AI cited that really exists in the saved label. If none
  does, it's the top section from the section search.
- It never says "The label doesn't cover this."
- The log row's `answer_type` is `label_pointer` if any item is a pointer, else `normal`.

## GET /label/{drug} (page)

**Who**: Anyone. Shows the **saved** label for `emgality` or `reyvow`: label date, then
every section with its display name, and an anchor (`#field_key`) for each section, so
pointer links land on the right part. Has the "AI, not a doctor" banner like every page.

**Guarantees** (each one is checked by fast tests):

- `emergency` replies never call any AI (FR-008).
- `label_excerpts` is empty whenever the self-harm group matched (FR-049, FR-051).
- Every `answer` item has at least 1 section that exists in the saved label, plus a
  `label_date` (FR-017, FR-018).
- Every reply creates exactly one `log_entries` row (FR-023). Blank and non-English
  questions, including non-English emergencies, create a row with only the reply type and
  time (FR-055).
- Every reply is sent within 9 seconds (FR-053).

---

## Reviewer endpoints (sign-in required)

Signed out, or not an active reviewer → HTTP 401 or 403, and nothing is shown (FR-029).

### GET /api/review/entries

Query: `status` (`not_reviewed` | `approved` | `flagged`), `type`, `page`.
Reply: a list of log entries (all fields from [data-model.md](../data-model.md#log_entries)),
newest first.

### POST /api/review/entries/{id}/decision

```json
{ "decision": "flag", "reason": "Cites the wrong section." }
```

- `reason` is required when `decision` is `flag`. Without it → HTTP 400 (FR-032).
- Saves the reviewer's ID and the time (FR-031). Updates `review_status`.

---

## Owner endpoints (role `owner` only)

Any other role → HTTP 403.

### GET /api/owner/flags

Grader results with `needs_owner_decision = yes` and no decision yet. Filter by `source`
(`real` | `test`).

### POST /api/owner/flags/{grader_result_id}/decision

```json
{ "agrees_with_grader": false, "reason": "Answer matches the label; the grader misread it." }
```

`reason` is required (FR-038). Only one decision per flag. A second one → HTTP 409.

### GET /api/owner/grader-summary

```json
{ "total_decisions": 40, "disagreements": 6, "disagreement_rate": 0.15,
  "by_month": [{ "month": "2026-12", "decisions": 40, "disagreements": 6 }] }
```

---

## Scheduled functions (not public)

| Function | Schedule | Contract |
|---|---|---|
| `label-check` | Daily | For each drug, ask openFDA for a **newer** label only ([R6](../research.md#r6-getting-the-label-from-openfda-and-checking-for-updates)). Save one if found. Download nothing if not. |
| `grading-worker` | Every 10 minutes | Grade `waiting` and `not_graded_yet` entries. Send only scrubbed text. Max 5 tries. |

## CI gate (`ai-gate` check)

- **Input**: the PR's changed files, its latest commit ID, and the patterns in
  `.github/ai-related-paths.txt` (read fresh each run).
- **AI-related** means a changed file matches any pattern in that list.
- **Pass when**: (no AI-related files changed **or** a `test_runs` row for this commit has
  `status = passed`) **and** that run's grader flags all have owner decisions.
- **Fail message**: names the missing step, for example "Run the ai-tests workflow on this
  commit" or "3 grader flags need your decision".

## Release check (`release` workflow)

- **Input**: a pushed `v*` tag, who pushed it, and the tagged commit ID.
- **Pass when**: the tag was pushed by `alexcaldwelll` **and** a `test_runs` row for the
  tagged commit has `status = passed` **and** that run's grader flags all have owner
  decisions. Uses the same check code as `ai-gate`.
- **Then**: publishes the tagged commit to Netlify's live site, using the
  `NETLIFY_AUTH_TOKEN` GitHub secret.
- **Fail message**: "Run the ai-tests workflow on this commit before releasing", "N grader
  flags need your decision", or "Only the owner can release".
