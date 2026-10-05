import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type OnlineGameState } from '../lib/supabase';
import { legalActions, isLegalAction, createPlayer, drawCards, shuffleDeck } from '../game/types';
import { buildDeck } from '../game/cardData';
import { reducer } from '../game/useGame';

export type GameMode = 'local' | 'cpu' | 'online';

export type OnlineGameHook = {
  // Estado del juego
  gameState: any; // GameState from the engine
  mode: GameMode;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  
  // Estado online
  roomId: string | null;
  playerRole: 'player1' | 'player2' | 'spectator' | null;
  isHost: boolean;
  opponentConnected: boolean;
  waitingForOpponent: boolean;
  myTurn: boolean;
  
  // Acciones
  createRoom: (playerName: string) => Promise<string>;
  joinRoom: (roomId: string, playerName: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  dispatchAction: (action: any) => void;
  sendRematch: () => void;
  
  // Estado de conexión
  isConnected: boolean;
  error: string | null;
};

const INITIAL_HAND_SIZE = 6;

export function useOnlineGame(): OnlineGameHook {
  const [gameState, setGameState] = useState<any>(null);
  const [mode, setMode] = useState<'local' | 'cpu' | 'online'>('local');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard' | 'expert'>('normal');
  
  // Estado online
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<'player1' | 'player2' | 'spectator' | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [myTurn, setMyTurn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const channelRef = useRef<any>(null);
  const gameStateRef = useRef<any>(null);
  const realGameStateRef = useRef<any>(null); // Estado REAL sin filtrar (fuente de verdad)
  const myPlayerIdRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const isProcessingRef = useRef(false);
  const isHostRef = useRef(false);
  const presenceRef = useRef<any>(null);
  const gameInitializedRef = useRef(false);
  const playerRoleRef = useRef<'player1' | 'player2' | 'spectator' | null>(null);
  
  gameStateRef.current = gameState;
  playerRoleRef.current = playerRole;
  // isHostRef.current NO se resetea aquí - se inicializa en createRoom/joinRoom
  
  // Sincronizar gameState con ref para acceso en callbacks
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  
  // Sincronizar realGameStateRef cuando cambia el estado real (solo host lo mantiene como fuente de verdad)
  useEffect(() => {
    if (isHostRef.current && gameState) {
      // El host mantiene el estado real sin filtrar
      // Para el guest, realGameStateRef se actualiza vía handleSync/broadcastSync
    }
  }, [gameState]);
  
  // Actualizar myTurn cuando cambia gameState o playerRole
  useEffect(() => {
    if (gameState && playerRole) {
      const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
      setMyTurn(gameState.currentPlayer === myIndex);
    }
  }, [gameState, playerRole]);
  
  // Sincronizar playerRoleRef cuando cambia playerRole
  useEffect(() => {
    playerRoleRef.current = playerRole;
  }, [playerRole]);
  
  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);
  
  // Filtrar estado para privacidad: cada jugador solo ve su mano
  const filterStateForPlayer = useCallback((state: any, playerIndex: 0 | 1): any => {
    if (!state) return null;
    return {
      ...state,
      players: state.players.map((p: any, i: number) => ({
        ...p,
        hand: i === playerIndex 
          ? p.hand 
          : p.hand.map((card: any) => ({ 
              ...card, 
              hidden: true, 
              // Preservar campos necesarios para CardView (imagen) pero marcar como oculta
              type: card.type || 'hidden',
              suit: card.suit,
              number: card.number,
              name: card.name,
            })),
        deck: i === playerIndex 
          ? p.deck 
          : p.deck.map((card: any) => ({ 
              ...card, 
              hidden: true,
              type: card.type || 'hidden',
              suit: card.suit,
              number: card.number,
              name: card.name,
            })),
      })),
    };
  }, []);
  
  // Función para enviar acción al oponente
  const broadcastAction = useCallback(async (action: any) => {
    if (!roomIdRef.current) return;
    
    const actionPayload = {
      type: 'action',
      payload: action,
      playerId: myPlayerIdRef.current,
      timestamp: Date.now(),
    };
    
    console.log('[ONLINE-TRACE] B OUTBOUND ACTION', {
      actionType: action?.type,
      currentPlayer: gameStateRef.current?.currentPlayer,
      playerRole: playerRoleRef.current,
      player2Field: realGameStateRef.current?.players[1]?.field?.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      timestamp: Date.now(),
    });
    
    await channelRef.current.send({
      type: 'broadcast',
      event: 'game-action',
      payload: actionPayload,
    });
  }, []);
  
  // Función para enviar sync completo del estado (filtrado para cada jugador)
  const broadcastSync = useCallback(async (fullState: any) => {
    if (!roomIdRef.current || !channelRef.current) return;
    
    // Enviar estado filtrado para cada jugador
    const syncPayload = {
      type: 'sync',
      payload: {
        gameStateP1: filterStateForPlayer(fullState, 0),
        gameStateP2: filterStateForPlayer(fullState, 1),
        playerRole: isHostRef.current ? 'player1' : 'player2',
      },
      playerId: myPlayerIdRef.current,
      timestamp: Date.now(),
    };
    
    console.log('[ONLINE-TRACE] A SYNC OUTBOUND', {
      event: 'game-sync',
      currentPlayer: fullState.currentPlayer,
      turnCount: fullState.turnCount,
      stateVersion: fullState.stateVersion,
      player1Field: fullState.players[0].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      player2Field: fullState.players[1].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
    });
    
    await channelRef.current.send({
      type: 'broadcast',
      event: 'game-sync',
      payload: syncPayload,
    });
  }, [filterStateForPlayer]);
  
  // Manejar acción recibida del oponente
  const handleRemoteAction = useCallback((payload: any) => {
    if (payload.playerId === myPlayerIdRef.current) return;
    if (isProcessingRef.current) return;
    
    // Solo el host procesa las acciones; el guest espera el sync
    if (!isHostRef.current) {
      return;
    }
    
    console.log('[ONLINE-TRACE] A INBOUND ACTION', {
      actionType: payload?.payload?.type,
      playerId: payload?.playerId,
      roomId: roomIdRef.current,
      myPlayerId: myPlayerIdRef.current,
      isHostRef: isHostRef.current,
    });
    
    isProcessingRef.current = true;
    
    try {
      // Usar estado REAL para el reducer (el filtrado rompe el reducer con placeholders hidden)
      const currentState = realGameStateRef.current;
      if (!currentState) {
        console.log('[ONLINE-TRACE] A remote action REJECTED: no realGameStateRef');
        return;
      }
      
      const opponentPlayer = playerRoleRef.current === 'player1' ? 1 : 0;
      if (!isLegalAction(currentState, opponentPlayer, payload.payload)) {
        console.warn('[ONLINE-TRACE] A remote action REJECTED: not legal', payload.payload);
        broadcastSync(realGameStateRef.current);
        return;
      }
      
      console.log('[ONLINE-TRACE] A remote action VALID');
      
      console.log('[ONLINE-TRACE] A remote → reducer');
      const action = payload.payload;
      const newState = reducer(currentState, action);
      // Filtrar el resultado para la vista del jugador actual
      const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
      setGameState(filterStateForPlayer(newState, myIndex));
      
      console.log('[ONLINE-TRACE] A remote reducer result', {
        currentPlayer: newState.currentPlayer,
        turnCount: newState.turnCount,
        player1Field: newState.players[0].field.map((f, i) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
        player2Field: newState.players[1].field.map((f, i) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      });
      console.log('[ONLINE-TRACE] A setGameState called');
      
      // Actualizar estado real (usar newState directamente, no re-ejecutar reducer)
      realGameStateRef.current = newState;
      
      // Incrementar stateVersion para la acción remota aceptada
      newState.stateVersion = (newState.stateVersion ?? 0) + 1;
      
      // Broadcast sync para el guest
      console.log('[ONLINE-TRACE] A → broadcastSync after remote');
      broadcastSync(newState);
    } catch (e) {       console.error('Error procesando acción remota:', e);
        if (realGameStateRef.current) {
          broadcastSync(realGameStateRef.current);
        }
      } finally {
        isProcessingRef.current = false;
      }
  }, [broadcastSync, playerRole]);
  
  // Manejar sincronización completa del estado
  const handleSync = useCallback((payload: any) => {
    if (payload.playerId === myPlayerIdRef.current) return;
    if (!payload.payload) return;
    
    console.log('[ONLINE-TRACE] B SYNC RECEIVED', {
      payloadKeys: Object.keys(payload.payload),
      player1Field: payload.payload.gameStateP1?.players[0]?.field?.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      player2Field: payload.payload.gameStateP2?.players[1]?.field?.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
    });
    
    // Recibir el estado filtrado para nuestro jugador
    const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
    const gameStateForMe = myIndex === 0 ? payload.payload.gameStateP1 : payload.payload.gameStateP2;
    
    if (gameStateForMe) {
      // Verificar stateVersion: solo aplicar si la versión entrante es mayor a la local
      const incomingVersion = gameStateForMe.stateVersion ?? 0;
      const localVersion = realGameStateRef.current?.stateVersion ?? 0;
      if (incomingVersion <= localVersion) {
        console.log('[ONLINE-TRACE] B SYNC REJECTED: incoming version', incomingVersion, '<= local version', localVersion);
        return;
      }
      
      console.log('[ONLINE-TRACE] B STATE APPLIED', {
        myIndex,
        playerRole: playerRoleRef.current,
        currentPlayer: gameStateForMe.currentPlayer,
        turnCount: gameStateForMe.turnCount,
        stateVersion: incomingVersion,
        player1Field: gameStateForMe.players[0].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
        player2Field: gameStateForMe.players[1].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      });
      // Actualizar también el estado REAL (fuente de verdad) con el estado completo recibido
      const fullRealState = myIndex === 0 ? payload.payload.gameStateP1 : payload.payload.gameStateP2;
      realGameStateRef.current = fullRealState;
      setGameState(gameStateForMe);
    }
  }, []);
  
  // Función compartida para inicializar partida completa (igual que START_GAME)
  const initializeFullGameState = useCallback((player1Name: string, player2Name: string) => {
    const deck1 = shuffleDeck(buildDeck());
    let p1 = createPlayer(0, player1Name, deck1);
    p1 = drawCards(p1, INITIAL_HAND_SIZE);
    
    const deck2 = shuffleDeck(buildDeck());
    let p2 = createPlayer(1, player2Name, deck2);
    p2 = drawCards(p2, INITIAL_HAND_SIZE);
    
    return {
      phase: 'playing',
      mode: 'online',
      currentPlayer: 0,
      turnCount: 0,
      stateVersion: 0,
      players: [p1, p2] as [any, any],
      selection: { kind: 'none' },
      log: ['¡La partida comienza!'],
      winner: null,
      isDraw: false,
      pendingTrap: null,
      pendingDice: null,
      lastCombat: null,
      passTarget: 0,
      diceResult: null,
    };
  }, []);
  
  // Crear sala - el host entra inmediatamente con estado inicial
  const createRoom = useCallback(async (playerName: string): Promise<string> => {
    setError(null);
    
    const myPlayerId = crypto.randomUUID();
    myPlayerIdRef.current = myPlayerId;
    
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // IMPORTANTE: Establecer waitingForOpponent INMEDIATAMENTE para que el modal aparezca
    setWaitingForOpponent(true);
    
    // Inicializar partida completa UNA SOLA VEZ cuando se crea la sala
    const fullGameState = initializeFullGameState(playerName, 'Esperando rival...');
    
    // Guardar estado REAL (sin filtrar) como fuente de verdad
    realGameStateRef.current = fullGameState;
    
    // Estado inicial para guardar en BD (con nombre placeholder para player2)
    const roomData = {
      id: roomCode,
      player1: { id: myPlayerId, name: playerName, connected: true },
      player2: { id: null, name: null, connected: false },
      game_state: fullGameState,
      current_turn: 'player1',
      status: 'waiting' as const,
      winner: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { error } = await supabase
      .from('game_rooms')
      .insert(roomData);
    
    if (error) {
      setWaitingForOpponent(false);
      setError(`Error creando sala: ${error.message}`);
      throw error;
    }
    
    // Suscribirse al canal de la sala
    const channel = supabase
      .channel(`game-room:${roomCode}`)
      .on('broadcast', { event: 'game-action' }, (payload) => {
        handleRemoteAction(payload.payload);
      })
      .on('broadcast', { event: 'game-sync' }, (payload) => {
        handleSync(payload.payload);
      })
      .on('broadcast', { event: 'player-joined' }, (payload) => {
        // Señal explícita del Jugador 2: actualizar estado y comenzar partida
        if (isHostRef.current && realGameStateRef.current) {
          const opponentName = payload.payload?.playerName || 'Jugador 2';
          const opponentId = payload.payload?.playerId;
          
          // Actualizar el estado REAL con el nombre real del jugador 2
          const updatedRealState = {
            ...realGameStateRef.current,
            players: [
              realGameStateRef.current.players[0],
              { ...realGameStateRef.current.players[1], name: opponentName }
            ]
          };
          
          // Actualizar referencia real
          realGameStateRef.current = updatedRealState;
          
          // Guardar estado REAL actualizado en BD
          supabase
            .from('game_rooms')
            .update({
              game_state: updatedRealState,
              player2: { id: opponentId, name: opponentName, connected: true },
              status: 'playing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', roomCode);
          
          // Aplicar localmente (filtrado para player1)
          setGameState(filterStateForPlayer(updatedRealState, 0));
          setWaitingForOpponent(false);
          setOpponentConnected(true);
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const otherPresence = newPresences.find((p: any) => p.user_id !== myPlayerIdRef.current);
        if (otherPresence) {
          setOpponentConnected(true);
          // Fallback: si el broadcast player-joined no llegó, Presence join también limpia la espera
          setWaitingForOpponent(false);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftPlayer = leftPresences.find((p: any) => p.user_id !== myPlayerIdRef.current);
        if (leftPlayer) {
          setOpponentConnected(false);
          // Solo el host debe volver a esperar rival; el guest no ve el modal
          if (isHostRef.current) {
            setWaitingForOpponent(true);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          presenceRef.current = channel;
          await channel.track({
            user_id: myPlayerId,
            online_at: new Date().toISOString(),
            role: 'player1',
            name: playerName,
          });
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Error de conexión con la sala');
        }
      });
    
    channelRef.current = channel;
    roomIdRef.current = roomCode;
    // Actualizar refs ANTES de suscribirse para que los callbacks tengan el valor correcto
    playerRoleRef.current = 'player1';
    isHostRef.current = true;
    setRoomId(roomCode);
    setPlayerRole('player1');
    setIsHost(true);
    // Host entra inmediatamente con el estado filtrado (esperando rival)
    setGameState(filterStateForPlayer(fullGameState, 0));
    setMode('online');
    gameInitializedRef.current = true;
    
    return roomCode;
  }, [handleRemoteAction, handleSync, broadcastSync, initializeFullGameState, filterStateForPlayer]);
  
  const joinRoom = useCallback(async (roomId: string, playerName: string): Promise<boolean> => {
    setError(null);
    
    const myPlayerId = crypto.randomUUID();
    myPlayerIdRef.current = myPlayerId;
    
    const upperRoomId = roomId.toUpperCase();
    
    // Verificar que la sala existe y obtener el estado de la partida YA INICIADO
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('id', upperRoomId)
      .single();
    
    if (roomError || !room) {
      setError('Sala no encontrada');
      return false;
    }
    
    if (room.player2.id) {
      setError('La sala ya está completa');
      return false;
    }
    
    const hostName = room.player1.name;
    const existingGameState = room.game_state;
    
    // Unirse como jugador 2
    const { error: updateError } = await supabase
      .from('game_rooms')
      .update({
        player2: { id: myPlayerId, name: playerName, connected: true },
        status: 'playing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', upperRoomId);
    
    if (updateError) {
      setError(`Error uniéndose: ${updateError.message}`);
      return false;
    }
    
    // Actualizar el estado con el nombre real del jugador 2
    const updatedGameState = {
      ...existingGameState,
      players: [
        existingGameState.players[0],
        { ...existingGameState.players[1], name: playerName }
      ]
    };
    
    // Guardar estado REAL como fuente de verdad
    realGameStateRef.current = updatedGameState;
    
    // Guardar estado actualizado en BD
    await supabase
      .from('game_rooms')
      .update({
        game_state: updatedGameState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upperRoomId);
    
    // Suscribirse al canal
    const channel = supabase
      .channel(`game-room:${upperRoomId}`)
      .on('broadcast', { event: 'game-action' }, (payload) => {
        handleRemoteAction(payload.payload);
      })
      .on('broadcast', { event: 'game-sync' }, (payload) => {
        handleSync(payload.payload);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const otherPresence = newPresences.find((p: any) => p.user_id !== myPlayerIdRef.current);
        if (otherPresence) {
          setOpponentConnected(true);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftPlayer = leftPresences.find((p: any) => p.user_id !== myPlayerIdRef.current);
        if (leftPlayer) {
          setOpponentConnected(false);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          presenceRef.current = channel;
          await channel.track({
            user_id: myPlayerId,
            online_at: new Date().toISOString(),
            role: 'player2',
            name: playerName,
          });
          // Notificar al host de que el jugador 2 se ha unido (broadcast explícito DESPUÉS de suscribirse)
          await channel.send({
            type: 'broadcast',
            event: 'player-joined',
            payload: { playerId: myPlayerId, playerName },
          });
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Error de conexión con la sala');
        }
      });
    
    channelRef.current = channel;
    roomIdRef.current = upperRoomId;
    // Actualizar refs ANTES de suscribirse para que los callbacks tengan el valor correcto
    playerRoleRef.current = 'player2';
    isHostRef.current = false;
    setRoomId(upperRoomId);
    setPlayerRole('player2');
    setIsHost(false);
    // Guest entra con el MISMO estado inicial filtrado para player2
    setGameState(filterStateForPlayer(updatedGameState, 1));
    setMode('online');
    setOpponentConnected(true);
    setWaitingForOpponent(false);
    
    return true;
  }, [handleRemoteAction, handleSync, filterStateForPlayer]);
  
  const leaveRoom = useCallback(async () => {
    if (channelRef.current) {
      if (presenceRef.current) {
        await presenceRef.current.untrack();
      }
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    if (roomIdRef.current && isHostRef.current) {
      await supabase.from('game_rooms').delete().eq('id', roomIdRef.current);
    } else if (roomIdRef.current) {
      await supabase
        .from('game_rooms')
        .update({
          player2: { id: null, name: null, connected: false },
          status: 'waiting',
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomIdRef.current);
    }
    
    channelRef.current = null;
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
  
  const dispatchAction = useCallback((action: any) => {
    if (!gameState) return;
    
    // No permitir acciones si se está esperando al rival
    if (waitingForOpponent) {
      console.warn('Esperando al rival para poder jugar');
      return;
    }
    
    const myIndex = playerRoleRef.current === 'player1' ? 0 : 1;
    // Usar siempre el estado más reciente vía ref para evitar stale closure
    const currentPlayer = gameStateRef.current?.currentPlayer ?? gameState.currentPlayer;
    if (currentPlayer !== myIndex) {
      console.warn('No es tu turno');
      return;
    }
    
    if (!isLegalAction(gameStateRef.current ?? gameState, myIndex, action)) {
      console.warn('Acción no legal:', action);
      return;
    }
    
    console.log('[ONLINE-TRACE] dispatchAction ENTER', {
      actionType: action?.type,
      currentPlayer: gameStateRef.current?.currentPlayer ?? gameState.currentPlayer,
      myIndex,
      isHost,
      playerRole: playerRoleRef.current,
    });
    
    // Usar estado REAL para el reducer (el filtrado rompe el reducer)
    const currentState = isHost ? realGameStateRef.current : (gameStateRef.current ?? gameState);
    
    // En modo online, el guest NO debe ejecutar el reducer localmente
    // Solo el host ejecuta el reducer; el guest valida y envía la acción al host
    if (isHost) {
      // Host: ejecuta reducer localmente
      const newState = reducer(currentState, action);
      
      console.log('[ONLINE-TRACE] LOCAL REDUCER RESULT', {
        actionType: action?.type,
        currentPlayer: newState.currentPlayer,
        turnCount: newState.turnCount,
        player1Field: newState.players[0].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
        player2Field: newState.players[1].field.map((f: any, i: number) => f ? {slot: i, cardId: f.card?.id, cardName: f.card?.name, position: f.position, faceDown: f.faceDown} : null),
      });
      
      // Incrementar stateVersion para cada acción aceptada
      newState.stateVersion = (newState.stateVersion ?? 0) + 1;
      
      // Filtrar para la vista del jugador actual
      const filteredState = filterStateForPlayer(newState, myIndex);
      setGameState(filteredState);
      console.log('[ONLINE-TRACE] LOCAL STATE UPDATED');
      
      // Actualizar estado real local (host es la autoridad)
      realGameStateRef.current = newState;
      
      // Broadcast sync para que el guest tenga el estado correcto
      broadcastSync(newState);
    } else {
      // Guest: NO ejecutar reducer localmente
      // Solo validar y enviar acción al host
      console.log('[ONLINE-TRACE] B dispatchAction → broadcastAction', action?.type);
      broadcastAction(action);
    }
  }, [playerRole, broadcastAction, broadcastSync, waitingForOpponent, filterStateForPlayer, isHost]);
  
  const sendRematch = useCallback(async () => {
    if (!roomIdRef.current) return;
    
    await supabase
      .channel(`game-room:${roomIdRef.current}`)
      .send({
        type: 'broadcast',
        event: 'rematch',
        payload: { playerId: myPlayerIdRef.current },
      });
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





