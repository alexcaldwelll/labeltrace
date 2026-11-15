# Data Model: LabelTrace Patient Q&A

**Feature**: `001-labeltrace-qa` | **Date**: 2026-11-15 | **Plan**: [plan.md](plan.md)

Most data lives in Supabase (a Postgres database). A **table** is like a spreadsheet tab.
Each **row** is one record. Some data lives in the repo instead, so every change goes
through a PR. Those items are marked **(repo)**.

**Rule for every table**: No field may hold the raw question. Only the scrubbed question
is ever stored (FR-021). A fast test searches every table for raw text (SC-006).

---

## drug_labels

One saved FDA label version for one drug.

| Field | Type | Rules |
|---|---|---|
| id | id | Primary key |
| drug | text | `emgality` or `reyvow` |
| set_id | text | openFDA's permanent label ID. The same for every version of the label. |
| label_date | date | From openFDA `effective_time` |
| downloaded_at | time | When we saved it |
| raw_record | JSON | The full openFDA record |
| is_current | yes/no | Exactly one current label per drug |

- **Changes**: a new row is added only when openFDA has a **newer** `label_date`. Then
  the old row's `is_current` becomes no, and the new row's becomes yes. Old versions are
  kept, so past answers can still be checked.

## label_sections

One named part of a label (FR-018).

