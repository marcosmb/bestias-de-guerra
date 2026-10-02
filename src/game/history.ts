/**
 * HISTORIAL DE LA ÚLTIMA PARTIDA
 * ============================================================================
 *
 * Capa de depuración INDEPENDIENTE de la lógica del juego.
 *
 * Este módulo NO modifica cartas, reglas, combate, CPU ni turnos. Solo observa
 * el estado `GameState` ANTES y DESPUÉS de cada acción que atraviesa el
 * reducer, y a partir de ese diff real construye el registro.
 *
 * Se apoya en que `reducer(state, action)` es una función pura: envolverla es
 * el único punto donde se ve exactamente lo que ocurrió, sin aproximar nada a
 * partir de la interfaz.
 *
 * Persistencia: `localStorage` (inyectable para poder testear sin DOM).
 * Solo se guarda la ÚLTIMA partida: `START_GAME` reemplaza el historial.
 */

import type { Action, FieldMonster, GameState, Phase } from './types';
import type { GameMode, Difficulty } from './types';
import { getEffectiveAtk, getEffectiveDef } from './types';

// ============================================================================
// 1. MODELO DE DATOS
// ============================================================================

export interface FieldSlotSnapshot {
  uid: string | null;
  cardId: string | null;
  cardName: string | null;
  position: string | null;
  faceDown: boolean;
  /** Valores base de la carta. */
  baseAtk: number | null;
  baseDef: number | null;
  /** Valores efectivos con los modificadores temporales aplicados. */
  effAtk: number | null;
  effDef: number | null;
  hasAttacked: boolean;
  hasChangedPosition: boolean;
  summonedThisTurn: boolean;
  trapId: string | null;
  trapName: string | null;
  magicId: string | null;
  magicName: string | null;
  diceProtection: boolean;
  controlledBy: 0 | 1 | null;
}

export interface PlayerSnapshot {
  name: string;
  lp: number;
  handCount: number;
  deckCount: number;
  graveyardCount: number;
  cardsPlayedThisTurn: number;
  handIds: string[];
  field: FieldSlotSnapshot[];
}

export interface StateSnapshot {
  turnCount: number;
  currentPlayer: 0 | 1;
  currentPlayerName: string;
  phase: Phase;
  winner: 0 | 1 | null;
  isDraw: boolean;
  players: [PlayerSnapshot, PlayerSnapshot];
}

/** Sucesos derivados del diff (daño, robo, cementerio, dados, control...). */
export interface HistoryEvent {
  type:
    | 'robo'
    | 'daño'
    | 'recuperación'
    | 'invocación'
    | 'destrucción'
    | 'movimiento'
    | 'cementerio'
    | 'recuperacion-carta'
    | 'cambio-control'
    | 'cambio-posicion'
    | 'ataque'
    | 'dado'
    | 'trampa'
    | 'magica'
    | 'seleccion'
    | 'turno'
    | 'fin'
    | 'rechazo';
  detail: string;
}

export interface HistoryEntry {
  index: number;
  turn: number;
  actorIndex: 0 | 1 | null;
  actorName: string | null;
  actionType: string;
  actionLabel: string;
  cardId: string | null;
  cardName: string | null;
  targetId: string | null;
  targetName: string | null;
  dice: number | null;
  /** false si el reducer rechazó la acción o no cambió nada significativo. */
  accepted: boolean;
  result: string;
  logDelta: string[];
  events: HistoryEvent[];
  before: StateSnapshot;
  after: StateSnapshot;
}

export type EndReason =
  | 'victoria-0-lp'
  | 'empate-0-0'
  | 'victoria-stalemate'
  | 'empate-stalemate'
  | 'otro';

export interface EndOfGameInfo {
  reason: EndReason;
  reasonLabel: string;
  /** Condición textual exacta que provocó el game-over. */
  condition: string;
  /** Regla del reglamento que se aplicó. */
  rule: string;
  winner: 0 | 1 | null;
  isDraw: boolean;
  phase: Phase;
  turn: number;
  currentPlayer: 0 | 1;
  currentPlayerName: string;
  playerNames: [string, string];
  lp: [number, number];
  decksLeft: [number, number];
  handsLeft: [number, number];
  fieldsCount: [number, number];
  lastAction: { actionType: string; actionLabel: string; actorName: string | null } | null;
  triggerAction: { actionType: string; actionLabel: string; actorName: string | null };
  /** Índice de la entrada del historial que provocó el final. */
  triggerIndex: number;
  snapshot: StateSnapshot;
}

export interface MatchHistory {
  version: number;
  savedAt: string;
  mode: GameMode;
  difficulty: Difficulty;
  finished: boolean;
  end: EndOfGameInfo | null;
  entries: HistoryEntry[];
}

export const HISTORY_VERSION = 1;
export const HISTORY_STORAGE_KEY = 'bdg:historial-ultima-partida:v1';

// ============================================================================
// 2. CAPA DE PERSISTENCIA (inyectable para poder testear sin DOM)
// ============================================================================

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Devuelve `localStorage` si está disponible y es escribible.
 * Devuelve null en entornos sin DOM (Node en tests, SSR, modo privado
 * bloqueado...). En ese caso el historial sigue funcionando en memoria.
 */
