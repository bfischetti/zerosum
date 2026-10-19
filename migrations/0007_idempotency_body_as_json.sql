-- Replays must be byte-identical to the first response. jsonb normalises
-- objects (it re-orders keys), so store the body as json, which keeps the
-- text exactly as written.
alter table idempotency_keys
  alter column response_body type json using response_body::json;
