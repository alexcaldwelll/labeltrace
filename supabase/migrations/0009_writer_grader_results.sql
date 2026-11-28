-- 0009_writer_grader_results: lets the ai-tests writer login save the grader's grade
-- for each test answer (T059; research R16; owner's decision 2A, 2026-11-27).
--
-- The writer gets ONE narrow function, in the same style as finish_test_run (0004):
--   * record_test_grade() adds a source = 'test' grade, and only for a test run that
--     is still 'running'. So a leaked writer password can't add grades to an old,
--     finished run.
--   * The writer still can't add grader_results rows directly, or read, change, or
--     delete any grader_results row.
--
-- Security (as in 0004):
--   * SECURITY DEFINER: it runs with the rights of its owner (the role that applies
--     migrations), because the writer has no right to add grader_results rows itself.
--   * search_path is fixed to "public, pg_temp" (temporary objects last), and every
--     name below is written in full (public.x), so a caller can't swap in a
--     look-alike table or function.
--   * Only ai_tests_writer may run it: PUBLIC loses the right first, then the browser
--     roles (anon, authenticated) are blocked by name too.
--
-- The grade, the reason, and needs_owner_decision follow 0007's rules (a failed grade
-- flags the answer for the owner; it doesn't fail the run, FR-037).

create function public.record_test_grade(
  p_run_id       uuid,
  p_entry_id     text,
  p_question     text,
  p_answer       text,
  p_grader_model text,
  p_grade        text,
  p_reason       text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.test_runs where id = p_run_id and status = 'running'
  ) then
    raise exception 'record_test_grade: the test run must exist and still be running'
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  insert into public.grader_results
    (source, test_run_id, test_entry_id, scrubbed_question, answer, grader_model, grade, grader_reason)
  values
    ('test', p_run_id, p_entry_id, p_question, p_answer, p_grader_model, p_grade, p_reason);
end;
$$;

revoke all on function public.record_test_grade(uuid, text, text, text, text, text, text)
  from public;
revoke all on function public.record_test_grade(uuid, text, text, text, text, text, text)
  from anon, authenticated;
grant execute on function public.record_test_grade(uuid, text, text, text, text, text, text)
  to ai_tests_writer;