export function getDefaultStorage(): HistoryStorage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const ls = (globalThis as { localStorage?: HistoryStorage }).localStorage;
    if (!ls) return null;
    // Prueba de escritura: Safari en modo privado lanza aquí.
    const probe = '__bdg_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/**
 * Compacta un snapshot para serializarlo.
 *
 * Los 6 espacios de cada campo se guardan siempre, pero los vacíos se
 * escriben como `null` en lugar de como un objeto con 19 claves a `null`. Es
 * una reducción de ~4x del tamaño sin perder información: un espacio vacío no
 * tiene ningún dato que registrar.
 */
function compactSnapshot(s: StateSnapshot): unknown {
  return {
    turnCount: s.turnCount,
    currentPlayer: s.currentPlayer,
    currentPlayerName: s.currentPlayerName,
    phase: s.phase,
    winner: s.winner,
    isDraw: s.isDraw,
    players: s.players.map((p) => ({
      name: p.name,
      lp: p.lp,
      handCount: p.handCount,
      deckCount: p.deckCount,
      graveyardCount: p.graveyardCount,
      cardsPlayedThisTurn: p.cardsPlayedThisTurn,
      handIds: p.handIds,
      // `[null, {espacio ocupado}, null, ...]`: 6 posiciones siempre.
      field: p.field.map((f) => (f.cardId === null ? null : f)),
    })),
  };
}

function compactEntry(e: HistoryEntry): unknown {
  return {
    index: e.index,
    turn: e.turn,
    actorIndex: e.actorIndex,
    actorName: e.actorName,
    actionType: e.actionType,
    actionLabel: e.actionLabel,
    cardId: e.cardId,
    cardName: e.cardName,
    targetId: e.targetId,
    targetName: e.targetName,
    dice: e.dice,
    accepted: e.accepted,
    result: e.result,
    logDelta: e.logDelta,
    events: e.events,
    before: compactSnapshot(e.before),
    after: compactSnapshot(e.after),
  };
}

function compactEnd(end: EndOfGameInfo): unknown {
  return { ...end, snapshot: compactSnapshot(end.snapshot) };
}

function compactHistory(h: MatchHistory): unknown {
  return {
    version: h.version,
    savedAt: h.savedAt,
    mode: h.mode,
    difficulty: h.difficulty,
    finished: h.finished,
    end: h.end ? compactEnd(h.end) : null,
    entries: h.entries.map(compactEntry),
  };
}

/**
 * Serializa el historial a JSON compacto. Es el formato que se guarda en
 * `localStorage`, así que va sin sangrado para minimizar el tamaño.
 */
export function serializeHistory(history: MatchHistory): string {
  return JSON.stringify(compactHistory(history));
}

/** Igual que `serializeHistory`, pero indentado: es el que se descarga. */
export function serializeHistoryPretty(history: MatchHistory): string {
  return JSON.stringify(compactHistory(history), null, 2);
}

/**
 * Lee el historial del almacenamiento. Devuelve null si no hay o está corrupto.
 *
 * Normaliza lo que venga: los espacios vacíos se guardan compactados como
 * `null` y aquí se vuelven a expandir a objetos completos, de modo que el
 * historial en memoria siempre tiene los 6 espacios con todos sus campos y el
 * ciclo guardar → leer → guardar es idéntico.
 */
export function loadHistoryFrom(storage: HistoryStorage | null): MatchHistory | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatchHistory;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.entries)) return null;
    return {
      version: parsed.version ?? HISTORY_VERSION,
      savedAt: parsed.savedAt ?? new Date(0).toISOString(),
      mode: parsed.mode ?? 'local',
      difficulty: parsed.difficulty ?? 'normal',
      finished: Boolean(parsed.finished),
      end: parsed.end ? { ...parsed.end, snapshot: normalizeSnapshot(parsed.end.snapshot) } : null,
      entries: parsed.entries.map((e) => ({
        ...e,
        before: normalizeSnapshot(e.before),
        after: normalizeSnapshot(e.after),
      })),
    };
  } catch {
    return null;
  }
}

/** Reexpande los espacios compactados (`null`) a objetos completos. */
function normalizeSnapshot(s: StateSnapshot): StateSnapshot {
  const norm = (p: PlayerSnapshot): PlayerSnapshot => ({
    ...p,
    field: p.field.map((f) => (f === null ? { ...EMPTY_SLOT } : f)),
  });
  return {
    ...s,
    players: [norm(s.players[0]), norm(s.players[1])],
  };
}

/** Guarda el historial. Devuelve true si se pudo escribir. */
export function saveHistoryTo(storage: HistoryStorage | null, history: MatchHistory): boolean {
  if (!storage) return false;
  try {
    storage.setItem(HISTORY_STORAGE_KEY, serializeHistory(history));
    return true;
  } catch {
    // Cuota excedida o almacenamiento no disponible: el historial sigue en
    // memoria para poder consultarlo en la sesión, pero no se persiste.
    return false;
  }
}

export function clearStoredHistory(storage: HistoryStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    /* ignorado a propósito */
  }
}

// ============================================================================
// 3. CAPTURA DE ESTADO
// ============================================================================

const EMPTY_SLOT: FieldSlotSnapshot = {
  uid: null,
  cardId: null,
  cardName: null,
  position: null,
  faceDown: false,
  baseAtk: null,
  baseDef: null,
  effAtk: null,
  effDef: null,
  hasAttacked: false,
  hasChangedPosition: false,
  summonedThisTurn: false,
  trapId: null,
  trapName: null,
  magicId: null,
  magicName: null,
  diceProtection: false,
  controlledBy: null,
};

