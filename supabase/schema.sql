-- Migración para crear la tabla de salas de juego online
-- Ejecutar en Supabase SQL Editor

create table if not exists game_rooms (
  id text primary key, -- código de 6 caracteres alfanuméricos
  player1 jsonb not null, -- { id: string, name: string, connected: boolean }
  player2 jsonb not null, -- { id: string | null, name: string | null, connected: boolean }
  game_state jsonb not null, -- estado completo del juego
  current_turn text not null default 'player1', -- 'player1' | 'player2'
  status text not null default 'waiting', -- 'waiting' | 'playing' | 'finished'
  winner text, -- 'player1' | 'player2' | 'draw' | null
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índice para búsquedas rápidas
create index if not exists idx_game_rooms_status on game_rooms(status);
create index if not exists idx_game_rooms_updated_at on game_rooms(updated_at desc);

-- Habilitar Realtime para la tabla
alter publication supabase_realtime add table game_rooms;

-- Políticas RLS (Row Level Security)
alter table game_rooms enable row level security;

-- Política: cualquiera puede leer salas en espera o en juego
create policy "Anyone can view waiting or playing rooms"
on game_rooms for select
using (status in ('waiting', 'playing'));

-- Política: cualquiera puede crear una sala
create policy "Anyone can create a room"
on game_rooms for insert
with check (true);

-- Política: cualquiera puede actualizar salas en juego (sin auth por ahora)
-- Nota: En producción con auth real, restringir a jugadores de la sala
create policy "Anyone can update playing rooms"
on game_rooms for update
using (status in ('waiting', 'playing'));

-- Política: cualquiera puede eliminar salas (host cleanup)
create policy "Anyone can delete rooms"
on game_rooms for delete
using (true);

-- Función para limpiar salas antiguas (ejecutar via cron job o manualmente)
create or replace function clean_old_rooms()
returns void as $$
begin
  delete from game_rooms
  where updated_at < now() - interval '24 hours'
  and status in ('finished', 'waiting');
end;
$$ language plpgsql;