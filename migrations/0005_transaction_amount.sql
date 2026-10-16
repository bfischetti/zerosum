-- With netted entries (ADR 0001) an expense's total can't be recovered from
-- its entries: the payer's own share is folded into their credit. So every
-- transaction records its headline amount: the expense total, the settlement
-- amount, or for a reversal the amount of the transaction it reverses.
-- Descriptive only: balances are still derived from entries.
--
-- Pre-release migration: assumes the ledger is empty (no backfill).

alter table transactions
  add column amount bigint not null check (amount > 0);

-- Tie the amount to the entries as far as they allow. The positive entries are
-- what flowed to debtors: for a settlement that is the whole amount; for an
-- expense it is the total minus the payer's own share, so at most the total.
create or replace function check_transaction_balanced() returns trigger
language plpgsql as $$
declare
  tx_id uuid;
  tx transactions%rowtype;
  entry_count bigint;
  total numeric;
  debits numeric;
  original_type text;
begin
  -- IF rather than CASE: plpgsql resolves every field reference in a CASE,
  -- and transactions rows have no transaction_id.
  if tg_table_name = 'entries' then
    tx_id := new.transaction_id;
  else
    tx_id := new.id;
  end if;

  select count(*), coalesce(sum(amount), 0), coalesce(sum(amount) filter (where amount > 0), 0)
    into entry_count, total, debits
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

  select * into tx from transactions where id = tx_id;
  if tx.type = 'reversal' then
    select type into original_type from transactions where id = tx.reverses_id;
  end if;

  if coalesce(original_type, tx.type) = 'settlement' and debits <> tx.amount then
    raise exception 'settlement % moves % but its amount is %', tx_id, debits, tx.amount
      using errcode = 'check_violation';
  end if;
  if coalesce(original_type, tx.type) = 'expense' and debits > tx.amount then
    raise exception 'expense % debits % but its amount is only %', tx_id, debits, tx.amount
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- A reversal carries the same amount as the transaction it reverses.
create or replace function reject_reversal_of_reversal() returns trigger
language plpgsql as $$
declare
  original transactions%rowtype;
begin
  select * into original from transactions where id = new.reverses_id;
  if original.type = 'reversal' then
    raise exception 'transaction % is a reversal and cannot be voided', new.reverses_id
      using errcode = 'check_violation';
  end if;
  if found and new.amount <> original.amount then
    raise exception 'reversal amount % does not match the original amount %', new.amount, original.amount
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
