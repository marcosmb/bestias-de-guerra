-- Private Realtime authorization for per-player state topics.
-- Topics:
--   room:<ROOM_CODE>:player:<AUTH_UID>
--   room-presence:<ROOM_CODE>
--
-- Only room members may subscribe. A player may subscribe to their own
-- state topic only; presence is non-sensitive and shared by both members.

begin;

alter table realtime.messages enable row level security;

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
  and exists (
    select 1
    from public.game_rooms r
    where r.id = split_part((select realtime.topic()), ':', 2)
      and (r.player1_uid = (select auth.uid()) or r.player2_uid = (select auth.uid()))
  )
);

drop policy if exists "room members receive shared presence" on realtime.messages;
create policy "room members receive shared presence"
on realtime.messages
for select
to authenticated
using (
  split_part((select realtime.topic()), ':', 1) = 'room-presence'
  and exists (
    select 1
    from public.game_rooms r
    where r.id = split_part((select realtime.topic()), ':', 2)
      and (r.player1_uid = (select auth.uid()) or r.player2_uid = (select auth.uid()))
  )
);

-- No client INSERT policy is granted: clients cannot broadcast actions or state.
-- Authoritative server functions publish using the service role.

commit;

-- Dashboard requirement (not expressible in this migration):
-- Supabase Dashboard > Realtime > Settings > disable "Allow public access".
-- Do this only after both deployed client and server use private topics.
