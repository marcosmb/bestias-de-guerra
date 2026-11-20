# Archivo histórico: borrador de privacidad online

Este documento se conserva únicamente como referencia histórica. **No es una migración ejecutable ni debe aplicarse.** La implementación vigente está en `supabase/migrations/20261119000000_online_private_state_stage1.sql`, `20261119010000_private_realtime_authorization.sql` y `20261119020000_private_online_cutover.sql`.

---

-- BORRADOR: no ejecutar en producción. Pendiente de probar en un proyecto Supabase de desarrollo.
-- Requiere Supabase Auth activo (los jugadores deben tener auth.uid()).
-- Pasos previos: activar sesiones anónimas o email en Auth; después aplicar este archivo.
-- Reversión: ver bloque "ROLLBACK" al final.

-- 1. Metadatos públicos de la sala: sin estado de juego.
alter table game_rooms add column if not exists player1_uid uuid;
alter table game_rooms add column if not exists player2_uid uuid;

-- 2. Estado privado (fuente de verdad) sin lectura pública.
create table if not exists room_private_state (
  room_id text primary key references game_rooms(id) on delete cascade,
  game_state jsonb not null,
  state_version integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table room_private_state enable row level security;
-- Sin políticas para anon/authenticated: nadie lee ni escribe directamente.
-- Solo el rol de servicio (Edge Function) accede.
revoke all on room_private_state from anon, authenticated;

-- 3. Políticas de game_rooms: solo los jugadores de la sala ven y modifican sus metadatos.
drop policy if exists "Anyone can view waiting or playing rooms" on game_rooms;
drop policy if exists "Anyone can create a room" on game_rooms;
drop policy if exists "Anyone can update playing rooms" on game_rooms;
drop policy if exists "Anyone can delete rooms" on game_rooms;

create policy "Players can view their room"
on game_rooms for select to authenticated
using (auth.uid() = player1_uid or auth.uid() = player2_uid);

create policy "Creator can create a room"
on game_rooms for insert to authenticated
with check (auth.uid() = player1_uid and player2_uid is null);

create policy "Creator can delete their room"
on game_rooms for delete to authenticated
using (auth.uid() = player1_uid);

-- Sin política de update para clientes: los cambios de estado pasan por la Edge Function.

-- 4. Realtime privado: solo los jugadores de la sala pueden suscribirse y emitir en su canal.
-- El cliente debe crear el canal con { config: { private: true } } y topic 'room:<id>'.
create policy "Room players can receive room broadcasts"
on realtime.messages for select to authenticated
using (
  exists (
    select 1 from game_rooms r
    where r.id = split_part(realtime.topic(), ':', 2)
      and auth.uid() in (r.player1_uid, r.player2_uid)
  )
);

create policy "Room players can send room broadcasts"
on realtime.messages for insert to authenticated
with check (
  exists (
    select 1 from game_rooms r
    where r.id = split_part(realtime.topic(), ':', 2)
      and auth.uid() in (r.player1_uid, r.player2_uid)
  )
);

-- 5. Salas existentes: NO borrar indiscriminadamente.
-- Estrategia de conservacion, migracion, cuarentena y eliminacion selectiva:
--   a) Copia de seguridad: exportar game_rooms a una tabla de archivo antes de tocar nada.
--   b) Cuarentena: marcar las salas sin player1_uid (o sin ambos uid) como 'legacy'
--      mediante una columna `legacy boolean default false`, en lugar de borrarlas.
--   c) Migracion opcional: asignar player1_uid = (player1->>'id')::uuid cuando sea
--      un UUID valido; dejar el resto en cuarentena.
--   d) Eliminacion selectiva: solo borrar salas en cuarentena con updated_at anterior
--      a un umbral (p. ej. 7 dias) y previa confirmacion del operador.
--   e) Reversion: restaurar desde la copia de seguridad.
--
-- Ejemplo (no ejecutar sin revision):
--   alter table game_rooms add column if not exists legacy boolean default false;
--   update game_rooms set legacy = true where player1_uid is null;
--   -- delete from game_rooms where legacy = true and updated_at < now() - interval '7 days';

-- ROLLBACK
-- drop policy if exists "Room players can send room broadcasts" on realtime.messages;
-- drop policy if exists "Room players can receive room broadcasts" on realtime.messages;
-- drop policy if exists "Creator can delete their room" on game_rooms;
-- drop policy if exists "Creator can create a room" on game_rooms;
-- drop policy if exists "Players can view their room" on game_rooms;
-- drop table if exists room_private_state;
-- alter table game_rooms drop column if exists player2_uid;
-- alter table game_rooms drop column if exists player1_uid;
-- Restaurar las políticas originales de schema.sql si se necesita volver al estado anterior.
