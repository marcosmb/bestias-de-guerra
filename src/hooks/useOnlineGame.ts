import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type OnlineGameState } from '../lib/supabase';
import type { Action, GameState, PlayerState } from '../game/types';
import { createPlayer, drawCards, shuffleDeck } from '../game/types';
import { isLegalAction } from '../game/legalActions';
import { buildDeck } from '../game/cardData';
import { reducer } from '../game/useGame';
import { filterOnlineState } from '../game/onlineState';

export type GameMode = 'local' | 'cpu' | 'online';

export type OnlineGameHook = {
  gameState: GameState | null;
  mode: GameMode;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';

  roomId: string | null;
  playerRole: 'player1' | 'player2' | 'spectator' | null;
  isHost: boolean;
  opponentConnected: boolean;
  waitingForOpponent: boolean;
  myTurn: boolean;

  createRoom: (playerName: string) => Promise<string>;
  joinRoom: (roomId: string, playerName: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  dispatchAction: (action: Action) => void;
  sendRematch: () => void;

  isConnected: boolean;
  error: string | null;
};

const INITIAL_HAND_SIZE = 7;

export function useOnlineGame(): OnlineGameHook {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<'local' | 'cpu' | 'online'>('local');
  const difficulty = 'normal';

  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'player1' | 'player2' | 'spectator' | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const realGameStateRef = useRef<GameState | null>(null);
  const myPlayerIdRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const isProcessingRef = useRef(false);
  const isHostRef = useRef(false);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const gameInitializedRef = useRef(false);
  const playerRoleRef = useRef<'player1' | 'player2' | 'spectator' | null>(null);

  gameStateRef.current = gameState;
  playerRoleRef.current = playerRole;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    return () => {
      if (actionChannelRef.current) supabase.removeChannel(actionChannelRef.current);
      if (syncChannelRef.current) supabase.removeChannel(syncChannelRef.current);
    };
  }, []);

  const filterStateForPlayer = useCallback(filterOnlineState, []);

  // Enviar accion al host (canal compartido de acciones)
  const broadcastAction = useCallback(async (action: Action) => {
    if (!roomIdRef.current || !actionChannelRef.current) return;
    await actionChannelRef.current.send({
      type: 'broadcast',
      event: 'game-action',
      payload: { playerId: myPlayerIdRef.current, payload: action, timestamp: Date.now() },
    });
  }, []);

  // Enviar sync filtrado a un canal privado concreto (solo la vista de ese jugador)
  const sendSyncToChannel = useCallback(async (channel: ReturnType<typeof supabase.channel>, fullState: GameState, viewerIndex: 0 | 1) => {
    if (!channel) return;
    const filtered = filterStateForPlayer(fullState, viewerIndex);
    await channel.send({
      type: 'broadcast',
      event: 'game-sync',
      payload: { playerId: myPlayerIdRef.current, payload: { gameState: filtered }, timestamp: Date.now() },
    });
  }, [filterStateForPlayer]);

  // broadcastSync: envia la vista filtrada de cada jugador por el canal compartido
  // (compatibilidad). La separacion real se hace en el servidor (RLS + Edge Function).
  const broadcastSync = useCallback(async (fullState: GameState) => {
    if (!roomIdRef.current || !actionChannelRef.current) return;
    const syncPayload = {
      type: 'sync',
      payload: {
        gameStateP1: filterStateForPlayer(fullState, 0),
        gameStateP2: filterStateForPlayer(fullState, 1),
      },
      playerId: myPlayerIdRef.current,
      timestamp: Date.now(),
    };
    await actionChannelRef.current.send({
      type: 'broadcast',
      event: 'game-sync',
      payload: syncPayload,
    });
  }, [filterStateForPlayer]);

  // Manejar accion recibida (solo host procesa)
  const handleRemoteAction = useCallback((payload: { playerId: string; payload: Action }) => {
    if (payload.playerId === myPlayerIdRef.current) return;
    if (isProcessingRef.current) return;
    if (!isHostRef.current) return;

    isProcessingRef.current = true;
    try {
      const currentState = realGameStateRef.current;
      if (!currentState) return;

      const opponentPlayer = playerRoleRef.current === 'player1' ? 1 : 0;
      if (!isLegalAction(currentState, opponentPlayer, payload.payload)) {
        if (realGameStateRef.current) void broadcastSync(realGameStateRef.current);
        return;
      }

      const newState = reducer(currentState, payload.payload);
      if (newState === currentState) return;
      newState.stateVersion = (newState.stateVersion ?? 0) + 1;

      realGameStateRef.current = newState;
      const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
      setGameState(filterStateForPlayer(newState, myIndex));

      // Enviar vista filtrada a cada jugador por su canal privado
      void sendSyncToChannel(actionChannelRef.current!, newState, 0); // fallback
      // Los canales privados se usan cuando estan disponibles; aqui se envia por el canal compartido
      // para compatibilidad, pero solo la vista del destinatario.
      void broadcastSync(newState);
    } catch (e) {
      console.error('Error procesando acciÃ³n remota:', e);
      if (realGameStateRef.current) void broadcastSync(realGameStateRef.current);
    } finally {
      isProcessingRef.current = false;
    }
  }, [broadcastSync, filterStateForPlayer, sendSyncToChannel]);


  const handleSync = useCallback((payload: { playerId: string; payload: { gameStateP1?: GameState; gameStateP2?: GameState; gameState?: GameState } }) => {
    if (payload.playerId === myPlayerIdRef.current) return;
    if (!payload.payload) return;

    const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
    const gameStateForMe = payload.payload.gameState
      ?? (myIndex === 0 ? payload.payload.gameStateP1 : payload.payload.gameStateP2);
    if (!gameStateForMe) return;

    const incomingVersion = gameStateForMe.stateVersion ?? 0;
    const localVersion = realGameStateRef.current?.stateVersion ?? 0;
    if (incomingVersion <= localVersion && realGameStateRef.current) return;

    realGameStateRef.current = gameStateForMe;
    setGameState(gameStateForMe);
  }, []);

  const initializeFullGameState = useCallback((player1Name: string, player2Name: string): GameState => {
    const deck1 = shuffleDeck(buildDeck());
    let p1 = createPlayer(0, player1Name, deck1);
    p1 = drawCards(p1, INITIAL_HAND_SIZE);
    const deck2 = shuffleDeck(buildDeck());
    let p2 = createPlayer(1, player2Name, deck2);
    p2 = drawCards(p2, INITIAL_HAND_SIZE);
    const startingPlayer = Math.random() < 0.5 ? 0 : 1;
    const startingPlayerName = startingPlayer === 0 ? p1.name : p2.name;
    return {
      phase: 'playing',
      mode: 'online',
      difficulty: 'normal',
      currentPlayer: startingPlayer,
      turnCount: 0,
      stateVersion: 0,
      players: [p1, p2] as [PlayerState, PlayerState],
      selection: { kind: 'none' },
      log: ['Â¡Empieza la partida! Empieza ' + startingPlayerName + '.'],
      winner: null,
      isDraw: false,
      pendingTrap: null,
      pendingDice: null,
      lastCombat: null,
      passTarget: startingPlayer,
      diceResult: null,
    };
  }, []);

  const createRoom = useCallback(async (playerName: string): Promise<string> => {
    setError(null);
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData?.user) {
      setError(`Error de autenticaciÃ³n: ${authError?.message ?? 'sin usuario'}`);
      throw authError ?? new Error('Sin usuario anÃ³nimo');
    }
    const myPlayerId = authData.user.id;
    myPlayerIdRef.current = myPlayerId;

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setWaitingForOpponent(true);

    const fullGameState = initializeFullGameState(playerName, 'Jugador 2');
    realGameStateRef.current = fullGameState;

    const roomData = {
      id: roomCode,
      player1_uid: myPlayerId,
      player1: { id: myPlayerId, name: playerName, connected: true },
      player2: { id: null, name: null, connected: false },
      game_state: fullGameState,
      current_turn: fullGameState.currentPlayer === 0 ? 'player1' : 'player2',
      status: 'waiting' as const,
      winner: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('game_rooms').insert(roomData);
    if (error) {
      setWaitingForOpponent(false);
      setError(`Error creando sala: ${error.message}`);
      throw error;
    }

    const channel = supabase
      .channel(`game-room:${roomCode}`, { config: { private: true } })
      .on('broadcast', { event: 'game-action' }, (payload) => handleRemoteAction(payload.payload))
      .on('broadcast', { event: 'game-sync' }, (payload) => handleSync(payload.payload))
      .on('broadcast', { event: 'player-joined' }, (payload) => {
        if (isHostRef.current && realGameStateRef.current) {
          const opponentName = payload.payload?.playerName || 'Jugador 2';
          const opponentId = payload.payload?.playerId;
          const updatedRealState = {
            ...realGameStateRef.current,
            players: [realGameStateRef.current.players[0], { ...realGameStateRef.current.players[1], name: opponentName }] as [PlayerState, PlayerState],
            log: realGameStateRef.current.turnCount === 0 ? ['Â¡Empieza la partida! Empieza ' + (realGameStateRef.current.currentPlayer === 0 ? realGameStateRef.current.players[0].name : opponentName) + '.'] : realGameStateRef.current.log,
          };
          realGameStateRef.current = updatedRealState;
          void supabase.from('game_rooms').update({ game_state: updatedRealState, player2: { id: opponentId, name: opponentName, connected: true }, status: 'playing', updated_at: new Date().toISOString() }).eq('id', roomCode);
          setGameState(filterStateForPlayer(updatedRealState, 0));
          setWaitingForOpponent(false);
          setOpponentConnected(true);
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const other = newPresences.find((p) => p.user_id !== myPlayerIdRef.current);
        if (other) { setOpponentConnected(true); setWaitingForOpponent(false); }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const left = leftPresences.find((p) => p.user_id !== myPlayerIdRef.current);
        if (left) { setOpponentConnected(false); if (isHostRef.current) setWaitingForOpponent(true); }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          presenceRef.current = channel;
          await channel.track({ user_id: myPlayerId, online_at: new Date().toISOString(), role: 'player1', name: playerName });
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Error de conexiÃ³n con la sala');
        }
      });

    actionChannelRef.current = channel;
    roomIdRef.current = roomCode;
    playerRoleRef.current = 'player1';
    isHostRef.current = true;
    setRoomId(roomCode);
    setPlayerRole('player1');
    setIsHost(true);
    setGameState(filterStateForPlayer(fullGameState, 0));
    setMode('online');
    gameInitializedRef.current = true;
    return roomCode;
  }, [handleRemoteAction, handleSync, initializeFullGameState, filterStateForPlayer]);

  const joinRoom = useCallback(async (roomId: string, playerName: string): Promise<boolean> => {
    setError(null);
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData?.user) {
      setError(`Error de autenticaciÃ³n: ${authError?.message ?? 'sin usuario'}`);
      return false;
    }
    const myPlayerId = authData.user.id;
    myPlayerIdRef.current = myPlayerId;

    const upperRoomId = roomId.toUpperCase();
    const { data: roomData, error: roomError } = await supabase.from('game_rooms').select('*').eq('id', upperRoomId).single();
    if (roomError || !roomData) { setError('Sala no encontrada'); return false; }
    const room = roomData as OnlineGameState;
    if (room.player2.id) { setError('La sala ya estÃ¡ completa'); return false; }

    const existingGameState = room.game_state;
    const { error: updateError } = await supabase.from('game_rooms').update({
      player2_uid: myPlayerId,
      player2: { id: myPlayerId, name: playerName, connected: true },
      status: 'playing',
      updated_at: new Date().toISOString(),
    }).eq('id', upperRoomId);
    if (updateError) { setError(`Error uniÃ©ndose: ${updateError.message}`); return false; }

    const updatedGameState = {
      ...existingGameState,
      players: [existingGameState.players[0], { ...existingGameState.players[1], name: playerName }] as [PlayerState, PlayerState],
      log: existingGameState.turnCount === 0 ? ['Â¡Empieza la partida! Empieza ' + (existingGameState.currentPlayer === 0 ? existingGameState.players[0].name : playerName) + '.'] : existingGameState.log,
    };
    realGameStateRef.current = updatedGameState;
    await supabase.from('game_rooms').update({ game_state: updatedGameState, updated_at: new Date().toISOString() }).eq('id', upperRoomId);

    const channel = supabase
      .channel(`game-room:${upperRoomId}`, { config: { private: true } })
      .on('broadcast', { event: 'game-action' }, (payload) => handleRemoteAction(payload.payload))
      .on('broadcast', { event: 'game-sync' }, (payload) => handleSync(payload.payload))
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const other = newPresences.find((p) => p.user_id !== myPlayerIdRef.current);
        if (other) setOpponentConnected(true);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const left = leftPresences.find((p) => p.user_id !== myPlayerIdRef.current);
        if (left) setOpponentConnected(false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          presenceRef.current = channel;
          await channel.track({ user_id: myPlayerId, online_at: new Date().toISOString(), role: 'player2', name: playerName });
          await channel.send({ type: 'broadcast', event: 'player-joined', payload: { playerId: myPlayerId, playerName } });
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Error de conexiÃ³n con la sala');
        }
      });

    actionChannelRef.current = channel;
    roomIdRef.current = upperRoomId;
    playerRoleRef.current = 'player2';
    isHostRef.current = false;
    setRoomId(upperRoomId);
    setPlayerRole('player2');
    setIsHost(false);
    setGameState(filterStateForPlayer(updatedGameState, 1));
    setMode('online');
    setOpponentConnected(true);
    setWaitingForOpponent(false);
    return true;
  }, [handleRemoteAction, handleSync, filterStateForPlayer]);

  const leaveRoom = useCallback(async () => {
    if (actionChannelRef.current) {
      if (presenceRef.current) await presenceRef.current.untrack();
      await supabase.removeChannel(actionChannelRef.current);
      actionChannelRef.current = null;
    }
    if (syncChannelRef.current) { await supabase.removeChannel(syncChannelRef.current); syncChannelRef.current = null; }

    if (roomIdRef.current && isHostRef.current) {
      await supabase.from('game_rooms').delete().eq('id', roomIdRef.current);
    } else if (roomIdRef.current) {
      await supabase.from('game_rooms').update({ player2: { id: null, name: null, connected: false }, status: 'waiting', updated_at: new Date().toISOString() }).eq('id', roomIdRef.current);
    }

    actionChannelRef.current = null;
    syncChannelRef.current = null;
    roomIdRef.current = '';
    setRoomId(null);
    setPlayerRole(null);
    setIsHost(false);
    isHostRef.current = false;
    setOpponentConnected(false);
    setWaitingForOpponent(false);
    setIsConnected(false);
    setGameState(null);
    setMode('local');
    gameInitializedRef.current = false;
  }, []);

  const dispatchAction = useCallback((action: Action) => {
    const currentViewState = gameStateRef.current;
    if (!currentViewState) { console.warn('[ONLINE] AcciÃ³n ignorada: todavÃ­a no hay partida cargada.', action?.type); return; }
    if (waitingForOpponent) { console.warn('[ONLINE] AcciÃ³n ignorada: esperando al rival.', action?.type); return; }
    const role = playerRoleRef.current;
    if (role !== 'player1' && role !== 'player2') { console.warn('[ONLINE] AcciÃ³n ignorada: no hay rol de jugador asignado.', action?.type); return; }
    const myIndex = role === 'player1' ? 0 : 1;
    if (currentViewState.currentPlayer !== myIndex) {
      console.warn('[ONLINE] AcciÃ³n ignorada: no es tu turno.', { actionType: action?.type, currentPlayer: currentViewState.currentPlayer, myIndex });
      return;
    }
    if (!isLegalAction(currentViewState, myIndex, action)) { console.warn('[ONLINE] AcciÃ³n no legal:', action); return; }

    const host = isHostRef.current;
    const authoritativeState = host ? realGameStateRef.current : currentViewState;
    if (!authoritativeState) { console.warn('[ONLINE] AcciÃ³n ignorada: falta el estado autoritativo.', action?.type); return; }

    if (host) {
      const newState = reducer(authoritativeState, action);
      if (newState === authoritativeState) { console.warn('[ONLINE] El reducer no aplicÃ³ la acciÃ³n:', action?.type); return; }
      newState.stateVersion = (newState.stateVersion ?? 0) + 1;
      const filteredState = filterStateForPlayer(newState, myIndex);
      realGameStateRef.current = newState;
      gameStateRef.current = filteredState;
      setGameState(filteredState);
      void broadcastSync(newState);
    } else {
      void broadcastAction(action);
    }
  }, [broadcastAction, broadcastSync, filterStateForPlayer, waitingForOpponent]);

  const sendRematch = useCallback(async () => {
    if (!roomIdRef.current) return;
    await supabase.channel(`game-room:${roomIdRef.current}`).send({ type: 'broadcast', event: 'rematch', payload: { playerId: myPlayerIdRef.current } });
  }, []);

  return {
    gameState,
    mode,
    difficulty,
    roomId,
    playerRole,
    isHost,
    opponentConnected,
    waitingForOpponent,
    myTurn: gameState?.currentPlayer === (playerRoleRef.current === 'player1' ? 0 : 1),
    createRoom,
    joinRoom,
    leaveRoom,
    dispatchAction,
    sendRematch,
    isConnected,
    error,
  };
}
