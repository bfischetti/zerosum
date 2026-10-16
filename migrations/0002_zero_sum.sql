-- The rule the project is named after: at commit, every transaction has at
-- least two entries and they sum to zero. Deferred, so a transaction and its
-- entries can be inserted in any order within one DB transaction.

create function check_transaction_balanced() returns trigger
language plpgsql as $$
declare
  tx_id uuid;
  entry_count bigint;
  total numeric;
begin
  -- IF rather than CASE: plpgsql resolves every field reference in a CASE,
  -- and transactions rows have no transaction_id.
  if tg_table_name = 'entries' then
    tx_id := new.transaction_id;
  else
    tx_id := new.id;
  end if;

  select count(*), coalesce(sum(amount), 0)
    into entry_count, total
    from entries
   where transaction_id = tx_id;

  if entry_count < 2 then
    raise exception 'transaction % has % entries; at least 2 are required', tx_id, entry_count
      using errcode = 'check_violation';
  end if;
  if total <> 0 then
    raise exception 'transaction % entries sum to %, not 0', tx_id, total
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger entries_balanced
  after insert on entries
  deferrable initially deferred
  for each row execute function check_transaction_balanced();

-- Also fire per transaction: a transaction with no entries never fires the
-- trigger on entries.
create constraint trigger transactions_balanced
  after insert on transactions
  deferrable initially deferred
  for each row execute function check_transaction_balanced();
