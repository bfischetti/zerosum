-- Core tables. Rules that can be declared (keys, checks, foreign keys) live
-- here; rules that need triggers come in later migrations. See ADR 0002.

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Membership is permanent (see CONTEXT.md).
create table group_members (
  group_id uuid not null references groups (id),
  member_id uuid not null references members (id),
  joined_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

-- Exactly one account per membership (ADR 0001).
create table accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  member_id uuid not null,
  unique (group_id, member_id),
  -- Target for the composite foreign key from entries.
  unique (id, group_id),
  foreign key (group_id, member_id) references group_members (group_id, member_id)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id),
  type text not null check (type in ('expense', 'settlement', 'reversal')),
  description text,
  -- unique: a transaction is voided at most once.
  reverses_id uuid unique,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  unique (id, group_id),
  check ((type = 'reversal') = (reverses_id is not null)),
  -- A reversal lives in the same group as the transaction it reverses.
  foreign key (reverses_id, group_id) references transactions (id, group_id)
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  -- Denormalised so the two composite foreign keys below can force the
  -- entry's account into the transaction's group, with no trigger needed.
  group_id uuid not null,
  account_id uuid not null,
  amount bigint not null check (amount <> 0),
  -- A member's effect in a transaction is a single netted entry (ADR 0001).
  unique (transaction_id, account_id),
  foreign key (transaction_id, group_id) references transactions (id, group_id),
  foreign key (account_id, group_id) references accounts (id, group_id)
);

create index entries_account_id_idx on entries (account_id);
create index transactions_group_order_idx
  on transactions (group_id, occurred_at, recorded_at, id);