export function snapshotSlot(fm: FieldMonster | null): FieldSlotSnapshot {
  if (!fm) return { ...EMPTY_SLOT };
  return {
    uid: fm.uid,
    cardId: fm.card.id,
    cardName: fm.card.name,
    position: fm.position,
    faceDown: fm.faceDown,
    baseAtk: fm.card.atk,
    baseDef: fm.card.def,
    effAtk: getEffectiveAtk(fm),
    effDef: getEffectiveDef(fm),
    hasAttacked: fm.hasAttacked,
    hasChangedPosition: fm.hasChangedPosition,
    summonedThisTurn: fm.summonedThisTurn,
    trapId: fm.trap?.id ?? null,
    trapName: fm.trap?.name ?? null,
    magicId: fm.magic?.id ?? null,
    magicName: fm.magic?.name ?? null,
    diceProtection: fm.diceProtection,
    controlledBy: fm.controlledBy,
  };
}

export function snapshotPlayer(p: GameState['players'][number]): PlayerSnapshot {
  return {
    name: p.name,
    lp: p.lp,
    handCount: p.hand.length,
    deckCount: p.deck.length,
    graveyardCount: p.graveyard.length,
    cardsPlayedThisTurn: p.cardsPlayedThisTurn,
    handIds: p.hand.map((c) => c.id),
    field: p.field.map((f) => snapshotSlot(f)),
  };
}

export function snapshotState(state: GameState): StateSnapshot {
  return {
    turnCount: state.turnCount,
    currentPlayer: state.currentPlayer,
    currentPlayerName: state.players[state.currentPlayer].name,
    phase: state.phase,
    winner: state.winner,
    isDraw: state.isDraw,
    players: [snapshotPlayer(state.players[0]), snapshotPlayer(state.players[1])],
  };
}

/**
 * Compara el estado "significativo": ignora `log` y los identificadores
 * aleatorios de los monstruos (que cambian en cada render y no aportan nada).
 * Sirve para detectar acciones que el reducer rechazó.
 */
export function significantKey(s: StateSnapshot): string {
  const slotKey = (f: FieldSlotSnapshot) =>
    f.cardId === null
      ? '-'
      : [
          f.cardId,
          f.position,
          f.faceDown ? 1 : 0,
          f.effAtk,
          f.effDef,
          f.hasAttacked ? 1 : 0,
          f.hasChangedPosition ? 1 : 0,
          f.summonedThisTurn ? 1 : 0,
          f.trapId ?? '-',
          f.magicId ?? '-',
          f.diceProtection ? 1 : 0,
          f.controlledBy ?? '-',
        ].join('/');
  const playerKey = (p: PlayerSnapshot) =>
    [p.lp, p.handCount, p.deckCount, p.graveyardCount, p.cardsPlayedThisTurn, p.field.map(slotKey).join('|')].join(',');
  return [
    s.turnCount,
    s.currentPlayer,
    s.phase,
    String(s.winner),
    s.isDraw ? 1 : 0,
    playerKey(s.players[0]),
    playerKey(s.players[1]),
  ].join('#');
}

// ============================================================================
// 4. DESCRIPCIÓN DE LA ACCIÓN
// ============================================================================

export interface ActionDescription {
  label: string;
  actorIndex: 0 | 1 | null;
  cardId: string | null;
  cardName: string | null;
  targetId: string | null;
  targetName: string | null;
  dice: number | null;
}

/** Localiza un monstruo por uid en cualquier campo. */
function findMonster(state: GameState, uid?: string): { player: 0 | 1; fm: NonNullable<GameState['players'][0]['field'][0]> } | null {
  if (!uid) return null;
  for (const idx of [0, 1] as const) {
    const fm = state.players[idx].field.find((f) => f && f.uid === uid);
    if (fm) return { player: idx, fm };
  }
  return null;
}

