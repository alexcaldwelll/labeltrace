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

**Reply**: always HTTP 200 with one of the shapes below. Every reply has
`"disclaimer": "LabelTrace is an AI, not a doctor."`

| `kind` | When | Extra fields |
|---|---|---|
| `emergency` | Emergency phrase found | `messages` (in order: 911 first, then 988), `case`, `label_excerpts` (informational medical only, else empty), `not_covered` (yes/no) |
| `answer` | Normal answer | `answers`: list of `{ drug, text, sections[], label_date }`. One item per drug. Two items when both drugs are asked about without a comparison. |
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

**Guarantees** (each one is checked by fast tests):

- `emergency` replies never call any AI (FR-008).
- `label_excerpts` is empty whenever the self-harm group matched (FR-049, FR-051).
- Every `answer` item has at least 1 section that exists in the saved label, plus a
  `label_date` (FR-017, FR-018).
- Every reply creates exactly one `log_entries` row (FR-023).

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

- **Input**: the PR's changed files and its latest commit ID.
- **Pass when**: (no AI-related files changed **or** a `test_runs` row for this commit has
  `status = passed`) **and** that run's grader flags all have owner decisions.
- **Fail message**: names the missing step, for example "Run the ai-tests workflow on this
  commit" or "3 grader flags need your decision".
