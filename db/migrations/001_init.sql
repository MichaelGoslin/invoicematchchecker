-- Invoice sets, their recommendation, every human action, and the history the
-- duplicate check reads. The tool recommends; the audit log records who decided.

create table invoice_sets (
  id               text primary key,
  created_at       timestamptz not null default now(),
  match_type       text not null check (match_type in ('3-way', '2-way')),
  invoice_vendor   text,
  invoice_number   text,
  invoice_total    numeric(14, 2),
  recommendation   text not null check (recommendation in ('approve', 'review', 'reject')),
  decision_reason  text not null check (decision_reason in ('reject', 'gated', 'exception', 'incomplete', 'clean')),
  decision_version text not null,
  -- Snapshot of what the engine saw and concluded, so a decision can be defended later.
  decision         jsonb not null,
  traces           jsonb not null,
  documents        jsonb not null,
  -- What a person did. Null until someone acts.
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at       timestamptz,
  decided_by       text,
  overridden       boolean not null default false,
  override_reason  text,
  check ((status = 'pending') = (decided_at is null)),
  check (not overridden or (override_reason is not null and length(trim(override_reason)) > 0))
);

create index invoice_sets_queue on invoice_sets (status, created_at desc);

-- Invoices already seen, for the duplicate check. Normalized the same way as
-- lib/match/shared.ts so "INV 0870" and "inv-0870" collide.
create table processed_invoices (
  id                 bigserial primary key,
  set_id             text not null references invoice_sets (id),
  vendor             text not null,
  invoice_number     text not null,
  vendor_key         text not null,
  invoice_number_key text not null,
  status             text not null check (status in ('pending', 'approved', 'rejected')),
  recorded_at        timestamptz not null default now(),
  unique (set_id)
);

create index processed_invoices_key on processed_invoices (vendor_key, invoice_number_key);

-- Append-only record of every recommendation and human action.
create table audit_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  set_id  text not null references invoice_sets (id),
  actor   text not null,
  action  text not null check (action in ('recommended', 'approved', 'rejected', 'exported')),
  detail  jsonb not null default '{}'::jsonb
);

create index audit_log_set on audit_log (set_id, at);

create function audit_log_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_is_append_only();

-- Supabase exposes the public schema through its REST API to anyone holding the
-- anon key. Row-level security with no policies blocks that; the app connects
-- as the database owner, which bypasses RLS.
alter table invoice_sets enable row level security;
alter table processed_invoices enable row level security;
alter table audit_log enable row level security;
