// Autoritative online action endpoint.
// This function is intentionally not deployed until the additive schema migration
// and the client migration to private per-player channels are complete.

import { createClient } from "npm:@supabase/supabase-js@2";
import { reducer } from "../../../src/game/engine.ts";
import { isLegalAction } from "../../../src/game/legalActions.ts";
import { filterOnlineState } from "../../../src/game/onlineState.ts";
import type { Action, GameState } from "../../../src/game/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration error" }, 500);

    const token = authorization.slice("Bearer ".length);
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    if (
      !body || typeof body !== "object" ||
      typeof body.roomId !== "string" ||
      typeof body.expectedVersion !== "number" ||
      !Number.isSafeInteger(body.expectedVersion) ||
      !body.action || typeof body.action !== "object" ||
      typeof body.action.type !== "string"
    ) return json({ error: "Invalid request" }, 400);

    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: room, error: roomError } = await db
      .from("game_rooms")
      .select("id, player1_uid, player2_uid, status")
      .eq("id", body.roomId)
      .maybeSingle();
    if (roomError) return json({ error: "Could not load room" }, 500);
    if (!room) return json({ error: "Room not found" }, 404);
    if (room.status !== "playing") return json({ error: "Room is not active" }, 409);

    const userId = authData.user.id;
    const playerIndex: 0 | 1 =
      room.player1_uid === userId ? 0 :
      room.player2_uid === userId ? 1 : -1 as never;
    if (playerIndex !== 0 && playerIndex !== 1) return json({ error: "Not a room player" }, 403);

    const { data: privateRow, error: privateError } = await db
      .from("room_private_state")
      .select("game_state, state_version")
      .eq("room_id", body.roomId)
      .maybeSingle();
    if (privateError) return json({ error: "Could not load private game state" }, 500);
    if (!privateRow) return json({ error: "Private game state not initialized" }, 409);
    if (privateRow.state_version !== body.expectedVersion) {
      return json({ error: "Stale game state", stateVersion: privateRow.state_version }, 409);
    }

    const currentState = privateRow.game_state as GameState;
    if (!currentState || currentState.currentPlayer !== playerIndex) {
      return json({ error: "Not your turn" }, 403);
    }

    const action = body.action as Action;
    if (!isLegalAction(currentState, playerIndex, action)) {
      return json({ error: "Illegal action" }, 422);
    }

    const nextState = reducer(currentState, action);
    if (nextState === currentState) return json({ error: "Action was not applied" }, 422);
    nextState.stateVersion = privateRow.state_version + 1;

    // Compare-and-swap prevents two concurrent requests from overwriting each other.
    const { data: saved, error: saveError } = await db
      .from("room_private_state")
      .update({
        game_state: nextState,
        state_version: nextState.stateVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("room_id", body.roomId)
      .eq("state_version", privateRow.state_version)
      .select("state_version")
      .maybeSingle();

    if (saveError) return json({ error: "Could not save game state" }, 500);
    if (!saved) return json({ error: "Concurrent action; refresh state" }, 409);

    return json({
      ok: true,
      stateVersion: saved.state_version,
      gameState: filterOnlineState(nextState, playerIndex),
    });
  } catch {
    return json({ error: "Invalid request or internal server error" }, 400);
  }
});