/** Convierte una acción en una descripción legible. */
export function describeAction(state: GameState, action: Action): ActionDescription {
  const none: ActionDescription = {
    label: action.type,
    actorIndex: null,
    cardId: null,
    cardName: null,
    targetId: null,
    targetName: null,
    dice: null,
  };
  const actor = state.currentPlayer;
  const actorName = state.players[actor].name;

  switch (action.type) {
    case 'START_GAME':
      return { ...none, label: 'Inicio de partida' };

    case 'CONFIRM_START':
      return { ...none, actorIndex: state.passTarget, label: 'Confirmación del dispositivo (inicio)' };

    case 'CONFIRM_PASS':
      return { ...none, actorIndex: state.passTarget, label: `Confirmación del dispositivo → pasa a ${state.players[state.passTarget].name}` };

    case 'CPU_PLAY':
      return { ...none, actorIndex: 1, label: 'Turno de la CPU' };

    case 'END_TURN':
      return {
        ...none,
        actorIndex: actor,
        label: `Fin de turno de ${actorName}`,
      };

    case 'RESTART':
      return { ...none, label: 'Reinicio / vuelta al menú' };

    case 'SUMMON_MONSTER':
      return {
        ...none,
        actorIndex: actor,
        label: `Invoca ${action.card.name} en ${action.position === 'defense' ? 'Defensa' : 'Ataque'}`,
        cardId: action.card.id,
        cardName: action.card.name,
      };

    case 'SELECT_TRAP_PLACE':
      return {
        ...none,
        actorIndex: actor,
        label: `${actorName} prepara la Trampa ${action.card.name}`,
        cardId: action.card.id,
        cardName: action.card.name,
      };

    case 'PLACE_TRAP_ON_MONSTER': {
      const t = findMonster(state, action.fieldUid);
      return {
        ...none,
        actorIndex: actor,
        label: `Coloca la Trampa ${action.card.name} bajo ${t ? t.fm.card.name : 'monstruo desconocido'}`,
        cardId: action.card.id,
        cardName: action.card.name,
        targetId: t ? t.fm.card.id : action.fieldUid,
        targetName: t ? t.fm.card.name : null,
      };
    }

    case 'SELECT_MAGIC':
      return {
        ...none,
        actorIndex: actor,
        label: `${actorName} activa la Mágica ${action.card.name}`,
        cardId: action.card.id,
        cardName: action.card.name,
      };

    case 'PLACE_MAGIC_ON_MONSTER':
    case 'MAGIC_TARGET_MONSTER': {
      const t = findMonster(state, action.fieldUid);
      return {
        ...none,
        actorIndex: actor,
        label: `Coloca la Mágica ${action.card.name} sobre ${t ? t.fm.card.name : 'monstruo desconocido'}${action.side === 'enemy' ? ' (rival)' : ' (propio)'}`,
        cardId: action.card.id,
        cardName: action.card.name,
        targetId: t ? t.fm.card.id : action.fieldUid,
        targetName: t ? t.fm.card.name : null,
      };
    }

    case 'MAGIC_INSTANT':
      return {
        ...none,
        actorIndex: actor,
        label: `Resuelve la Mágica ${action.card.name}`,
        cardId: action.card.id,
        cardName: action.card.name,
      };

    case 'REVIVE_CHOICE': {
      return {
        ...none,
        actorIndex: actor,
        label: `Recupera ${action.card.name} del cementerio a ${action.choice === 'hand' ? 'la mano' : 'el campo'}`,
        cardId: action.card.id,
        cardName: action.card.name,
      };
    }

    case 'START_ATTACK': {
      const t = findMonster(state, action.attackerUid);
      return {
        ...none,
        actorIndex: actor,
        label: `${t ? t.fm.card.name : 'Monstruo'} inicia un ataque`,
        targetId: t ? t.fm.card.id : null,
        targetName: t ? t.fm.card.name : null,
      };
    }

    case 'DECLARE_ATTACK': {
      const a = findMonster(state, action.attackerUid);
      const d = findMonster(state, action.defenderUid);
      return {
        ...none,
        actorIndex: actor,
        label: `${a ? a.fm.card.name : 'Atacante'} (${a ? getEffectiveAtk(a.fm) : '?'} ATQ) ataca a ${d ? d.fm.card.name : 'defensor'}`,
        targetId: d ? d.fm.card.id : action.defenderUid,
        targetName: d ? d.fm.card.name : null,
      };
    }

    case 'DIRECT_ATTACK': {
      const a = findMonster(state, action.attackerUid);
      return {
        ...none,
        actorIndex: actor,
        label: `${a ? a.fm.card.name : 'Monstruo'} (${a ? getEffectiveAtk(a.fm) : '?'} ATQ) realiza ataque directo a ${state.players[actor === 0 ? 1 : 0].name}`,
        targetId: a ? a.fm.card.id : null,
        targetName: a ? a.fm.card.name : null,
      };
    }

    case 'RESOLVE_TRAP': {
      const pt = state.pendingTrap;
      return {
        ...none,
        actorIndex: actor,
        label: pt
          ? `${action.activate ? 'Activa' : 'No activa'} la Trampa ${pt.trap.name}`
          : `${action.activate ? 'Activa' : 'No activa'} la Trampa`,
        cardId: pt?.trap.id ?? null,
        cardName: pt?.trap.name ?? null,
        targetId: pt?.defenderCard.id ?? null,
        targetName: pt?.defenderCard.name ?? null,
      };
    }

    case 'CHANGE_POSITION': {
      const t = findMonster(state, action.fieldUid);
      return {
        ...none,
        actorIndex: actor,
        label: `Cambia de posición ${t ? t.fm.card.name : 'monstruo'}`,
        targetId: t ? t.fm.card.id : action.fieldUid,
        targetName: t ? t.fm.card.name : null,
      };
    }

    case 'ROLL_DICE':
      return {
        ...none,
        actorIndex: actor,
        label: `Tirada de dado: ${action.roll} (${state.pendingDice?.reason ?? 'sin motivo'})`,
        dice: action.roll,
      };

    case 'DESTROY_MONSTER': {
      const t = findMonster(state, action.fieldUid);
      return {
        ...none,
        actorIndex: actor,
        label: `Destruye ${t ? t.fm.card.name : 'monstruo'}`,
        targetId: t ? t.fm.card.id : action.fieldUid,
        targetName: t ? t.fm.card.name : null,
      };
    }

    case 'CANCEL_SELECTION':
      return { ...none, actorIndex: actor, label: 'Cancela la selección pendiente' };

    default:
      return none;
  }
}

// ============================================================================
// 5. DIFERENCIA DE ESTADOS → SUCESOS
// ============================================================================

function fieldCount(p: PlayerSnapshot): number {
  return p.field.filter((f) => f.cardId !== null).length;
}

