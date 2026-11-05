-- Step 5: a plain-English explanation of each set's decision, generated once on request.
-- It describes the decision; it never changes recommendation or status.
alter table invoice_sets add column explanation jsonb;
