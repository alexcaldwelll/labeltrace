-- 0002_log_and_runs: the audit log and the AI test runs (T008, data-model.md).
--
-- test_runs: one run of the AI test tier (FR-045).
-- log_entries: one row per answered question (FR-023).
--
-- Privacy (constitution V, FR-055):
--   * No column holds the raw question. Only the scrubbed question is stored.
--   * A row with no question (blank or non-English) holds only id, created_at, and
--     answer_type. Every other field must be empty.
--   * No column defaults on log_entries except id and created_at. Those two are filled
--     in by the database, so audit times come from the database, not app code. The log
--     writer (T046) fills in every other field, so a database default can never put a
--     value into a row that must stay empty.
--
-- Access: server only for now (T051 adds reviewer read access). Row Level Security
-- is on with no rules, and the browser roles (anon, authenticated) have no table
-- rights at all. Only the service role (server code) can read or change these tables.

create table public.test_runs (
  id           uuid        primary key default gen_random_uuid(),
  commit_sha   text,
  branch       text,
  answer_model text        not null,  -- FR-045
  grader_model text        not null,  -- FR-045
  started_at   timestamptz,
  finished_at  timestamptz,
  passed       integer     check (passed >= 0),
  failed       integer     check (failed >= 0),
  total        integer     check (total >= 0),
  -- incomplete: the grader was down for at least one answer (T059). Never passing.
  status       text        not null
               check (status in ('running', 'passed', 'failed', 'incomplete')),
  -- Share of label answers that came back as label_pointer (T042, SC-004).
  pointer_rate numeric     check (pointer_rate >= 0 and pointer_rate <= 1)
);

create table public.log_entries (
  id                   uuid        primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  -- After masking. Never raw. Empty (null) for blank and non-English rows.
  scrubbed_question    text        check (btrim(scrubbed_question) <> ''),
  answer_type          text        not null check (answer_type in (
                         'normal', 'label_pointer', 'refusal', 'not_covered',
                         'emergency', 'ask_which_drug', 'error',
                         'prompt_for_question', 'english_only')),
  answer               text,
  drug                 text        check (drug in ('emgality', 'reyvow', 'both')),
  model_name           text,
  prompt_version       text,
  sections_used        text[],
  label_id             uuid        references public.drug_labels (id),
  label_date           date,
  emergency_group      text        check (emergency_group in ('medical', 'self_harm', 'both')),
  emergency_phrase_ids text[],     -- phrase ids only, never the words typed (FR-054)
  emergency_case       text        check (emergency_case in (
                         'informational', 'happening_now', 'unclear')),
  label_text_shown     boolean,
  ai_skipped           boolean,
  source               text        check (source in ('real', 'test')),
  test_run_id          uuid        references public.test_runs (id),
  review_status        text        check (review_status in (
                         'not_reviewed', 'approved', 'flagged')),
  grading_status       text        check (grading_status in (
                         'not_sampled', 'waiting', 'passed', 'failed',
                         'not_graded_yet', 'grading_gave_up', 'not_applicable')),
  grading_attempts     integer     check (grading_attempts between 0 and 5),

  -- FR-055: a row with no question holds only id, created_at, and answer_type.
  -- Every row with a question must have a review_status (there is no default).
  constraint log_entries_question_rule check (
    (
      scrubbed_question    is null
      and answer               is null
      and drug                 is null
      and model_name           is null
      and prompt_version       is null
      and sections_used        is null
      and label_id             is null
      and label_date           is null
      and emergency_group      is null
      and emergency_phrase_ids is null
      and emergency_case       is null
      and label_text_shown     is null
      and ai_skipped           is null
      and source               is null
      and test_run_id          is null
      and review_status        is null
      and grading_status       is null
      and grading_attempts     is null
    )
    or (
      scrubbed_question is not null
      and review_status is not null
    )
  )
);

create index log_entries_created_at  on public.log_entries (created_at);
create index log_entries_test_run_id on public.log_entries (test_run_id);
create index test_runs_commit_sha    on public.test_runs (commit_sha);

-- Lock both tables to the server (service role) only.
alter table public.test_runs   enable row level security;
alter table public.log_entries enable row level security;

revoke all on table public.test_runs   from anon, authenticated;
revoke all on table public.log_entries from anon, authenticated;