/** Deriva los sucesos occurred entre dos snapshots. */
export function diffSnapshots(before: StateSnapshot, after: StateSnapshot): HistoryEvent[] {
  const ev: HistoryEvent[] = [];

  // --- Cambio de turno ---
  if (after.turnCount !== before.turnCount) {
    ev.push({ type: 'turno', detail: `Turno ${before.turnCount} → ${after.turnCount} (turno activo: ${after.currentPlayerName})` });
  }

  for (const idx of [0, 1] as const) {
    const b = before.players[idx];
    const a = after.players[idx];

    // --- Robo ---
    if (a.deckCount < b.deckCount) {
      const n = b.deckCount - a.deckCount;
      ev.push({ type: 'robo', detail: `${a.name} roba ${n} carta${n > 1 ? 's' : ''} (mazo ${b.deckCount} → ${a.deckCount})` });
    }

    // --- LP ---
    if (a.lp < b.lp) {
      ev.push({ type: 'daño', detail: `${a.name} pierde ${b.lp - a.lp} LP (${b.lp} → ${a.lp})` });
    } else if (a.lp > b.lp) {
      ev.push({ type: 'recuperación', detail: `${a.name} recupera ${a.lp - b.lp} LP (${b.lp} → ${a.lp})` });
    }

    // --- Cementerio ---
    if (a.graveyardCount > b.graveyardCount) {
      const nuevos = a.graveyardCount - b.graveyardCount;
      ev.push({ type: 'cementerio', detail: `${a.name}: ${nuevos} carta${nuevos > 1 ? 's' : ''} al cementerio (${b.graveyardCount} → ${a.graveyardCount})` });
    }

    // --- Campo, espacio a espacio ---
    for (let s = 0; s < 6; s++) {
      const fs = b.field[s];
      const gs = a.field[s];

      if (fs.cardId === null && gs.cardId !== null) {
        ev.push({
          type: 'invocación',
          detail: `${a.name}: ${gs.cardName} entra en el espacio ${s + 1} en ${gs.position === 'defense' ? 'Defensa' : 'Ataque'} (${gs.effAtk} ATQ / ${gs.effDef} DEF)`,
        });
      } else if (fs.cardId !== null && gs.cardId === null) {
        ev.push({
          type: 'movimiento',
          detail: `${a.name}: el espacio ${s + 1} queda vacío (antes ${fs.cardName})`,
        });
      } else if (fs.cardId !== null && gs.cardId !== null) {
        const cambios: string[] = [];
        if (fs.position !== gs.position) {
          cambios.push(`posición ${fs.position} → ${gs.position}`);
        }
        if (fs.effAtk !== gs.effAtk || fs.effDef !== gs.effDef) {
          cambios.push(`valores ${fs.effAtk}/${fs.effDef} → ${gs.effAtk}/${gs.effDef}`);
        }
        if (fs.trapId !== gs.trapId) {
          cambios.push(`trampa ${fs.trapName ?? '—'} → ${gs.trapName ?? '—'}`);
        }
        if (fs.magicId !== gs.magicId) {
          cambios.push(`mágica ${fs.magicName ?? '—'} → ${gs.magicName ?? '—'}`);
        }
        if (fs.controlledBy !== gs.controlledBy) {
          ev.push({
            type: 'cambio-control',
            detail: `${gs.cardName}: control ${fs.controlledBy === null ? 'propio' : `rival(${fs.controlledBy})`} → ${gs.controlledBy === null ? 'propio' : `rival(${gs.controlledBy})`}`,
          });
        }
        if (fs.faceDown !== gs.faceDown) {
          cambios.push(gs.faceDown ? 'boca abajo' : 'boca arriba');
        }
        if (cambios.length) {
          // Solo posición/boca abajo → cambio de posición. Con trampa, mágica o
          // valores → movimiento. Todo lo demás es efecto de combate.
          const soloPosicion = cambios.every((c) => c.startsWith('posición') || c === 'boca abajo' || c === 'boca arriba');
          const conAsociada = cambios.some((c) => c.startsWith('trampa') || c.startsWith('mágica'));
          ev.push({
            type: soloPosicion ? 'cambio-posicion' : conAsociada ? 'movimiento' : 'ataque',
            detail: `${a.name} espacio ${s + 1} · ${gs.cardName}: ${cambios.join('; ')}`,
          });
        }
      }
    }

    // --- Campo: balance ---
    const antes = fieldCount(b);
    const ahora = fieldCount(a);
    if (ahora !== antes && ev.every((e) => e.type !== 'invocación' && e.type !== 'movimiento')) {
      ev.push({ type: 'movimiento', detail: `${a.name}: monstruos en campo ${antes} → ${ahora}` });
    }
  }

  // --- Mano: balance ---
  for (const idx of [0, 1] as const) {
    const b = before.players[idx];
    const a = after.players[idx];
    if (a.handCount < b.handCount) {
      ev.push({ type: 'movimiento', detail: `${a.name}: cartas en mano ${b.handCount} → ${a.handCount}` });
    } else if (a.handCount > b.handCount) {
      ev.push({ type: 'recuperacion-carta', detail: `${a.name}: cartas en mano ${b.handCount} → ${a.handCount}` });
    }
  }

  return ev;
}

// ============================================================================
// 6. DETECCIÓN DEL FINAL DE PARTIDA
// ============================================================================

function countField(state: GameState, idx: 0 | 1): number {
  return state.players[idx].field.filter((f) => f !== null).length;
}

/**
 * Clasifica POR QUÉ terminó la partida. Usa el LP real, porque el reducer
 * evalúa la Regla 27.1 antes que la 27.2.
 */
