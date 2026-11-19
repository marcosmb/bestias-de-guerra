-- Bestias de Guerra: additive preparation for private online state.
-- This migration preserves legacy game_rooms rows and game_state data.
-- It is not the privacy cutover: public legacy policies remain unchanged.

begin;

alter table public.game_rooms
  add column if not exists player1_uid uuid,
  add column if not exists player2_uid uuid;

create table if not exists public.room_private_state (
  room_id text primary key references public.game_rooms(id) on delete cascade,
  game_state jsonb not null,
  state_version integer not null default 0 check (state_version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.room_private_state enable row level security;
revoke all on table public.room_private_state from anon, authenticated;
grant all on table public.room_private_state to service_role;

-- Backfill UUID identities only when legacy JSON contains valid UUID strings.
update public.game_rooms
set
  player1_uid = case
    when coalesce(player1->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (player1->>'id')::uuid
    else player1_uid
  end,
  player2_uid = case
    when coalesce(player2->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (player2->>'id')::uuid
    else player2_uid
  end
where player1_uid is null or player2_uid is null;

-- Copy every legacy state once; never overwrite a private state already present.
insert into public.room_private_state (room_id, game_state, state_version, updated_at)
select
  id,
  game_state,
  case
    when coalesce(game_state->>'stateVersion', '') ~ '^[0-9]+
    else 0
  end,
  coalesce(updated_at, now())
from public.game_rooms
where game_state is not null
on conflict (room_id) do nothing;

commit;

-- Post-migration checks:
-- select count(*) from public.game_rooms;
-- select count(*) from public.room_private_state;
-- select count(*) from public.game_rooms where player1_uid is null;
-- select count(*) from public.game_rooms where status = 'playing';
--
-- Do not deploy the action function or claim privacy until:
-- 1. Room lifecycle endpoints create/join/leave via trusted server code.
-- 2. Client uses per-player private Realtime topics only.
-- 3. Realtime RLS policies are installed and public channel access is disabled.
-- 4. Two-user privacy tests pass.
-- 5. A separate cutover migration removes legacy public table access.

      and length(game_state->>'stateVersion') <= 10
      and (game_state->>'stateVersion')::numeric <= 2147483647
      then (game_state->>'stateVersion')::integer
    else 0
  end,
  coalesce(updated_at, now())
from public.game_rooms
where game_state is not null
on conflict (room_id) do nothing;

commit;

-- Post-migration checks:
-- select count(*) from public.game_rooms;
-- select count(*) from public.room_private_state;
-- select count(*) from public.game_rooms where player1_uid is null;
-- select count(*) from public.game_rooms where status = 'playing';
--
-- Do not deploy the action function or claim privacy until:
-- 1. Room lifecycle endpoints create/join/leave via trusted server code.
-- 2. Client uses per-player private Realtime topics only.
-- 3. Realtime RLS policies are installed and public channel access is disabled.
-- 4. Two-user privacy tests pass.
-- 5. A separate cutover migration removes legacy public table access.
