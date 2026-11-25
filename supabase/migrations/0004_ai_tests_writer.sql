-- 0004_ai_tests_writer: a limited database login for the ai-tests workflow (T073,
-- research R16, data-model.md "test_runs").
--
-- The ai-tests workflow records each AI test run in test_runs. It uses this role
-- instead of the database's admin key, so a leaked key can do very little:
--   * It may ADD a test_runs row, but only with status 'running' and only the
--     starting fields (id, commit, branch, models, start time). The recorder makes
--     up the row's id itself, so the role never needs to read rows back.
--   * It may FINISH a row that is still 'running', only through
--     public.finish_test_run() below.
--   * It can't read, change, or delete any row directly, and it can't touch any
--     other table (including log_entries, the question log).
-- So a leaked key can't flip an old, finished run to 'passed'.
--
-- The role is created with NO login and NO password. The owner turns on its login
-- and sets a password by hand in the online database (T071), so no password is
-- ever written in a file.

create role ai_tests_writer nologin noinherit;

grant usage on schema public to ai_tests_writer;

-- Adding rows: only the starting fields. The counts, finished_at, and pointer_rate
-- can't be set when a row is added.
grant insert (id, commit_sha, branch, answer_model, grader_model, started_at, status)
  on public.test_runs to ai_tests_writer;

-- Row Level Security is on for test_runs (0002). This rule lets the writer add a
-- row only when its status is 'running'.
create policy test_runs_writer_adds_running_rows
  on public.test_runs
  for insert
  to ai_tests_writer
  with check (status = 'running');

-- Finishing a run.
--
-- Security:
--   * SECURITY DEFINER: it runs with the rights of its owner (the role that applies
--     migrations), because the writer has no right to change test_runs rows itself.
--     That's why it does only one narrow thing: finish one row that is still
--     'running'.
--   * search_path is fixed to "public, pg_temp" (temporary objects last), and every
--     name below is also written in full (public.x), so a caller can't swap in a
--     look-alike table or function.
--   * Only ai_tests_writer may run it. Postgres lets everyone (PUBLIC) run new
--     functions by default, so that is taken away first, then the browser roles
--     (anon, authenticated) are blocked by name too.
--
-- Checks (beyond "the row must still be running"):
--   * The final status is 'passed', 'failed', or 'incomplete' (never 'running').
--   * The counts are whole numbers, 0 or more, and passed + failed = total.
--   * 'passed' needs at least 1 test and 0 failures. This only catches mistakes:
--     the pass rule itself lives in src/lib/ci/run-status.ts.
create function public.finish_test_run(
  p_run_id uuid,
  p_passed integer,
  p_failed integer,
  p_total  integer,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('passed', 'failed', 'incomplete') then
    raise exception 'finish_test_run: status must be passed, failed, or incomplete (got %)',
      coalesce(p_status, 'nothing')
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  if p_passed is null or p_failed is null or p_total is null
     or p_passed < 0 or p_failed < 0 or p_total < 0 then
    raise exception 'finish_test_run: counts must be whole numbers, 0 or more'
      using errcode = '22023';
  end if;

  if p_passed + p_failed <> p_total then
    raise exception 'finish_test_run: passed (%) + failed (%) must equal total (%)',
      p_passed, p_failed, p_total
      using errcode = '22023';
  end if;

  if p_status = 'passed' and (p_total < 1 or p_failed <> 0) then
    raise exception 'finish_test_run: a passed run needs at least 1 test and 0 failures'
      using errcode = '22023';
  end if;

  update public.test_runs
     set passed      = p_passed,
         failed      = p_failed,
         total       = p_total,
         status      = p_status,
         finished_at = now()
   where id = p_run_id
     and status = 'running';

  if not found then
    raise exception 'finish_test_run: no running test run with id %', p_run_id
      using errcode = 'P0002';  -- no_data_found
  end if;
end;
$$;

revoke execute on function public.finish_test_run(uuid, integer, integer, integer, text)
  from public;
revoke execute on function public.finish_test_run(uuid, integer, integer, integer, text)
  from anon, authenticated;
grant  execute on function public.finish_test_run(uuid, integer, integer, integer, text)
  to ai_tests_writer;