export function detectEndOfGame(
  before: GameState,
  after: GameState,
  trigger: { actionType: string; actionLabel: string; actorName: string | null },
  triggerIndex: number,
  previousEntry: HistoryEntry | null,
): EndOfGameInfo | null {
  if (after.phase !== 'game-over') return null;
  if (before.phase === 'game-over') return null; // ya estaba terminada

  const [p0, p1] = after.players;
  const anyDead = p0.lp <= 0 || p1.lp <= 0;
  const bothDead = p0.lp <= 0 && p1.lp <= 0;

  let reason: EndReason;
  let reasonLabel: string;
  let condition: string;
  let rule: string;

  if (bothDead) {
    reason = 'empate-0-0';
    reasonLabel = 'EMPATE por 0/0 LP';
    condition = `Ambos jugadores llegaron a 0 LP en la misma resolución (J1 ${p0.lp} LP, J2 ${p1.lp} LP).`;
    rule = 'Regla 27.3';
  } else if (anyDead) {
    const winner = p0.lp > p1.lp ? 0 : 1;
    const loser = winner === 0 ? 1 : 0;
    reason = 'victoria-0-lp';
    reasonLabel = `VICTORIA de ${after.players[winner].name} por 0 LP`;
    condition = `${after.players[loser].name} tiene ${after.players[loser].lp} LP (<= 0).`;
    rule = 'Regla 27.1';
  } else if (after.isDraw) {
    reason = 'empate-stalemate';
    reasonLabel = 'EMPATE por STALEMATE';
    condition = `Ningún jugador puede realizar acciones legales y ambos tienen los mismos LP (J1 ${p0.lp}, J2 ${p1.lp}).`;
    rule = 'Regla 27.2';
  } else {
    reason = 'victoria-stalemate';
    reasonLabel = `VICTORIA de ${after.players[after.winner ?? 0].name} por STALEMATE`;
    condition = `Ningún jugador puede realizar acciones legales. Gana quien tiene más LP (J1 ${p0.lp}, J2 ${p1.lp}).`;
    rule = 'Regla 27.2';
  }

  return {
    reason,
    reasonLabel,
    condition,
    rule,
    winner: after.winner,
    isDraw: after.isDraw,
    phase: after.phase,
    turn: after.turnCount,
    currentPlayer: after.currentPlayer,
    currentPlayerName: after.players[after.currentPlayer].name,
    playerNames: [p0.name, p1.name],
    lp: [p0.lp, p1.lp],
    decksLeft: [p0.deck.length, p1.deck.length],
    handsLeft: [p0.hand.length, p1.hand.length],
    fieldsCount: [countField(after, 0), countField(after, 1)],
    // Entrada inmediatamente anterior a la que provocó el final: sirve para
    // distinguir "la última acción que se ejecutó" de "la que terminó la partida".
    lastAction: previousEntry
      ? { actionType: previousEntry.actionType, actionLabel: previousEntry.actionLabel, actorName: previousEntry.actorName }
      : null,
    triggerAction: { actionType: trigger.actionType, actionLabel: trigger.actionLabel, actorName: trigger.actorName },
    triggerIndex,
    snapshot: snapshotState(after),
  };
}

// ============================================================================
// 7. CONSTRUCCIÓN DE LA ENTRADA
// ============================================================================

export interface BuildEntryArgs {
  before: GameState;
  after: GameState;
  action: Action;
  index: number;
  accepted: boolean;
}

/** Traduce las líneas nuevas del registro del juego a texto legible. */
function resultFromLogDelta(logDelta: string[], accepted: boolean, actionType: string): string {
  if (logDelta.length) return logDelta.join(' ');
  if (accepted) return 'Sin efectos registrados.';
  if (actionType === 'END_TURN') return 'Turno finalizado (no hubo cambios).';
  if (actionType === 'CONFIRM_PASS' || actionType === 'CONFIRM_START') return 'Dispositivo confirmado.';
  return 'ACCIÓN RECHAZADA: el reducer no modificó el estado.';
}

export function buildEntry(args: BuildEntryArgs): HistoryEntry {
  const { before, after, action, index } = args;
  const accepted = args.accepted;
  const desc = describeAction(before, action);
  const beforeSnap = snapshotState(before);
  const afterSnap = snapshotState(after);

  const prevLog = before.log.length;
  const logDelta = after.log.slice(prevLog);

  const events = diffSnapshots(beforeSnap, afterSnap);
  if (accepted && events.length === 0) {
    events.push({ type: 'movimiento', detail: 'Acción aceptada sin cambios en el estado observable.' });
  }
  if (!accepted) {
    events.unshift({ type: 'rechazo', detail: `El reducer rechazó ${action.type} (estado sin cambios significativos).` });
  }

  return {
    index,
    turn: after.turnCount,
    actorIndex: desc.actorIndex,
    actorName: desc.actorIndex === null ? null : after.players[desc.actorIndex].name,
    actionType: action.type,
    actionLabel: desc.label,
    cardId: desc.cardId,
    cardName: desc.cardName,
    targetId: desc.targetId,
    targetName: desc.targetName,
    dice: desc.dice,
    accepted,
    result: resultFromLogDelta(logDelta, accepted, action.type),
    logDelta,
    events,
    before: beforeSnap,
    after: afterSnap,
  };
}

// ============================================================================
// 8. REDUCER CON HISTORIAL
// ============================================================================

export interface HistoryBundle {
  game: GameState;
  history: MatchHistory | null;
}

export function emptyHistory(): MatchHistory {
  return {
    version: HISTORY_VERSION,
    savedAt: new Date(0).toISOString(),
    mode: 'local',
    difficulty: 'normal',
    finished: false,
    end: null,
    entries: [],
  };
}

