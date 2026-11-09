-- Keep each uploaded file next to what Claude read from it, so a reviewer can open the
-- invoice, PO or receiving report behind a set. Additive only: two nullable columns,
-- no table rewrite. Documents uploaded before this have no file (both columns null).
-- Fail fast rather than queue behind an upload in progress.
set local lock_timeout = '5s';

alter table documents
  add column content    bytea,
  add column media_type text;

-- Only the four types an upload can be, and a file always has its type (and vice versa).
alter table documents
  add constraint documents_media_type_allowed
    check (media_type is null or media_type in ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')),
  add constraint documents_file_complete
    check ((content is null) = (media_type is null));

-- Row-level security on documents is already on (002) and covers the new columns.
