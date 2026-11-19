// Authenticated room lifecycle for private online matches.
// Uses the service role only after verifying the caller's Supabase JWT.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildDeck } from "../../../src/game/cardData.ts";
import { createPlayer, drawCards, shuffleDeck } from "../../../src/game/types.ts";
import type { GameState } from "../../../src/game/types.ts";
import { filterOnlineState } from "../../../src/game/onlineState.ts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Jugador";
  const name = value.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 24);
  return name || "Jugador";
}

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
}

function createInitialState(player1Name: string): GameState {
  const p1 = drawCards(createPlayer(0, player1Name, shuffleDeck(buildDeck())), 7);
  const p2 = drawCards(createPlayer(1, "Jugador 2", shuffleDeck(buildDeck())), 7);
  const startingPlayer = crypto.getRandomValues(new Uint8Array(1))[0] % 2 as 0 | 1;
  const state: GameState = {
    phase: "playing",
    mode: "online",
    difficulty: "normal",
    currentPlayer: startingPlayer,
    turnCount: 0,
    stateVersion: 0,
    players: [p1, p2],
    selection: { kind: "none" },
    log: [`¡Empieza la partida! Empieza ${startingPlayer === 0 ? p1.name : p2.name}.`],
    winner: null,
    isDraw: false,
    pendingTrap: null,
    pendingDice: null,
    lastCombat: null,
    passTarget: startingPlayer,
    diceResult: null,
  };
  return state;
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

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const body: unknown = await req.json();
    if (!isRecord(body) || typeof body.operation !== "string") return json({ error: "Invalid request" }, 400);
    const user = authData.user;
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.operation === "create") {
      const playerName = cleanName(body.playerName);
      const state = createInitialState(playerName);
      let roomId = "";
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        roomId = newRoomCode();
        const { error } = await db.from("game_rooms").insert({
          id: roomId,
          player1_uid: user.id,
          player2_uid: null,
          player1: { id: user.id, name: playerName, connected: true },
          player2: { id: null, name: null, connected: false },
          // Never put private game data in the legacy publicly-readable column.
          game_state: {},
          current_turn: state.currentPlayer === 0 ? "player1" : "player2",
          status: "waiting",
          winner: null,
        });
        if (!error) inserted = true;
        else if (error.code !== "23505") return json({ error: "Could not create room" }, 500);
      }
      if (!inserted) return json({ error: "Could not allocate room code" }, 503);

      const { error: privateError } = await db.from("room_private_state").insert({
        room_id: roomId,
        game_state: state,
        state_version: 0,
      });
      if (privateError) {
        await db.from("game_rooms").delete().eq("id", roomId).eq("player1_uid", user.id);
        return json({ error: "Could not initialize private game state" }, 500);
      }
      return json({ roomId, role: "player1", state: filterOnlineState(state, 0), stateVersion: 0 });
    }

    if (typeof body.roomId !== "string" || !/^[A-Z0-9]{5}$/.test(body.roomId.toUpperCase())) {
      return json({ error: "Invalid room code" }, 400);
    }
    const roomId = body.roomId.toUpperCase();

    const { data: room, error: roomError } = await db.from("game_rooms")
      .select("id, player1_uid, player2_uid, player1, player2, status")
      .eq("id", roomId).maybeSingle();
    if (roomError) return json({ error: "Could not load room" }, 500);
    if (!room) return json({ error: "Room not found" }, 404);

    if (body.operation === "join") {
      if (room.player1_uid === user.id) return json({ error: "You already own this room" }, 409);
      if (room.player2_uid && room.player2_uid !== user.id) return json({ error: "Room is full" }, 409);
      if (room.status !== "waiting" && room.player2_uid !== user.id) return json({ error: "Room is not waiting" }, 409);

      const playerName = cleanName(body.playerName);
      const { data: claimed, error: claimError } = await db.from("game_rooms")
        .update({
          player2_uid: user.id,
          player2: { id: user.id, name: playerName, connected: true },
          status: "playing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId).eq("status", "waiting").is("player2_uid", null)
        .select("id").maybeSingle();

      if (claimError) return json({ error: "Could not join room" }, 500);
      if (!claimed && room.player2_uid !== user.id) return json({ error: "Room was claimed by another player" }, 409);

      const { data: privateRow, error: privateError } = await db.from("room_private_state")
        .select("game_state, state_version").eq("room_id", roomId).maybeSingle();
      if (privateError || !privateRow) return json({ error: "Private state unavailable; legacy room cannot be joined securely" }, 409);

      const state = privateRow.game_state as GameState;
      const updatedState: GameState = {
        ...state,
        players: [
          { ...state.players[0], name: (room.player1 as { name?: string })?.name ?? "Jugador 1" },
          { ...state.players[1], name: playerName },
        ],
        log: state.turnCount === 0
          ? [`¡Empieza la partida! Empieza ${state.currentPlayer === 0 ? ((room.player1 as { name?: string })?.name ?? "Jugador 1") : playerName}.`]
          : state.log,
      };
      const { error: saveError } = await db.from("room_private_state").update({
        game_state: updatedState,
        state_version: privateRow.state_version + 1,
        updated_at: new Date().toISOString(),
      }).eq("room_id", roomId).eq("state_version", privateRow.state_version);
      if (saveError) return json({ error: "Could not initialize joined player" }, 409);
      const presenceChannel = db.channel("room-presence:" + roomId, { config: { private: true } });
      try {
        await presenceChannel.send({ type: "broadcast", event: "room-status", payload: { status: "player-joined" } });
      } finally {
        await db.removeChannel(presenceChannel);
      }
      return json({ roomId, role: "player2", state: filterOnlineState(updatedState, 1), stateVersion: privateRow.state_version + 1 });
    }

    if (body.operation === "get") {
      const playerIndex: 0 | 1 | null = room.player1_uid === user.id ? 0 :
        room.player2_uid === user.id ? 1 : null;
      if (playerIndex === null) return json({ error: "Not a room player" }, 403);
      const { data: privateRow, error: privateError } = await db.from("room_private_state")
        .select("game_state, state_version").eq("room_id", roomId).maybeSingle();
      if (privateError || !privateRow) return json({ error: "Private state unavailable" }, 404);
      return json({
        roomId,
        role: playerIndex === 0 ? "player1" : "player2",
        opponentConnected: playerIndex === 0 ? Boolean(room.player2_uid) : Boolean(room.player1_uid),
        state: filterOnlineState(privateRow.game_state as GameState, playerIndex),
        stateVersion: privateRow.state_version,
      });
    }

    if (body.operation === "leave") {
      if (room.player2_uid === user.id) {
        const { error } = await db.from("game_rooms").update({
          player2_uid: null,
          player2: { id: null, name: null, connected: false },
          status: "waiting",
          updated_at: new Date().toISOString(),
        }).eq("id", roomId).eq("player2_uid", user.id);
        if (error) return json({ error: "Could not leave room" }, 500);
      } else if (room.player1_uid === user.id) {
        // Keep the room row and private state for audit/legacy preservation.
        const { error } = await db.from("game_rooms").update({
          status: "finished",
          updated_at: new Date().toISOString(),
        }).eq("id", roomId).eq("player1_uid", user.id);
        if (error) return json({ error: "Could not close room" }, 500);
      } else {
        return json({ error: "Not a room player" }, 403);
      }
      const presenceChannel = db.channel("room-presence:" + roomId, { config: { private: true } });
      try {
        await presenceChannel.send({ type: "broadcast", event: "room-status", payload: { status: room.player2_uid === user.id ? "player-left" : "room-closed" } });
      } finally {
        await db.removeChannel(presenceChannel);
      }
      return json({ ok: true });
    }

    return json({ error: "Unsupported operation" }, 400);
  } catch {
    return json({ error: "Invalid request or internal server error" }, 400);
  }
});