/**
 * Acciones que el jugador o la CPU intentan deliberadamente. Si una de ellas
 * no cambia nada es porque el reducer la rechazó, y eso es exactamente lo que
 * interesa depurar: se registra aunque no haya producido efecto.
 *
 * Se excluyen a propósito las acciones de navegación (RESTART, CONFIRM_PASS,
 * CANCEL_SELECTION) para no llenar el historial de ruido sin información.
 */
const DELIBERATE_ACTIONS = new Set<Action['type']>([
  'SUMMON_MONSTER',
  'SELECT_TRAP_PLACE',
  'PLACE_TRAP_ON_MONSTER',
  'SELECT_MAGIC',
  'PLACE_MAGIC_ON_MONSTER',
  'MAGIC_TARGET_MONSTER',
  'MAGIC_INSTANT',
  'REVIVE_CHOICE',
  'START_ATTACK',
  'DECLARE_ATTACK',
  'DIRECT_ATTACK',
  'RESOLVE_TRAP',
  'CHANGE_POSITION',
  'DESTROY_MONSTER',
]);

/**
 * Reducer de historial. Recibe el `reducer` real del juego y lo ENVUELVE.
 * No altera la lógica: solo observa el antes y el después.
 */
export function makeHistoryReducer(
  gameReducer: (state: GameState, action: Action) => GameState,
): (bundle: HistoryBundle, payload: { action: Action }) => HistoryBundle {
  return (bundle, payload) => {
    const { action } = payload;
    const before = bundle.game;
    const after = gameReducer(before, action);

    // ¿Ha cambiado algo observable, o ha cambiado el registro del juego?
    const changed = significantKey(snapshotState(before)) !== significantKey(snapshotState(after));
    const logChanged = after.log.length !== before.log.length;
    // Un intento deliberado que no cambia nada = acción rechazada: se registra.
    const rejected = !changed && DELIBERATE_ACTIONS.has(action.type);
    const informative = changed || logChanged || rejected || action.type === 'START_GAME';

    // ---- START_GAME reemplaza el historial anterior por el de la nueva ----
    if (action.type === 'START_GAME') {
      const base = emptyHistory();
      const entry = buildEntry({ before, after, action, index: 0, accepted: true });
      base.mode = after.mode;
      base.difficulty = after.difficulty;
      base.savedAt = new Date().toISOString();
      base.entries = [entry];
      return { game: after, history: base };
    }

    if (!informative && after.phase !== 'game-over') {
      return { game: after, history: bundle.history };
    }

    if (!bundle.history) {
      // Tras una recarga a mitad de partida no hay historial en memoria: se
      // empieza a registrar la parte visible de esta sesión.
      const base = emptyHistory();
      base.mode = after.mode;
      base.difficulty = after.difficulty;
      const entry = buildEntry({ before, after, action, index: 0, accepted: changed });
      base.entries = [entry];
      return { game: after, history: base };
    }

    const index = bundle.history.entries.length;
    const accepted = changed;
    const previousEntry = bundle.history.entries[index - 1] ?? null;
    const entry = buildEntry({ before, after, action, index, accepted });

    const entries = [...bundle.history.entries, entry];
    const end = detectEndOfGame(
      before,
      after,
      { actionType: entry.actionType, actionLabel: entry.actionLabel, actorName: entry.actorName },
      index,
      previousEntry,
    );

    return {
      game: after,
      history: {
        ...bundle.history,
        mode: after.mode,
        difficulty: after.difficulty,
        // `finished` describe la PARTIDA registrada, no la pantalla actual: un
        // RESTART (vuelta al menú) no puede deshacer el hecho de que terminó.
        finished: bundle.history.finished || after.phase === 'game-over',
        end: end ?? bundle.history.end,
        entries,
      },
    };
  };
}

// ============================================================================
// 9. FORMATO DE TEXTO (Copiar historial)
// ============================================================================

const LP_LABEL = (e: HistoryEntry) =>
  `LP: J1 ${e.before.players[0].lp} → ${e.after.players[0].lp} | J2 ${e.before.players[1].lp} → ${e.after.players[1].lp}`;
const HAND_LABEL = (e: HistoryEntry) =>
  `Mano: J1 ${e.before.players[0].handCount} → ${e.after.players[0].handCount} | J2 ${e.before.players[1].handCount} → ${e.after.players[1].handCount}`;
const DECK_LABEL = (e: HistoryEntry) =>
  `Mazo: J1 ${e.before.players[0].deckCount} → ${e.after.players[0].deckCount} | J2 ${e.before.players[1].deckCount} → ${e.after.players[1].deckCount}`;
const CEM_LABEL = (e: HistoryEntry) =>
  `Cementerio: J1 ${e.before.players[0].graveyardCount} → ${e.after.players[0].graveyardCount} | J2 ${e.before.players[1].graveyardCount} → ${e.after.players[1].graveyardCount}`;
const FIELD_LABEL = (e: HistoryEntry) =>
  `Campo: J1 ${e.before.players[0].field.filter((f) => f.cardId).length} → ${e.after.players[0].field.filter((f) => f.cardId).length} | J2 ${e.before.players[1].field.filter((f) => f.cardId).length} → ${e.after.players[1].field.filter((f) => f.cardId).length}`;
const QUOTA_LABEL = (e: HistoryEntry) =>
  `Cuota: J1 ${e.after.players[0].cardsPlayedThisTurn}/3 | J2 ${e.after.players[1].cardsPlayedThisTurn}/3`;

