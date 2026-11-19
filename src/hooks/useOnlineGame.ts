import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Action, GameState } from '../game/types';
import { isLegalAction } from '../game/legalActions';

export type GameMode = 'local' | 'cpu' | 'online';

type PlayerRole = 'player1' | 'player2' | 'spectator';
type RoomPresence = { presence_ref: string; user_id?: string; role?: string };
type LifecycleResponse = {
  roomId: string;
  role: 'player1' | 'player2';
  state: GameState;
  stateVersion: number;
  opponentConnected?: boolean;
};

export type OnlineGameHook = {
  gameState: GameState | null;
  mode: GameMode;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  roomId: string | null;
  playerRole: PlayerRole | null;
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

export function useOnlineGame(): OnlineGameHook {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<GameMode>('local');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<PlayerRole | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<GameState | null>(null);
  const roomRef = useRef<string | null>(null);
  const roleRef = useRef<PlayerRole | null>(null);
  const userIdRef = useRef<string | null>(null);
  const stateVersionRef = useRef(0);
  const stateChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dispatchingRef = useRef(false);

  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  const setCurrentState = useCallback((next: GameState | null, version?: number) => {
    stateRef.current = next;
    setGameState(next);
    if (typeof version === 'number') stateVersionRef.current = version;
    else if (next) stateVersionRef.current = next.stateVersion ?? stateVersionRef.current;
  }, []);

  const ensureAuthenticated = useCallback(async (): Promise<string> => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    let user = sessionData.session?.user;
    if (!user) {
      const { data, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError || !data.user) throw signInError ?? new Error('No se pudo crear la identidad anónima');
      user = data.user;
    }
    userIdRef.current = user.id;
    return user.id;
  }, []);

  const invokeLifecycle = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('room-lifecycle', { body });
    if (invokeError) throw invokeError;
    return data as LifecycleResponse;
  }, []);

  const closeChannels = useCallback(async () => {
    const channels = [stateChannelRef.current, presenceChannelRef.current].filter(Boolean);
    stateChannelRef.current = null;
    presenceChannelRef.current = null;
    await Promise.all(channels.map((channel) => supabase.removeChannel(channel!)));
  }, []);

  const connectRoom = useCallback(async (id: string, role: 'player1' | 'player2') => {
    await closeChannels();
    const userId = userIdRef.current;
    if (!userId) throw new Error('Falta la identidad autenticada');
    const stateTopic = `room:${id}:player:${userId}`;
    const stateChannel = supabase.channel(stateTopic, { config: { private: true } })
      .on('broadcast', { event: 'game-state' }, ({ payload }) => {
        const incoming = payload?.gameState as GameState | undefined;
        const version = payload?.stateVersion;
        if (!incoming || typeof version !== 'number' || version <= stateVersionRef.current) return;
        setCurrentState(incoming, version);
      });
    stateChannelRef.current = stateChannel;
    await new Promise<void>((resolve, reject) => {
      stateChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsConnected(false);
          setError('No se pudo autorizar el canal privado de la partida');
          reject(new Error('No se pudo autorizar el canal privado de la partida'));
        }
      });
    });

    const presenceChannel = supabase.channel(`room-presence:${id}`, {
      config: { private: true, presence: { key: userId } },
    })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState() as Record<string, RoomPresence[]>;
        const online = Object.values(presenceState).flat()
          .some((presence) => presence.user_id !== userId);
        setOpponentConnected(online);
        setWaitingForOpponent(role === 'player1' && !online);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if ((newPresences as unknown as RoomPresence[]).some((presence) => presence.user_id !== userId)) {
          setOpponentConnected(true);
          setWaitingForOpponent(false);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        if ((leftPresences as unknown as RoomPresence[]).some((presence) => presence.user_id !== userId)) {
          setOpponentConnected(false);
          setWaitingForOpponent(role === 'player1');
        }
      })
      .on('broadcast', { event: 'room-status' }, async ({ payload }) => {
        if (payload?.status === 'player-joined') {
          setOpponentConnected(true);
          setWaitingForOpponent(false);
          try {
            const latest = await invokeLifecycle({ operation: 'get', roomId: id });
            if (latest?.state) setCurrentState(latest.state, latest.stateVersion);
          } catch (refreshError) {
            console.error('No se pudo actualizar el estado tras unirse el rival', refreshError);
          }
        } else if (payload?.status === 'player-left' || payload?.status === 'room-closed') {
          setOpponentConnected(false);
          setWaitingForOpponent(role === 'player1');
        }
      });
    presenceChannelRef.current = presenceChannel;
    await new Promise<void>((resolve, reject) => {
      presenceChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setError('No se pudo conectar al canal de presencia de la sala');
          reject(new Error('No se pudo conectar al canal de presencia de la sala'));
        }
      });
    });
    const presenceStatus = await presenceChannel.track({ user_id: userId, role });
    if (presenceStatus !== 'ok') {
      throw new Error('No se pudo publicar la presencia en la sala');
    }
  }, [closeChannels, invokeLifecycle, setCurrentState]);

  const createRoom = useCallback(async (playerName: string): Promise<string> => {
    setError(null);
    try {
      await ensureAuthenticated();
      const result = await invokeLifecycle({ operation: 'create', playerName });
      if (!result?.roomId || !result.state) throw new Error('El servidor devolvió una respuesta de sala incompleta');
      roomRef.current = result.roomId;
      roleRef.current = 'player1';
      setRoomId(result.roomId);
      setPlayerRole('player1');
      setCurrentState(result.state, result.stateVersion);
      setMode('online');
      setWaitingForOpponent(true);
      setOpponentConnected(false);
      await connectRoom(result.roomId, 'player1');
      return result.roomId;
    } catch (createError) {
      if (roomRef.current && roleRef.current === 'player1') {
        try { await invokeLifecycle({ operation: 'leave', roomId: roomRef.current }); } catch { /* best-effort cleanup */ }
      }
      await closeChannels();
      roomRef.current = null;
      roleRef.current = null;
      setRoomId(null);
      setPlayerRole(null);
      setWaitingForOpponent(false);
      setIsConnected(false);
      const message = createError instanceof Error ? createError.message : 'Error creando sala';
      setError(message);
      throw createError;
    }
  }, [closeChannels, connectRoom, ensureAuthenticated, invokeLifecycle, setCurrentState]);

  const joinRoom = useCallback(async (requestedRoomId: string, playerName: string): Promise<boolean> => {
    setError(null);
    try {
      await ensureAuthenticated();
      const id = requestedRoomId.trim().toUpperCase();
      const result = await invokeLifecycle({ operation: 'join', roomId: id, playerName });
      if (!result?.roomId || !result.state) throw new Error('El servidor devolvió una respuesta de sala incompleta');
      roomRef.current = result.roomId;
      roleRef.current = 'player2';
      setRoomId(result.roomId);
      setPlayerRole('player2');
      setCurrentState(result.state, result.stateVersion);
      setMode('online');
      setOpponentConnected(true);
      setWaitingForOpponent(false);
      await connectRoom(result.roomId, 'player2');
      return true;
    } catch (joinError) {
      if (roomRef.current && roleRef.current === 'player2') {
        try { await invokeLifecycle({ operation: 'leave', roomId: roomRef.current }); } catch { /* best-effort cleanup */ }
      }
      await closeChannels();
      roomRef.current = null;
      roleRef.current = null;
      setRoomId(null);
      setPlayerRole(null);
      setOpponentConnected(false);
      setWaitingForOpponent(false);
      setIsConnected(false);
      setGameState(null);
      stateRef.current = null;
      stateVersionRef.current = 0;
      setError(joinError instanceof Error ? joinError.message : 'Error uniéndose a la sala');
      return false;
    }
  }, [closeChannels, connectRoom, ensureAuthenticated, invokeLifecycle, setCurrentState]);

  const leaveRoom = useCallback(async () => {
    const id = roomRef.current;
    try {
      if (id) await invokeLifecycle({ operation: 'leave', roomId: id });
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'No se pudo abandonar la sala');
    } finally {
      await closeChannels();
      roomRef.current = null;
      roleRef.current = null;
      setRoomId(null);
      setPlayerRole(null);
      setCurrentState(null);
      stateRef.current = null;
      stateVersionRef.current = 0;
      setOpponentConnected(false);
      setWaitingForOpponent(false);
      setIsConnected(false);
      setMode('local');
    }
  }, [closeChannels, invokeLifecycle, setCurrentState]);

  const dispatchAction = useCallback((action: Action) => {
    const current = stateRef.current;
    const id = roomRef.current;
    const role = roleRef.current;
    if (!current || !id || waitingForOpponent || (role !== 'player1' && role !== 'player2')) return;
    if (dispatchingRef.current || current.currentPlayer !== (role === 'player1' ? 0 : 1)) return;
    if (!isLegalAction(current, role === 'player1' ? 0 : 1, action)) return;

    dispatchingRef.current = true;
    void (async () => {
      try {
        const { data, error: actionError } = await supabase.functions.invoke('validate-action', {
          body: { roomId: id, expectedVersion: stateVersionRef.current, action },
        });
        if (actionError) throw actionError;
        if (!data?.ok || !data.gameState || typeof data.stateVersion !== 'number') {
          throw new Error(data?.error ?? 'El servidor rechazó la acción');
        }
        setCurrentState(data.gameState as GameState, data.stateVersion);
        setError(null);
      } catch (actionFailure) {
        setError(actionFailure instanceof Error ? actionFailure.message : 'No se pudo ejecutar la acción');
        try {
          const latest = await invokeLifecycle({ operation: 'get', roomId: id });
          if (latest?.state) setCurrentState(latest.state, latest.stateVersion);
        } catch (refreshFailure) {
          console.error('No se pudo recuperar el estado autoritativo', refreshFailure);
        }
      } finally {
        dispatchingRef.current = false;
      }
    })();
  }, [invokeLifecycle, setCurrentState, waitingForOpponent]);

  const sendRematch = useCallback(() => {
    setError('La revancha online estará disponible cuando se implemente el endpoint de reinicio seguro.');
  }, []);

  useEffect(() => () => {
    if (stateChannelRef.current) void supabase.removeChannel(stateChannelRef.current);
    if (presenceChannelRef.current) void supabase.removeChannel(presenceChannelRef.current);
  }, []);

  const isHost = playerRole === 'player1';
  const myIndex = playerRole === 'player1' ? 0 : playerRole === 'player2' ? 1 : null;

  return {
    gameState,
    mode,
    difficulty: 'normal',
    roomId,
    playerRole,
    isHost,
    opponentConnected,
    waitingForOpponent,
    myTurn: myIndex !== null && gameState?.currentPlayer === myIndex,
    createRoom,
    joinRoom,
    leaveRoom,
    dispatchAction,
    sendRematch,
    isConnected,
    error,
  };
}
