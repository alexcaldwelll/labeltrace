-- 0008_gate_reader_grader: lets the read-only ai-gate login see grader flags and the
-- owner's decisions (T086; research R16), the same way 0005 did for test_runs.
--
-- ai-gate part 2 (T062) checks that every flag from a PR's test run has an owner
-- decision. So ai_gate_reader may READ only the columns it needs (owner-approved
-- 2026-11-27):
--   * grader_results: id, source, test_run_id, needs_owner_decision
--   * owner_flag_decisions: id, grader_result_id
-- It can't see the stored questions, answers, or reasons, and it still can't add,
-- change, or delete any row, or read log_entries.
--
-- Row Level Security is on for both tables (0007), and with no rule it hides every
-- row, so each table also gets a rule that lets this role see all rows.

grant select (id, source, test_run_id, needs_owner_decision)
  on public.grader_results to ai_gate_reader;

grant select (id, grader_result_id)
  on public.owner_flag_decisions to ai_gate_reader;

create policy grader_results_gate_reader_reads_all
  on public.grader_results
  for select
  to ai_gate_reader
  using (true);

create policy owner_flag_decisions_gate_reader_reads_all
  on public.owner_flag_decisions
  for select
  to ai_gate_reader
  using (true);
