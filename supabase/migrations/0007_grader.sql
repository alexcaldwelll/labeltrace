-- 0007_grader: the second-AI grader's results and the owner's decisions on its flags
-- (T055; data-model.md "grader_results", "owner_flag_decisions"; FR-034 to FR-039).
--
-- A grade belongs to a real answer or a test answer (owner's decision 1A, 2026-11-27):
--   * source = 'real': points to the log row (log_entry_id). The question and answer
--     are read from the log, so the test-only fields stay empty.
--   * source = 'test': stands on its own, because test answers have no log rows (the
--     log writer is T047, and the CI writer login never touches log_entries). It holds
--     test_run_id (so ai-gate part 2, T062, can find this run's flags), test_entry_id
--     (the answer-key entry), and the scrubbed question and answer the owner reviews.
--
-- needs_owner_decision is worked out by the database from the grade (FR-037), and
-- graded_at / decided_at are set by the database, never by app code.
--
-- Who can do what (owner-approved 2026-11-27):
--   * Only the active owner can read either table, and only the active owner can add a
--     decision, under their own ID. Nobody can change or delete a decision.
--   * Nobody can add grades through the API: the CI writer gets that in T059's
--     migration, and real grading (T057) runs on the server.
--   * A trigger also checks, for every new decision, that owner_id is the owner and the
--     grade is a fail, so even an admin script can't break those rules.
--   * FR-034 (the grader is from a different company than the answer AI) is checked in
--     code (src/config/models.ts, T056): the database doesn't know which company makes
--     which model.

create table public.grader_results (
  id                   uuid        primary key default gen_random_uuid(),
  source               text        not null check (source in ('real', 'test')),
  log_entry_id         uuid        references public.log_entries (id),
  test_run_id          uuid        references public.test_runs (id),
  test_entry_id        text,
  scrubbed_question    text,
  answer               text,
  grader_model         text        not null,
  grade                text        not null check (grade in ('pass', 'fail')),
  grader_reason        text,
  graded_at            timestamptz not null default now(),
  -- FR-037: a failed grade flags the answer for the owner.
  needs_owner_decision boolean     generated always as (grade = 'fail') stored,
  constraint grader_results_source_fields check (
    (
      source = 'real'
      and log_entry_id      is not null
      and test_run_id       is null
      and test_entry_id     is null
      and scrubbed_question is null
      and answer            is null
    )
    or (
      source = 'test'
      and log_entry_id      is null
      and test_run_id       is not null
      and test_entry_id     is not null
      and scrubbed_question is not null
      and answer            is not null
    )
  )
);

create index grader_results_test_run_id  on public.grader_results (test_run_id);
create index grader_results_log_entry_id on public.grader_results (log_entry_id);

create table public.owner_flag_decisions (
  id                 uuid        primary key default gen_random_uuid(),
  -- One decision per flag.
  grader_result_id   uuid        not null unique references public.grader_results (id),
  owner_id           uuid        not null references public.reviewers (user_id),
  agrees_with_grader boolean     not null,
  -- FR-038: a reason that isn't blank.
  reason             text        not null check (btrim(reason) <> ''),
  decided_at         timestamptz not null default now()
);

-- Every new decision: owner_id must be the owner, and the grade must be a fail.
create function public.check_owner_flag_decision() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.reviewers r where r.user_id = new.owner_id and r.role = 'owner'
  ) then
    raise exception 'owner_flag_decisions.owner_id must be the owner'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.grader_results g where g.id = new.grader_result_id and g.grade = 'fail'
  ) then
    raise exception 'a decision is only allowed on a failed grade'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_owner_flag_decision() from public, anon, authenticated;

create trigger owner_flag_decisions_check
  before insert on public.owner_flag_decisions
  for each row execute function public.check_owner_flag_decision();

alter table public.grader_results       enable row level security;
alter table public.owner_flag_decisions enable row level security;

revoke all on table public.grader_results       from anon, authenticated;
revoke all on table public.owner_flag_decisions from anon, authenticated;

grant select         on public.grader_results       to authenticated;
grant select, insert on public.owner_flag_decisions to authenticated;

create policy grader_results_owner_reads
  on public.grader_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.reviewers r
       where r.user_id = auth.uid() and r.role = 'owner' and r.active
    )
  );

create policy owner_flag_decisions_owner_reads
  on public.owner_flag_decisions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.reviewers r
       where r.user_id = auth.uid() and r.role = 'owner' and r.active
    )
  );

create policy owner_flag_decisions_owner_adds
  on public.owner_flag_decisions
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.reviewers r
       where r.user_id = auth.uid() and r.role = 'owner' and r.active
    )
  );
