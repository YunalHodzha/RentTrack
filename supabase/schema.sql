-- RentTrack — Supabase (Postgres) schema, mirror of src/db/schema.ts
-- =====================================================================
-- Run this in the Supabase SQL editor (or via the Supabase CLI) once to
-- provision the cloud backend for Phase 4. It is the SERVER source of truth;
-- the local SQLite schema is owned by drizzle-kit migrations (drizzle/).
-- Keep the two in sync by hand when columns change.
--
-- Design notes:
--  * Primary keys are client-generated UUIDs (expo-crypto randomUUID) so offline
--    inserts merge cleanly — Postgres just stores the uuid the device created.
--  * created_at / updated_at / deleted_at are TEXT, not timestamptz, on purpose:
--    the device generates ISO-8601 UTC strings and the sync engine compares them
--    by last-write-wins. Storing TEXT guarantees byte-for-byte round-trip so the
--    LWW comparison is identical on both ends.
--  * Every row is owned by user_id; RLS enforces auth.uid() = user_id so a user
--    can only ever see/modify their own rows.
--  * Deletes are soft (deleted_at). The client never hard-deletes, so the
--    ON DELETE CASCADE FKs below are integrity backstops, not the delete path.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.properties (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null check (type in ('apartment','garage','land','office','other')),
  name        text not null,
  address     text,
  status      text not null default 'free' check (status in ('free','rented','unavailable')),
  notes       text,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  text
);

create table if not exists public.tenants (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  text
);

create table if not exists public.leases (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  property_id     uuid not null references public.properties (id) on delete cascade,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  rent_amount     double precision not null,
  currency        text not null default 'EUR' check (currency in ('EUR','BGN')),
  payment_day     integer not null,
  start_date      text not null,
  end_date        text,
  deposit_amount  double precision,
  status          text not null default 'active' check (status in ('active','ended')),
  notes           text,
  created_at      text not null,
  updated_at      text not null,
  deleted_at      text
);

create table if not exists public.payments (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  lease_id    uuid not null references public.leases (id) on delete cascade,
  period      text not null,
  amount      double precision not null,
  paid_date   text,
  status      text not null default 'pending' check (status in ('paid','partial','pending','overdue')),
  method      text check (method in ('cash','bank','other')),
  notes       text,
  created_at  text not null,
  updated_at  text not null,
  deleted_at  text
);

-- ---------- Indexes (mirror the local SQLite schema) ----------

create index if not exists idx_leases_property_id on public.leases (property_id);
create index if not exists idx_leases_tenant_id   on public.leases (tenant_id);
create index if not exists idx_payments_lease_id  on public.payments (lease_id);

-- Partial unique: only live rows are constrained, so a period can be re-used
-- after its previous payment is soft-deleted.
create unique index if not exists unique_lease_period
  on public.payments (lease_id, period) where deleted_at is null;

-- Sync helpers: pulls filter by updated_at per user.
create index if not exists idx_properties_user_updated on public.properties (user_id, updated_at);
create index if not exists idx_tenants_user_updated    on public.tenants (user_id, updated_at);
create index if not exists idx_leases_user_updated     on public.leases (user_id, updated_at);
create index if not exists idx_payments_user_updated   on public.payments (user_id, updated_at);

-- ---------- Row-Level Security ----------
-- Every table: a user may only touch rows where user_id = auth.uid().

alter table public.properties enable row level security;
alter table public.tenants    enable row level security;
alter table public.leases     enable row level security;
alter table public.payments   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['properties','tenants','leases','payments'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);

    execute format(
      'create policy %I_select on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    -- No DELETE policy on purpose: clients soft-delete (set deleted_at) only.
  end loop;
end $$;

-- ---------- Privileges ----------
-- RLS needs table-level GRANTs as well as policies: GRANT decides which
-- operations a role may attempt, RLS decides which rows. Only the signed-in
-- `authenticated` role gets access — the app is gated, so `anon` stays locked
-- out entirely (no GRANT = 401 before RLS is even consulted). No DELETE granted
-- (soft-delete only).

grant usage on schema public to authenticated;
grant select, insert, update on
  public.properties, public.tenants, public.leases, public.payments
  to authenticated;
