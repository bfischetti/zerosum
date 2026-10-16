-- A reversal can never itself be voided. A CHECK cannot look at another row,
-- so this needs a trigger.

create function reject_reversal_of_reversal() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from transactions where id = new.reverses_id and type = 'reversal'
  ) then
    raise exception 'transaction % is a reversal and cannot be voided', new.reverses_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transactions_no_void_of_reversal
  before insert on transactions
  for each row
  when (new.reverses_id is not null)
  execute function reject_reversal_of_reversal();
