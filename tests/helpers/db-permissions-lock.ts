// One shared database lock for test transactions that change permissions (granting a
// role, dropping a row rule). Each such transaction runs this right after `begin`, so
// those transactions run one at a time; every other test stays parallel.
//
// Why (owner-approved fix, 2026-11-27): ai-gate-reader.test.ts grants ai_gate_reader
// and then inserts into test_runs, while gate-login-check.test.ts drops a rule on
// test_runs and then grants ai_gate_reader. Run at the same moment, each held the lock
// the other needed next, and Postgres stopped one with "deadlock detected".
//
// The lock is released by itself when the transaction ends (commit or rollback).
export const DB_PERMISSIONS_LOCK = "select pg_advisory_xact_lock(727001)";
