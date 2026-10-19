-- Idempotency-Key records for write endpoints. The row is inserted first,
-- inside the same DB transaction as the write, so a concurrent request with the
-- same key blocks on the primary key until the first commits (then replays its
-- response) or rolls back (then proceeds). Only successful responses are ever
-- committed; the response columns are filled just before commit.
create table idempotency_keys (
  key text primary key check (length(key) between 1 and 255),
  request_hash text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now()
);
