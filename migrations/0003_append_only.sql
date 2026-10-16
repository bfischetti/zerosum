-- The ledger is append-only: history is corrected with reversals, never by
-- rewriting rows. Accounts and memberships are covered too, since moving an
-- account to another member would rewrite history just the same.
--
-- Row-level triggers do not fire on TRUNCATE; tests rely on that (ADR 0002).

create function reject_ledger_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger transactions_append_only
  before update or delete on transactions
  for each row execute function reject_ledger_mutation();

create trigger entries_append_only
  before update or delete on entries
  for each row execute function reject_ledger_mutation();

create trigger accounts_append_only
  before update or delete on accounts
  for each row execute function reject_ledger_mutation();

create trigger group_members_append_only
  before update or delete on group_members
  for each row execute function reject_ledger_mutation();

-- Without this, a committed transaction could later gain a balanced pair of
-- new entries, which the zero-sum check alone would accept.
--
-- A row whose xmin is our own transaction id was inserted by us. This assumes
-- the ledger write does not insert the transaction inside a savepoint (a
-- subtransaction has its own xid), which the app never does.
create function reject_entries_for_committed_transaction() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from transactions
     where id = new.transaction_id
       and xmin = pg_current_xact_id()::xid
  ) then
    raise exception 'transaction % is already committed; entries can only be added in the DB transaction that created it', new.transaction_id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger entries_same_db_transaction
  before insert on entries
  for each row execute function reject_entries_for_committed_transaction();
