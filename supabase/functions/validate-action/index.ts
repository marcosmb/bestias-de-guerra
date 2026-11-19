// supabase/functions/validate-action/index.ts
// SKELETON — no desplegado. Requiere Supabase CLI y proyecto de desarrollo.
// Valida autoritativamente las acciones de juego en el servidor.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const { roomId, playerId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Autenticación: el JWT del jugador debe coincidir con playerId.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user || user.id !== playerId) return new Response('Forbidden', { status: 403 });

    // 2. Cargar estado privado de la sala (solo service role).
    const { data: room } = await supabase
      .from('room_private_state')
      .select('game_state, state_version')
      .eq('room_id', roomId)
      .single();
    if (!room) return new Response('Room not found', { status: 404 });

    // 3. Validar que el jugador pertenece a la sala y es su turno.
    const { data: meta } = await supabase
      .from('game_rooms')
      .select('player1_uid, player2_uid, status')
      .eq('id', roomId)
      .single();
    const isP1 = meta?.player1_uid === playerId;
    const isP2 = meta?.player2_uid === playerId;
    if (!isP1 && !isP2) return new Response('Not a player', { status: 403 });
    const playerIndex = isP1 ? 0 : 1;
    if (room.game_state.currentPlayer !== playerIndex) return new Response('Not your turn', { status: 403 });

    // 4. Validar la acción con el motor de juego (importar lógica compartida).
    // TODO: importar reducer/isLegalAction desde un paquete compartido o duplicar
    // la validación mínima aquí. Por ahora, aceptar y persistir (placeholder).
    const newState = room.game_state; // placeholder: aplicar reducer aquí
    const newVersion = (room.state_version ?? 0) + 1;

    // 5. Persistir estado privado y publicar vista filtrada.
    await supabase.from('room_private_state').update({
      game_state: newState,
      state_version: newVersion,
      updated_at: new Date().toISOString(),
    }).eq('room_id', roomId);

    // 6. Enviar estado filtrado por jugador (no el estado completo).
    // TODO: filtrar por jugador antes de broadcast.

    return new Response(JSON.stringify({ ok: true, stateVersion: newVersion }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