function fieldLines(s: StateSnapshot, idx: 0 | 1): string[] {
  const p = s.players[idx];
  return p.field.map((f, i) => {
    if (!f.cardId) return `    ${i + 1}: —`;
    return `    ${i + 1}: ${f.cardName} [${f.position === 'defense' ? 'DEF' : 'ATQ'}] ${f.effAtk}/${f.effDef} · trampa=${f.trapName ?? '—'} · mágica=${f.magicName ?? '—'} ·DV=${f.diceProtection ? 'sí' : 'no'} · control=${f.controlledBy === null ? 'propio' : `rival(${f.controlledBy})`}`;
  });
}

function entryToText(e: HistoryEntry): string {
  const lines: string[] = [];
  lines.push(`── #${e.index} · Turno ${e.turn} · ${e.actorName ?? '—'} ──`);
  lines.push(`Acción: ${e.actionLabel}  [${e.actionType}]${e.accepted ? '' : '  ⚠ RECHAZADA'}`);
  if (e.cardName) lines.push(`Carta: ${e.cardName} (${e.cardId})`);
  if (e.targetName) lines.push(`Objetivo: ${e.targetName} (${e.targetId})`);
  if (e.dice !== null) lines.push(`Dado: ${e.dice}`);
  lines.push(LP_LABEL(e));
  lines.push(HAND_LABEL(e));
  lines.push(DECK_LABEL(e));
  lines.push(CEM_LABEL(e));
  lines.push(FIELD_LABEL(e));
  lines.push(QUOTA_LABEL(e));
  lines.push(`Fase: ${e.before.phase} → ${e.after.phase} | Turno activo: ${e.before.currentPlayerName} → ${e.after.currentPlayerName}`);
  if (e.logDelta.length) {
    lines.push('Registro del juego:');
    for (const l of e.logDelta) lines.push(`  · ${l}`);
  }
  if (e.events.length) {
    lines.push('Sucesos:');
    for (const ev of e.events) lines.push(`  · [${ev.type}] ${ev.detail}`);
  }
  lines.push(`Resultado: ${e.result}`);
  return lines.join('\n');
}

export function historyToText(history: MatchHistory | null): string {
  if (!history || history.entries.length === 0) {
    return 'No hay ninguna partida registrada.';
  }
  const out: string[] = [];
  out.push('════════════════════════════════════════════════════════');
  out.push('HISTORIAL DE LA ÚLTIMA PARTIDA · Bestias de Guerra');
  out.push('════════════════════════════════════════════════════════');
  out.push(`Guardado: ${history.savedAt}`);
  out.push(`Modo: ${history.mode} · Dificultad: ${history.difficulty}`);
  out.push(`Movimientos registrados: ${history.entries.length}`);
  out.push(`Estado: ${history.finished ? 'FINALIZADA' : 'EN CURSO'}`);
  out.push('');

  if (history.end) {
    const e = history.end;
    out.push('╔══════════════════════════════════════════════════════════╗');
    out.push('║                  FIN DE PARTIDA                          ║');
    out.push('╚══════════════════════════════════════════════════════════╝');
    out.push(`Resultado: ${e.isDraw ? '¡EMPATE!' : `¡VICTORIA DE ${e.playerNames[e.winner ?? 0]}!`}`);
    out.push(`Motivo: ${e.reasonLabel}`);
    out.push(`Regla aplicada: ${e.rule}`);
    out.push(`Condición detectada: ${e.condition}`);
    out.push('');
    out.push(`LP:            J1 (${e.playerNames[0]}) = ${e.lp[0]} | J2 (${e.playerNames[1]}) = ${e.lp[1]}`);
    out.push(`Cartas en mazo: J1 = ${e.decksLeft[0]} | J2 = ${e.decksLeft[1]}`);
    out.push(`Cartas en mano: J1 = ${e.handsLeft[0]} | J2 = ${e.handsLeft[1]}`);
    out.push(`Monstruos campo: J1 = ${e.fieldsCount[0]} | J2 = ${e.fieldsCount[1]}`);
    out.push(`Turno: ${e.turn} | Jugador activo: ${e.currentPlayerName} | phase=${e.phase}`);
    out.push(`winner=${String(e.winner)} isDraw=${e.isDraw}`);
    out.push('');
    out.push(`Última acción registrada: ${e.lastAction ? `${e.lastAction.actionLabel} [${e.lastAction.actionType}] por ${e.lastAction.actorName ?? '—'}` : '—'}`);
    out.push(`Acción que provocó el final: ${e.triggerAction.actionLabel} [${e.triggerAction.actionType}] por ${e.triggerAction.actorName ?? '—'} (movimiento #${e.triggerIndex})`);
    out.push('');
    out.push('--- Estado final: campo de J1 ---');
    out.push(...fieldLines(e.snapshot, 0));
    out.push('--- Estado final: campo de J2 ---');
    out.push(...fieldLines(e.snapshot, 1));
    out.push('');
  }

  out.push('════════════════════════════════════════════════════════');
  out.push('MOVIMIENTOS');
  out.push('════════════════════════════════════════════════════════');
  for (const e of history.entries) {
    out.push(entryToText(e));
    out.push('');
  }
  return out.join('\n');
}

/** Nombre de fichero para la exportación. */
export function exportFileName(history: MatchHistory | null): string {
  const stamp = history?.savedAt ? history.savedAt.replace(/[:.]/g, '-') : 'sin-historial';
  return `bestias-de-guerra-historial-${stamp}.json`;
}