-- Batch upload (story 1) and approve-all-clean plus export (story 5).

create table batches (
  id         text primary key,
  created_at timestamptz not null default now(),
  -- Set once, when the batch's documents are grouped into sets. A batch is matched once.
  matched_at timestamptz,
  -- Documents that couldn't be placed in a set, with the reason.
  set_aside  jsonb not null default '[]'::jsonb
);

-- What Claude read from each uploaded file. The file itself is not stored.
create table documents (
  id            text primary key,
  batch_id      text not null references batches (id),
  created_at    timestamptz not null default now(),
  file_name     text not null,
  document_type text not null,
  extraction    jsonb not null
);

create index documents_batch on documents (batch_id, created_at);

-- Which documents each set was built from. A PO can serve more than one invoice.
create table set_documents (
  set_id      text not null references invoice_sets (id),
  document_id text not null references documents (id),
  primary key (set_id, document_id)
);

alter table invoice_sets
  add column batch_id     text references batches (id),
  add column invoice_date text,
  add column po_number    text,
  add column exported_at  timestamptz;

alter table invoice_sets
  add constraint exported_only_if_approved check (exported_at is null or status = 'approved');

alter table batches enable row level security;
alter table documents enable row level security;
alter table set_documents enable row level security;
