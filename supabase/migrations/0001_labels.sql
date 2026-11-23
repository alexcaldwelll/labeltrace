-- 0001_labels: the saved FDA labels and their named sections (T007, data-model.md).
--
-- drug_labels: one saved FDA label version for one drug. Old versions are kept,
--   so past answers can still be checked. Exactly one version per drug is current.
-- label_sections: one named part of a label (FR-018). Empty openFDA fields are
--   never saved.
--
-- Access: server only. Row Level Security is on with no rules, and the browser
-- roles (anon, authenticated) have no table rights at all. Only the service role
-- (server code) can read or change these tables.

create table public.drug_labels (
  id            uuid        primary key default gen_random_uuid(),
  drug          text        not null check (drug in ('emgality', 'reyvow')),
  set_id        text        not null,  -- openFDA's permanent label ID
  label_date    date        not null,  -- from openFDA effective_time
  downloaded_at timestamptz not null default now(),
  raw_record    jsonb       not null,  -- the full openFDA record
  is_current    boolean     not null default false
);

-- Exactly one current label per drug.
create unique index drug_labels_one_current_per_drug
  on public.drug_labels (drug)
  where is_current;

create table public.label_sections (
  id           uuid primary key default gen_random_uuid(),
  label_id     uuid not null references public.drug_labels (id),
  field_key    text not null,  -- openFDA field, e.g. warnings_and_cautions
  display_name text not null,  -- e.g. "Warnings and Precautions" (research R7)
  text         text not null check (btrim(text) <> '')  -- not empty
);

create index label_sections_label_id on public.label_sections (label_id);

-- Lock both tables to the server (service role) only.
alter table public.drug_labels    enable row level security;
alter table public.label_sections enable row level security;

revoke all on table public.drug_labels    from anon, authenticated;
revoke all on table public.label_sections from anon, authenticated;
