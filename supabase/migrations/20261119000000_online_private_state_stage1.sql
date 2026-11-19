-- Bestias de Guerra: preparación aditiva para estado online privado.
-- FASE 1/2: crea la fuente privada y conserva compatibilidad legacy.
--
-- IMPORTANTE:
-- - Esta migración NO completa por sí sola la privacidad online.
-- - No elimina game_rooms.game_state ni cambia las políticas legacy.
-- - No desplegar validate-action ni anunciar privacidad hasta completar la fase
--   de cliente/Realtime y la migración de corte (que retirará el acceso legacy).
-- - Las 143 salas existentes se conservan; los UID se copian solo si son UUID válidos.
--
-- La migración es repetible y no borra ni sobrescribe estados privados existentes.

begin;

alter table public.game_rooms
  add column if not exists player1_uid uuid,
  add column if not exists player2_uid uuid;

create table if not exists public.room_private_state (
  room_id text primary key
    references public.game_rooms(id) on delete cascade,
  game_state jsonb not null,
  state_version integer not null default 0 check (state_version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.room_private_state enable row level security;
revoke all on table public.room_private_state from anon, authenticated;

-- Backfill de identidades antiguas. El patrón se valida antes del cast para
-- evitar que un dato legacy malformado aborte toda la migración.
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

-- Copia inicial del estado. Nunca reemplaza una fila privada ya creada.
insert into public.room_private_state (room_id, game_state, state_version, updated_at)
select
  id,
  game_state,
  coalesce((game_state->>'stateVersion')::integer, 0),
  coalesce(updated_at, now())
from public.game_rooms
where game_state is not null
on conflict (room_id) do nothing;

commit;

-- Comprobaciones posteriores recomendadas:
-- select count(*) from public.game_rooms;
-- select count(*) from public.room_private_state;
-- select count(*) from public.game_rooms where player1_uid is null;
-- select count(*) from public.game_rooms where status = 'playing';
--
-- FASE 2 pendiente:
-- 1. Cambiar create/join/leave/dispatchAction para operar vía Edge Functions.
-- 2. Separar canales privados de cada jugador y autorizar Realtime por membresía.
-- 3. Probar dos usuarios reales y comprobar que no reciben mano/mazo ajenos.
-- 4. Solo entonces quitar las políticas públicas de game_rooms y limpiar game_state.
