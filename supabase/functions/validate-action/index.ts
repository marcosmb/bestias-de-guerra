// Authoritative online action endpoint.
// Not deployable until the private-state migration, room lifecycle endpoints,
// and private Realtime authorization are installed and verified.

import { createClient } from "npm:@supabase/supabase-js@2";
import { reducer } from "../../../src/game/engine.ts";
import { isLegalAction } from "../../../src/game/legalActions.ts";
import { filterOnlineState } from "../../../src/game/onlineState.ts";
import type { Action, GameState } from "../../../src/game/types.ts";
import type { Card } from "../../../src/game/cardData.ts";

const corsHeaders = {
  // Set APP_ALLOWED_ORIGIN to the exact deployed frontend origin before deployment.
  // Fail closed when unset; never expose authenticated endpoints with wildcard CORS.
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function allCards(state: GameState): Card[] {
  const cards: Card[] = [];
  for (const player of state.players) {
    cards.push(...player.hand, ...player.deck, ...player.graveyard);
    for (const monster of player.field) {
      if (!monster) continue;
      cards.push(monster.card);
      if (monster.trap) cards.push(monster.trap);
      if (monster.magic) cards.push(monster.magic);
    }
  }
  if (state.pendingTrap) cards.push(state.pendingTrap.trap);
  if (state.selection.kind === "place-trap" || state.selection.kind === "place-magic" ||
      state.selection.kind === "magic-target-monster" || state.selection.kind === "revive-choice") {
    cards.push(state.selection.card);
  }
  // Turn-start effects can hold a card outside the hand/field while awaiting
  // the player's placement choice. It remains canonical and must be resolvable.
  for (const selection of state.pendingTurnStartSelections ?? []) {
    if (selection.kind === "place-trap" || selection.kind === "place-magic" ||
        selection.kind === "magic-target-monster" || selection.kind === "revive-choice") {
      cards.push(selection.card);
    }
  }
  return cards;
}

// Never pass a card object supplied by the browser to the game reducer.
// Resolve every card-bearing action against the canonical server state.
function canonicalizeAction(action: Record<string, unknown>, state: GameState): Action | null {
  const type = action.type;
  if (typeof type !== "string") return null;

  const card = action.card;
  let canonicalCard: Card | undefined;
  if (card !== undefined) {
    if (!isRecord(card) || typeof card.instanceId !== "string") return null;
    canonicalCard = allCards(state).find((candidate) => candidate.instanceId === card.instanceId);
    if (!canonicalCard) return null;
  }

  const safe = { ...action };
  if (canonicalCard) safe.card = canonicalCard;

  // The browser must not choose the result of a die roll.
  if (type === "ROLL_DICE") {
    safe.roll = crypto.getRandomValues(new Uint32Array(1))[0] % 6 + 1;
  }

  return safe as unknown as Action;
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

    const body: unknown = await req.json();
    if (!isRecord(body) || typeof body.roomId !== "string" ||
        typeof body.expectedVersion !== "number" || !Number.isSafeInteger(body.expectedVersion) ||
        !isRecord(body.action) || typeof body.action.type !== "string") {
      return json({ error: "Invalid request" }, 400);
    }

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
    const playerIndex: 0 | 1 | null = room.player1_uid === userId ? 0 :
      room.player2_uid === userId ? 1 : null;
    if (playerIndex === null) return json({ error: "Not a room player" }, 403);

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
    const actingPlayer = currentState?.phase === "playing" &&
      currentState.selection?.kind === "choose-destroy-associated-card"
      ? currentState.selection.player
      : currentState?.currentPlayer;
    if (!isRecord(currentState) || !Array.isArray(currentState.players) ||
        actingPlayer !== playerIndex) {
      return json({ error: "Not your turn or invalid game state" }, 403);
    }

    const action = canonicalizeAction(body.action, currentState);
    if (!action || !isLegalAction(currentState, playerIndex, action)) {
      return json({ error: "Illegal action" }, 422);
    }

    const nextState = reducer(currentState, action);
    if (nextState === currentState) return json({ error: "Action was not applied" }, 422);
    nextState.stateVersion = privateRow.state_version + 1;

    // Optimistic compare-and-swap: only one concurrent action can commit a version.
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

    if (nextState.phase === "game-over") {
      await db.from("game_rooms").update({
        status: "finished",
        winner: nextState.isDraw ? "draw" : nextState.winner === 0 ? "player1" : "player2",
        updated_at: new Date().toISOString(),
      }).eq("id", body.roomId);
    }

    // Each player receives a separately filtered payload on a distinct topic.
    // The corresponding private-channel RLS policies must be installed before
    // this endpoint is deployed.
    const deliveries = await Promise.all(([0, 1] as const).map(async (index) => {
      const uid = index === 0 ? room.player1_uid : room.player2_uid;
      if (!uid) return;
      const channel = db.channel(`room:${body.roomId}:player:${uid}`, {
        config: { private: true },
      });
      try {
        await channel.send({
          type: "broadcast",
          event: "game-state",
          payload: {
            stateVersion: saved.state_version,
            gameState: filterOnlineState(nextState, index),
          },
        });
      } finally {
        await db.removeChannel(channel);
      }
    }));
    await Promise.all(deliveries);

    return json({
      ok: true,
      stateVersion: saved.state_version,
      gameState: filterOnlineState(nextState, playerIndex),
    });
  } catch {
    return json({ error: "Invalid request or internal server error" }, 400);
  }
});
