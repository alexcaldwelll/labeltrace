-- 0006_reviewers: the people who can sign in, and their review decisions (T051;
-- data-model.md "reviewers", "review_decisions"; FR-029, FR-031, FR-032, FR-033).
--
-- Who can do what (owner-approved 2026-11-27):
--   * log_entries: a signed-in user can read it only while their own reviewers row is
--     active (reviewer or owner). The public (anon) can't. Nobody gets any other
--     access here.
--   * reviewers: a signed-in user can read only their own row (the login check in T052
--     needs it). Nobody can add or change rows through the app or the API; the owner
--     adds them in the Supabase SQL editor (T079). So no one can promote themselves.
--   * review_decisions: Row Level Security is on with no rule yet, so nobody can use it
--     through the API. Saving decisions is T053.
--   * At most one owner (owner's decision, 2026-11-27): the owner decides grader flags.
--
-- A login with decisions can't be deleted while its decisions point to it: set
-- active = false instead, so the decision history stays complete (FR-031).

create table public.reviewers (
  user_id      uuid    primary key references auth.users (id),
  display_name text,
  role         text    not null check (role in ('reviewer', 'owner')),
  active       boolean not null
);

-- At most one owner row.
create unique index reviewers_one_owner on public.reviewers (role) where role = 'owner';

create table public.review_decisions (
  id           uuid        primary key default gen_random_uuid(),
  log_entry_id uuid        not null references public.log_entries (id),
  reviewer_id  uuid        not null references public.reviewers (user_id),   -- FR-031
  decision     text        not null check (decision in ('approve', 'flag')),
  reason       text,
  -- Set by the database, so decision times don't come from app code.
  decided_at   timestamptz not null default now(),
  -- FR-032: flagging needs a reason that isn't blank.
  constraint review_decisions_flag_needs_reason check (
    decision <> 'flag' or (reason is not null and btrim(reason) <> '')
  )
);

create index review_decisions_log_entry_id on public.review_decisions (log_entry_id);

alter table public.reviewers        enable row level security;
alter table public.review_decisions enable row level security;

revoke all on table public.reviewers        from anon, authenticated;
revoke all on table public.review_decisions from anon, authenticated;

-- reviewers: a signed-in user reads only their own row.
grant select on public.reviewers to authenticated;

create policy reviewers_read_own_row
  on public.reviewers
  for select
  to authenticated
  using (user_id = auth.uid());

-- log_entries: only active reviewers and the owner can read it (FR-029). 0002 turned
-- on Row Level Security and took every permission away from anon and authenticated.
grant select on public.log_entries to authenticated;

create policy log_entries_active_reviewers_read
  on public.log_entries
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.reviewers r
       where r.user_id = auth.uid()
         and r.active
    )
  );
