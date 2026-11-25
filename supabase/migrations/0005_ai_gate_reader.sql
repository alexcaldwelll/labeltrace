-- 0005_ai_gate_reader: a read-only database login for the ai-gate check (T071 step 2,
-- research R16).
--
-- ai-gate (T015) looks up the AI test run for a PR's latest commit. It uses this role,
-- through the repo-wide GitHub secret AI_GATE_DATABASE_URL. A repo-wide secret can be
-- used by any branch's workflow, so the role must stay read-only:
--   * It may READ test_runs. Nothing else.
--   * It can't add, change, or delete any row, read any other table (including
--     log_entries, the question log), or run any function.
--
-- Row Level Security is on for test_runs (0002), and with no rule it hides every row.
-- So besides the read permission, a rule lets this role see all test_runs rows.
-- Without that rule ai-gate would see zero runs, with no error.
--
-- The role is created with NO login and NO password. The owner turns on its login
-- with a password set only through a scrambled version (SCRAM verifier,
-- scripts/scram-verifier.mjs), never typed into SQL, because the database logs these
-- commands word for word (T071 step 2).
--
-- T086 adds read access to grader_results and owner_flag_decisions, the same way,
-- after T055 creates them.

create role ai_gate_reader nologin noinherit;

grant usage on schema public to ai_gate_reader;

grant select on public.test_runs to ai_gate_reader;

create policy test_runs_gate_reader_reads_all
  on public.test_runs
  for select
  to ai_gate_reader
  using (true);
