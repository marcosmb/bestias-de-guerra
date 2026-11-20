import { useCallback, useEffect, useReducer, useRef } from 'react';
import { nextCpuAction, cpuDelay } from './cpu';
import { legalActions } from './legalActions';
import {
  getDefaultStorage,
  loadHistoryFrom,
  makeHistoryReducer,
  saveHistoryTo,
  type HistoryBundle,
  type HistoryStorage,
  type MatchHistory,
} from './history';
import type { Action } from './types';
import { initialState, reducer } from './engine';
export { initialState, reducer } from './engine';
/**
 * Envoltura del reductor real del juego. Solo observa: el `GameState` que
 * devuelve es exactamente el que produciría `reducer`.
 */
const historyReducer = makeHistoryReducer(reducer);

/**
 * Arranque. NO restaura el estado de la partida desde el almacenamiento (eso
 * sería cambiar la lógica del juego): solo deja disponible el historial de la
 * última partida para poder consultarlo desde el menú.
 */
function initBundle(): HistoryBundle {
  return { game: initialState(), history: null };
}

export function useGame() {
  // ---------------------------------------------------------------------------
  // HISTORIAL DE LA ÚLTIMA PARTIDA (capa de depuración).
  //
  // `reducer` es una función pura `(state, action) => state`, así que el punto
  // único y fiel de intercepción es envolverla. El estado del juego y la
  // firma de `dispatch` no cambian: `App.tsx` y `GameBoard.tsx` siguen
  // recibiendo exactamente lo mismo.
  // ---------------------------------------------------------------------------
  const [bundle, dispatchBundle] = useReducer(historyReducer, undefined, initBundle);
  const state = bundle.game;

  // Persistencia con limiting: escribir en localStorage en cada movimiento
  // ralentizaría la partida. Se agrupa por tiempo y se fuerza el volcado en
  // los momentos críticos (fin de partida, recarga, salida de la página).
  const storageRef = useRef<HistoryStorage | null>(null);
  if (storageRef.current === null) storageRef.current = getDefaultStorage();
  const lastWriteRef = useRef(0);
  const lastPersistedRef = useRef<MatchHistory | null>(null);

  const persistNow = useCallback((h: MatchHistory) => {
    if (lastPersistedRef.current === h) return;
    saveHistoryTo(storageRef.current, h);
    lastPersistedRef.current = h;
    lastWriteRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!bundle.history) return;
    const h = bundle.history;
    if (h.finished) {
      persistNow(h);
      return;
    }
    if (Date.now() - lastWriteRef.current > 250) {
      persistNow(h);
    }
  }, [bundle.history, persistNow]);

  // Volcado inmediato al cerrar o recargar: garantiza que no se pierda lo que
  // ya se había escrito en el almacenamiento.
  useEffect(() => {
    const flush = () => {
      if (bundle.history) saveHistoryTo(storageRef.current, bundle.history);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [bundle.history]);

  const dispatch = useCallback((action: Action) => {
    dispatchBundle({ action });
  }, []);

  /** Historial guardado en el navegador de una partida anterior. */
  const readStoredHistory = useCallback((): MatchHistory | null => {
    return loadHistoryFrom(storageRef.current);
  }, []);

  const cpuTurnActionsRef = useRef(0);

  useEffect(() => {
    if (state.mode !== 'cpu' || state.currentPlayer !== 1) return;
    if (state.phase !== 'playing' && state.phase !== 'pass') return;

    // Si la CPU no tiene NINGUNA jugada legal en esta fase, no se invoca.
    //
    // Pasa, por ejemplo, cuando el ataque del rival abre la respuesta de una
    // Trampa que es de la CPU: quien debe decidir es el defensor, y aquí es el
    // jugador en turno. Antes la CPU proponía `END_TURN` igualmente, el reducer
    // lo rechazaba por la fase, el estado no cambiaba y el efecto se disparaba
    // otra vez en bucle. `legalActions` sabe a quién le toca en cada fase, así
    // que es también la respuesta a «¿le toca a la CPU?».
    if (legalActions(state, 1).length === 0) {
      cpuTurnActionsRef.current = 0;
      return;
    }

    // Red de seguridad: si el CPU encadena demasiadas acciones en un mismo turno,
    // se fuerza el cierre del turno para evitar bucles o turnos congelados.
    if (cpuTurnActionsRef.current > 60) {
      cpuTurnActionsRef.current = 0;
      dispatch({ type: 'END_TURN' });
      return;
    }
    cpuTurnActionsRef.current += 1;

    const timer = window.setTimeout(() => {
      if (state.phase === 'pass') {
        dispatch({ type: 'CONFIRM_PASS' });
        return;
      }
      dispatch(nextCpuAction(state));
    }, cpuDelay(state.difficulty));

    return () => window.clearTimeout(timer);
    // `dispatch` es estable (useCallback con dependencia []); se incluye solo
    // para satisfacer la regla de hooks exhaustivos.
  }, [state, dispatch]);

  // Reinicia el contador cuando el turno cambia de jugador.
  const previousPlayerRef = useRef(state.currentPlayer);
  useEffect(() => {
    if (previousPlayerRef.current !== state.currentPlayer) {
      previousPlayerRef.current = state.currentPlayer;
      cpuTurnActionsRef.current = 0;
    }
  }, [state.currentPlayer]);

  return {
    state,
    dispatch,
    /** Historial en memoria de la partida en curso (null si aún no hay ninguna). */
    liveHistory: bundle.history,
    /** Historial persistente de la última partida, para la pantalla del menú. */
    readStoredHistory,
  };
}

