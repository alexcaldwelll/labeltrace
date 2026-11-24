-- 0003_get_current_label: one database function that returns a drug's current saved
-- FDA label and its sections (T011, used by src/lib/labels/store.ts).
--
-- Returns one JSON value:
--   { "drug", "label_id", "set_id", "label_date", "sections": [ { "field_key",
--     "display_name", "text" }, ... ] }
-- or NULL when the drug has no current label. It only ever reads the asked-for
-- drug's row, so it can't return a different drug's label.
--
-- Why a database function: the lookup runs inside the database, so tests can call it
-- directly inside a transaction that is rolled back (undone) afterward.
--
-- Security:
--   * SECURITY INVOKER: it runs with the caller's own rights, never with extra
--     rights. The label tables stay locked to the server, as set up in 0001.
--   * Only the service role (server code) may run it. Postgres lets everyone
--     (PUBLIC) run new functions by default, so that is taken away first, then the
--     browser roles (anon, authenticated) are blocked by name too.
--   * search_path is empty, so every name below is written in full (public.x) and
--     can't be swapped for a look-alike in another schema.

create function public.get_current_label(p_drug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'drug',       l.drug,
    'label_id',   l.id,
    'set_id',     l.set_id,
    'label_date', l.label_date,
    'sections',   coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'field_key',    s.field_key,
                   'display_name', s.display_name,
                   'text',         s.text
                 )
                 order by s.field_key
               )
        from public.label_sections s
        where s.label_id = l.id
      ),
      '[]'::jsonb
    )
  )
  from public.drug_labels l
  where l.drug = p_drug
    and l.is_current
$$;

revoke execute on function public.get_current_label(text) from public;
revoke execute on function public.get_current_label(text) from anon, authenticated;
grant  execute on function public.get_current_label(text) to service_role;