| Field | Type | Rules |
|---|---|---|
| id | id | Primary key |
| label_id | → drug_labels | |
| field_key | text | openFDA field, for example `warnings_and_cautions` |
| display_name | text | For example "Warnings and Precautions" (fixed map, [R7](research.md#r7-label-sections)) |
| text | text | Not empty. Empty openFDA fields aren't saved. |

## Emergency phrase list (repo)

`src/lib/emergency/phrases.ts`. Full rules are in
[contracts/emergency-rules.md](contracts/emergency-rules.md).

| Field | Rules |
|---|---|
| id | Short, unique, for example `chest_pain` |
| group | `medical` or `self_harm` |
| phrase | The main wording |
| variants | Other wordings (for example `suicidal`) |
| message | Fixed by group: medical → 911 message, self-harm → 988 message |

- **Rule**: Every `id` must have its own test. A fast test fails if any phrase lacks one
  (FR-010).

## log_entries

One row per answered question (FR-023).

| Field | Type | Rules |
|---|---|---|
| id | id | Primary key |
| created_at | time | |
| scrubbed_question | text | After masking. Never raw. **Empty** for `prompt_for_question` and `english_only` rows (see below). |
| answer_type | text | `normal`, `refusal`, `not_covered`, `emergency`, `ask_which_drug`, `error`, `prompt_for_question`, `english_only` |
| answer | text | Exactly what the patient saw |
| drug | text | `emgality`, `reyvow`, `both`, or empty |
| model_name | text | Empty when the AI was skipped (emergencies, rule-based refusals) |
| prompt_version | text | For example `answer-v3`. Empty when the AI was skipped. |
| sections_used | list of text | Display names |
| label_id | → drug_labels | Gives the label date. Empty when no label was used. |
| label_date | date | Copied in, for easy reading |
| emergency_group | text | `medical`, `self_harm`, `both`, or empty |
| emergency_case | text | `informational`, `happening_now`, `unclear`, or empty (FR-025) |
| label_text_shown | yes/no | Emergencies only |
| ai_skipped | yes/no | Yes for all emergencies |
| source | text | `real` or `test` |
| test_run_id | → test_runs | For test answers only |
| review_status | text | Starts `not_reviewed` |
| grading_status | text | See the state changes below |
| grading_attempts | number | 0 to 5 |

- **Who can read it**: signed-in reviewers and the owner only. Patients and the public
  can't.
- **Blank and non-English questions**: rows with `answer_type` of `prompt_for_question`
  or `english_only` hold **only** `id`, `created_at`, `answer_type`, `answer`, `source`,
  and `review_status`. No question text is stored, not even scrubbed text, because the
  scrubber only works on English. `grading_status` is `not_applicable`. (The emergency
  check still runs first on every question. If it finds a phrase, the row is an
  `emergency` row instead.)
- **review_status changes**: `not_reviewed` → `approved` or `flagged` (by a reviewer). A
  later review can change it again. Every decision is kept in `review_decisions`.
- **grading_status changes**:
  - `not_sampled`: a real answer that wasn't picked for the 10% sample.
  - `waiting` → `passed` or `failed`.
  - `waiting` → `not_graded_yet` (the grader is down) → back to `waiting` on the next
    try. After 5 tries it becomes `grading_gave_up`, which shows up on the owner's page.
  - Emergencies and rule-based refusals: `not_applicable`. There's no AI answer to grade.

## reviewers

People who can sign in (FR-029). Linked one-to-one to a Supabase Auth user.

| Field | Type | Rules |
|---|---|---|
| user_id | → auth user | Primary key |
| display_name | text | |
| role | text | `reviewer` or `owner`. The owner can do everything a reviewer can (FR-033). |
| active | yes/no | Inactive people are blocked |

## review_decisions

| Field | Type | Rules |
|---|---|---|
| id | id | |
| log_entry_id | → log_entries | |
| reviewer_id | → reviewers | Required (FR-031) |
| decision | text | `approve` or `flag` |
| reason | text | **Required when `flag`** (FR-032) |
| decided_at | time | Required |

## grader_results

| Field | Type | Rules |
|---|---|---|
| id | id | |
| log_entry_id | → log_entries | |
| grader_model | text | Must be from a different company than `log_entries.model_name` (FR-034) |
| grade | text | `pass` or `fail` |
| grader_reason | text | |
| source | text | `real` or `test` |
| graded_at | time | |
| needs_owner_decision | yes/no | Yes when `grade = fail` (FR-037) |

## owner_flag_decisions

| Field | Type | Rules |
|---|---|---|
| id | id | |
| grader_result_id | → grader_results | One decision per flag |
| owner_id | → reviewers | Must have role `owner` |
| agrees_with_grader | yes/no | |
| reason | text | Required (FR-038) |
| decided_at | time | |

- **Disagreement rate** (FR-039, SC-011) = decisions where `agrees_with_grader = no` ÷ all
  decisions. Shown on the owner's page, with counts by month.

## test_runs

One run of the AI test tier.

| Field | Type | Rules |
|---|---|---|
| id | id | |
| commit_sha | text | The commit ID tested |
| branch | text | |
| answer_model | text | For example `claude-haiku-5-5` |
| started_at / finished_at | time | |
| passed / failed / total | numbers | |
| status | text | `running`, `passed`, `failed` |

- The `ai-gate` check looks up the PR's latest commit here. It passes only if a run has
  `status = passed` **and** every `grader_results` row with `needs_owner_decision = yes`
  from that run has an `owner_flag_decisions` row.

## Test questions and answer key (repo)

`tests/ai/questions/*.json`

| Field | Rules |
|---|---|
| id | Unique |
| category | `normal`, `refusal_dosing`, `refusal_compare`, `refusal_other_drug`, `not_covered`, `three_ways`, `privacy` |
| drug | `emgality`, `reyvow`, `both`, or none |
| question | Only made-up personal details (FR-022) |
| expected_behavior | For example "refuse with doctor or pharmacist wording" |
| expected_facts | Facts the answer must contain, taken from the label |
| expected_sections | |
| checked_by / checked_on | **Required.** The loader refuses any entry without them (FR-044, constitution VIII). |
| three_ways_group | Links the medical, everyday, and typo versions of one question |

- **Rule**: at least 20 questions in total (FR-040). Emergency tests live in the fast tier
  and are counted separately.

## Relationships

```text
drug_labels 1──* label_sections
drug_labels 1──* log_entries
log_entries 1──* review_decisions *──1 reviewers
log_entries 1──* grader_results 1──0..1 owner_flag_decisions *──1 reviewers(owner)
test_runs   1──* log_entries (source = test)
```
