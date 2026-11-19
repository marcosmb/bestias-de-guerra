-- Final access cutover for the private online implementation.
-- Apply ONLY after deploying room-lifecycle + validate-action and verifying
-- two-player E2E tests against a staging project.
-- Legacy room rows and game_state JSON are retained; direct client access ends.

begin;

create or replace function public.is_online_room_member(p_room_id text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.game_rooms r
    where r.id = p_room_id
      and (r.player1_uid = p_user_id or r.player2_uid = p_user_id)
  );
$$;

revoke all on function public.is_online_room_member(text, uuid) from public, anon;
grant execute on function public.is_online_room_member(text, uuid) to authenticated, service_role;

-- Replace policies that queried game_rooms directly: after this cutover its
-- client-facing RLS policies are intentionally removed.
drop policy if exists "room members receive own private game state" on realtime.messages;
create policy "room members receive own private game state"
on realtime.messages
for select
to authenticated
using (
  split_part((select realtime.topic()), ':', 1) = 'room'
  and split_part((select realtime.topic()), ':', 3) = 'player'
  and split_part((select realtime.topic()), ':', 4) = (select auth.uid())::text
  and realtime.messages.extension = 'broadcast'
  and public.is_online_room_member(split_part((select realtime.topic()), ':', 2), (select auth.uid()))
);

drop policy if exists "room members receive shared presence" on realtime.messages;
create policy "room members receive shared presence"
on realtime.messages
for select
to authenticated
using (
  split_part((select realtime.topic()), ':', 1) = 'room-presence'
  and realtime.messages.extension = 'broadcast'
  and public.is_online_room_member(split_part((select realtime.topic()), ':', 2), (select auth.uid()))
);

alter table public.game_rooms enable row level security;
drop policy if exists "Anyone can create a room" on public.game_rooms;
drop policy if exists "Anyone can delete rooms" on public.game_rooms;
drop policy if exists "Anyone can update playing rooms" on public.game_rooms;
drop policy if exists "Anyone can view waiting or playing rooms" on public.game_rooms;

revoke all on table public.game_rooms from public, anon, authenticated;
grant all on table public.game_rooms to service_role;

alter table public.room_private_state enable row level security;
revoke all on table public.room_private_state from public, anon, authenticated;
grant all on table public.room_private_state to service_role;

commit;

-- MANUAL DASHBOARD STEP:
-- Supabase Dashboard > Realtime > Settings > disable "Allow public access".
-- This is required so clients cannot subscribe to these topics without passing
-- the private-channel authorization policies above.
--
-- Legacy rows are intentionally not deleted or rewritten by this cutover.
-- Rooms without valid player*_uid values cannot be resumed by the new secure
-- client and must be handled as legacy/expired rather than weakening RLS.
