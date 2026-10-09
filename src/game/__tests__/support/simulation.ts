/**
 * F0 — RED DE SEGURIDAD: simulador determinista de partidas completas.
 * ============================================================================
 *
 * OBJETIVO
 * -------
 * Guardar una referencia FIABLE del comportamiento ACTUAL del motor, para poder
 * demostrar después de cualquier refactor que el juego juega exactamente igual.
 * No prueba «que el juego funciona»: prueba «que el juego juega IGUAL que antes».
 *
 * CÓMO LO CONSIGUE (sin duplicar ni una sola regla)
 * -------------------------------------------------
 * La ARMA de este arnés es que NO sabe qué acciones son legales. No reimplementa
 * la Regla 5, ni la 16, ni la 22, ni el límite de 3 cartas. Pregunta al propio
 * motor:
 *
 *     una acción es legal ⇔ el reducer la aplica y produce un CAMBIO REAL
 *
 * Para ello genera un «universo» de acciones candidatas por construcción
 * (todas las combinaciones de cartas de la mano con todas las posiciones, todos
 * los objetivos del campo, todos los dados…) y sondea una a una al `reducer`.
 * Las que el reducer rechaza se descartan; las que cambian el juego son legales.
 *
 * Esa es exactamente la definición que se pidió para `legalActions()` en F1:
 *     «si `legalActions()` devuelve `a`, el reducer puede ejecutarla».
 * Por eso este arnés sigue siendo una referencia ÚTIL después de F1: no comparte
 * ninguna lógica con `legalActions`, así que si ambos coinciden, coinciden de
 * verdad. Y si en el futuro divergen, el arnés lo delata.
 *
 * DETERMINISMO
 * ------------
 * El motor usa `Math.random` (barajado, dados, robo de la Mágica 2, identidad de
 * instancia). Aquí se sustituye por un PRNG CON SEMILLA durante la simulación, de
 * forma local a este fichero: **el motor no se toca**. Por eso la misma semilla
 * reproduce siempre la misma partida, y por eso el bucle de sondeos también es
 * reproducible (siempre se sondea el universo en el mismo orden).
 *
 * LO QUE ESTE ARNÉS NO PUEDE HACER (y por qué)
 * ---------------------------------------------
 * No hay CPU-contra-CPU real: `nextCpuAction` está cableada al asiento 1 y
 * parametrizarla por asiento es el trabajo de la FASE F5. Aquí el asiento 1 solo
 * usa la CPU de producto cuando se pide el modo `'cpu'`; en el modo `'harness'`
 * los DOS asientos los lleva la política aleatoria de este arnés. Esa
 * limitación está documentada a propósito: es el motivo por el que la F0 no toca
 * `cpu.ts`.
 */


import { reducer } from '../../useGame';
import { nextCpuAction } from '../../cpu';
import { MAX_HAND_SIZE, MAX_CARDS_PER_TURN } from '../../types';
import type {
  Action,
  Difficulty,
  FieldMonster,
  GameMode,
  GameState,
  PlayerState,
  Position,
} from '../../types';
import type { Card } from '../../cardData';

// ============================================================================
// 1. ALEATORIEDAD CON SEMILLA
// ============================================================================

/** PRNG determinista y rápido (mulberry32 de 32 bits). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ejecuta `fn` sustituyendo `Math.random` por un PRNG con semilla.
 * Restaura el original incluso si `fn` lanza.
 *
 * Es una técnica EXCLUSIVA de las pruebas: el motor sigue usando `Math.random`
 * tal cual. La Fase F2 (PRNG dentro del estado) es otra cosa y no está aquí.
 */
export function withSeededRandom<T>(seed: number, fn: (rand: () => number) => T): T {
  const mathRef = Math as { random: () => number };
  const original = mathRef.random;
  const rand = mulberry32(seed);
  mathRef.random = rand;
  try {
    return fn(rand);
  } finally {
    mathRef.random = original;
  }
}

// ============================================================================
// 2. ORACLE: «¿ha cambiado el juego de verdad?»
// ============================================================================

/**
 * Una acción NO cuenta como legal si el reducer solo ha añadido una línea al
 * registro, sin tocar nada que afecte al juego.
 *
 * Motivo: hay jugadas que el reducer «acepta» pero que no hacen nada (por
 * ejemplo activar una Mágica sin objetivo legal escribe un aviso y no la
 * consume). Si el arnés las tomara por legales, elegiría a veces jugadas vacías
 * y se quedaría en un bucle infinito. Distinguir «cambió el registro» de
 * «cambió la partida» es lo que mantiene la simulación siempre avanzada.
 */
export function changedTheGame(before: GameState, after: GameState): boolean {
  if (before === after) return false;
  if (before.players[0] !== after.players[0]) return true;
  if (before.players[1] !== after.players[1]) return true;
  if (before.phase !== after.phase) return true;
  if (before.currentPlayer !== after.currentPlayer) return true;
  if (before.turnCount !== after.turnCount) return true;
  if (before.winner !== after.winner) return true;
  if (before.isDraw !== after.isDraw) return true;
  if (before.diceResult !== after.diceResult) return true;
  // La selección y las preguntas pendientes se comparan por VALOR: el reducer
  // crea objetos nuevos incluso cuando el contenido es idéntico (por ejemplo,
  // al volver a pedir la Mágica 5 con la recuperación ya abierta). Comparar por
  // referencia daría falsos «cambios» y el arnés se quedaría en bucle.
  if (selectionValue(before) !== selectionValue(after)) return true;
  if (pendingTrapValue(before) !== pendingTrapValue(after)) return true;
  if (pendingDiceValue(before) !== pendingDiceValue(after)) return true;
  return false;
}

function selectionValue(state: GameState): string {
  const s = state.selection;
  switch (s.kind) {
    case 'none': return 'none';
    case 'place-trap': return `place-trap:${s.card.id}`;
    case 'place-magic': return `place-magic:${s.card.id}`;
    case 'magic-target-monster': return `magic-target-monster:${s.card.id}:${s.side}`;
    case 'attack': return `attack:${s.attackerUid}`;
    case 'direct-attack': return `direct-attack:${s.attackerUid}`;
    case 'attack-or-direct': return `attack-or-direct:${s.attackerUid}`;
    case 'choose-destroy-target': return `choose-destroy-target:${s.trapUid}`;
    case 'choose-destroy-associated-card': return `choose-destroy-associated-card:${s.trapUid}:${s.player}:${s.targetUid ?? '-'}`;
    case 'choose-trap-2-own': return `choose-trap-2-own:${s.trapUid}:${s.selectedUids.join('/')}`;
    case 'revive-choice': return `revive-choice:${s.card.id}`;
  }
}

function pendingTrapValue(state: GameState): string {
  const p = state.pendingTrap;
  if (!p) return '-';
  return `${p.attackerUid}>${p.defenderUid}:${p.trap.id}:${p.defenderPlayer}:${p.attackerPlayer}`;
}

function pendingDiceValue(state: GameState): string {
  const p = state.pendingDice;
  return p ? p.reason : '-';
}

// ============================================================================
// 3. UNIVERSO DE ACCIONES CANDIDATAS (sin ninguna regla dentro)
// ============================================================================

function monstersOf(player: PlayerState): FieldMonster[] {
  return player.field.filter((f): f is FieldMonster => f !== null);
}

const POSITIONS: readonly Position[] = ['attack', 'defense'];
const DICE_ROLLS = [1, 2, 3, 4, 5, 6];

/**
 * Todas las acciones que un jugador podría intentar en este estado, generadas por
 * construcción y SIN aplicar ninguna regla: es deliberadamente más amplio que
 * el conjunto legal. El filtrado es trabajo del reducer.
 *
 * Reproduce el camino de la INTERFAZ: cada jugada pasa por su paso de selección
 * (`SELECT_TRAP_PLACE` → `PLACE_TRAP_ON_MONSTER`, `SELECT_MAGIC` →
 * `PLACE_MAGIC_ON_MONSTER`, `START_ATTACK` → `DECLARE_ATTACK`). Existe un atajo
 * para saltarse el primer paso y que el reducer acepta, pero la interfaz no
 * ofrece; queda documentado en `KNOWN_DEFECTS.QUOTA_BYPASS` y hay un test
 * propio que demuestra el hueco. Esta red mide el juego real, no los atajos.
 */
export function actionUniverse(state: GameState, seat: 0 | 1): Action[] {
  const me = state.players[seat];
  const oppSeat: 0 | 1 = seat === 0 ? 1 : 0;
  const opp = state.players[oppSeat];
  const myField = monstersOf(me);
  const oppField = monstersOf(opp);
  const out: Action[] = [];

  // Carta que el juego tiene pendiente de colocar.
  const sel = state.selection;
  const pendingCard =
    sel.kind === 'place-trap' || sel.kind === 'place-magic' || sel.kind === 'magic-target-monster'
      ? sel.card
      : null;

  for (const card of me.hand) {
    if (card.type === 'monster') {
      for (const position of POSITIONS) {
        out.push({ type: 'SUMMON_MONSTER', card, position });
      }
      continue;
    }
    if (card.type === 'trap') {
      out.push({ type: 'SELECT_TRAP_PLACE', card });
      if (sel.kind === 'place-trap' && sel.card === card) {
        for (const fm of myField) out.push({ type: 'PLACE_TRAP_ON_MONSTER', card, fieldUid: fm.uid });
      }
      continue;
    }
    // Mágica.
    out.push({ type: 'SELECT_MAGIC', card });
    out.push({ type: 'REVIVE_CHOICE', card, choice: 'hand' });
    for (const position of POSITIONS) {
      out.push({ type: 'REVIVE_CHOICE', card, choice: 'field', position });
    }
    if (pendingCard === card) {
      for (const fm of myField) {
        out.push({ type: 'PLACE_MAGIC_ON_MONSTER', card, side: 'self', fieldUid: fm.uid });
      }
      for (const fm of oppField) {
        out.push({ type: 'PLACE_MAGIC_ON_MONSTER', card, side: 'enemy', fieldUid: fm.uid });
      }
    }
  }

  for (const fm of myField) {
    out.push({ type: 'START_ATTACK', attackerUid: fm.uid });
    out.push({ type: 'DIRECT_ATTACK', attackerUid: fm.uid });
    out.push({ type: 'CHANGE_POSITION', fieldUid: fm.uid });
    out.push({ type: 'DESTROY_MONSTER', fieldUid: fm.uid });
    out.push({ type: 'TRAP_2_SELECT_OWN', fieldUid: fm.uid });
    if (fm.trap) out.push({ type: 'DESTROY_ASSOCIATED_CARD', fieldUid: fm.uid, cardType: 'trap' });
    if (fm.magic) out.push({ type: 'DESTROY_ASSOCIATED_CARD', fieldUid: fm.uid, cardType: 'magic' });
    for (const target of oppField) {
      out.push({ type: 'DECLARE_ATTACK', attackerUid: fm.uid, defenderUid: target.uid });
    }
  }
  for (const fm of oppField) {
    if (fm.trap) out.push({ type: 'DESTROY_ASSOCIATED_CARD', fieldUid: fm.uid, cardType: 'trap' });
    if (fm.magic) out.push({ type: 'DESTROY_ASSOCIATED_CARD', fieldUid: fm.uid, cardType: 'magic' });
  }
  // Objetivo de la Trampa 9 sobre un monstruo RIVAL: el reducer lo rechaza (mira
  // solo el campo propio). Se incluye para MEDIR ese rechazo.
  for (const fm of oppField) {
    out.push({ type: 'DESTROY_MONSTER', fieldUid: fm.uid });
  }

  for (const roll of DICE_ROLLS) out.push({ type: 'ROLL_DICE', roll });
  out.push({ type: 'RESOLVE_TRAP', activate: true });
  out.push({ type: 'RESOLVE_TRAP', activate: false });
  out.push({ type: 'CONFIRM_PASS' });
  // Cancelar sin selección pendiente no significa nada: no se ofrece.
  if (sel.kind !== 'none') out.push({ type: 'CANCEL_SELECTION' });
  out.push({ type: 'END_TURN' });

  return out;
}

/**
 * Sondea el reducer y devuelve el conjunto REALMENTE legal de acciones.
 *
 * Es el mismo criterio que se le pedirá a `legalActions()` en F1, calculado aquí
 * de forma independiente y sin compartir código con ella.
 */
export function legalActionsByProbe(state: GameState, seat: 0 | 1): Action[] {
  const accepted: Action[] = [];
  for (const candidate of actionUniverse(state, seat)) {
    if (changedTheGame(state, reducer(state, candidate))) accepted.push(candidate);
  }
  return accepted;
}

/** Sondeos que el reducer ha rechazado, agrupados por tipo de acción. */
export function rejectedByProbe(state: GameState, seat: 0 | 1): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of actionUniverse(state, seat)) {
    if (!changedTheGame(state, reducer(state, candidate))) {
      counts.set(candidate.type, (counts.get(candidate.type) ?? 0) + 1);
    }
  }
  return counts;
}

// ============================================================================
// 4. INVARIANTES DEL ESTADO
// ============================================================================

/**
 * Comprobaciones que el juego debe cumplir SIEMPRE, paso a paso. No derivan de
 * ninguna regla nueva: son la lectura directa de los invariantes que el motor ya
 * respeta (mano de 9, campo de 6, cuota de 3, LP ≥ 0, conservación de cartas).
 *
 * Cada problema lleva su código al principio (`CÓDIGO: texto`) para que la
 * simulación pueda clasificarlos sin adivinar.
 */
export function checkInvariants(state: GameState, context: string): string[] {
  const problems: string[] = [];
  const push = (code: string, msg: string) => problems.push(`${context}: ${code}: ${msg}`);

  for (const p of state.players) {
    if (p.lp < 0) push('INVARIANT', `${p.name} tiene ${p.lp} PV (negativos)`);
    if (p.lp > 999) push('INVARIANT', `${p.name} tiene ${p.lp} PV (por encima del tope)`);
    if (p.hand.length > MAX_HAND_SIZE) push('INVARIANT', `${p.name} tiene ${p.hand.length} cartas en la mano (tope ${MAX_HAND_SIZE})`);
    if (p.cardsPlayedThisTurn < 0) push('INVARIANT', `${p.name} tiene cuota negativa`);
    if (p.cardsPlayedThisTurn > MAX_CARDS_PER_TURN) {
      push('QUOTA_EXCEEDED', `${p.name} ha jugado ${p.cardsPlayedThisTurn} cartas este turno (tope ${MAX_CARDS_PER_TURN})`);
    }
    if (p.field.length !== 6) push('INVARIANT', `${p.name} tiene ${p.field.length} huecos de campo (deben ser 6)`);
  }

  // Identidad de instancia: los uid del campo son únicos en los dos campos.
  const uids = new Set<string>();
  for (const p of state.players) {
    for (const fm of p.field) {
      if (!fm) continue;
      if (uids.has(fm.uid)) push('INVARIANT', `uid de campo duplicado: ${fm.uid}`);
      uids.add(fm.uid);
    }
  }

  // Fase y banderas coherentes entre sí.
  if (state.phase === 'game-over') {
    if (state.winner === null && !state.isDraw) push('INVARIANT', 'la partida terminó sin ganador ni empate');
  } else if (state.winner !== null || state.isDraw) {
    // Regla 27.1: en cuanto un jugador llega a 0 PV PIERDE INMEDIATAMENTE.
    push('WIN_NOT_APPLIED', `hay ganador (winner=${state.winner}, isDraw=${state.isDraw}) pero la fase sigue siendo '${state.phase}'`);
  }
  if ((state.phase === 'dice-roll') !== (state.pendingDice !== null)) {
    push('DICE_ORPHANED', `fase '${state.phase}' con un dado pendiente=${state.pendingDice !== null}`);
  }
  if (state.phase === 'trap-response' && state.pendingTrap === null) push('INVARIANT', 'fase trap-response sin Trampa pendiente');
  if (state.phase === 'start' && state.turnCount !== 0) push('INVARIANT', `fase 'start' con ${state.turnCount} turnos`);

  // La selección pendiente tiene que ser resoluble por el jugador en turno.
  const sel = state.selection;
  const me = state.players[state.currentPlayer];
  const owns = (card: Card) => me.hand.includes(card);
  switch (sel.kind) {
    case 'none':
      break;
    case 'place-trap':
    case 'place-magic':
    case 'magic-target-monster':
    case 'revive-choice':
      if (!owns(sel.card)) push('INVARIANT', `selección '${sel.kind}' con una carta que no está en la mano`);
      break;
    case 'attack':
    case 'attack-or-direct':
    case 'direct-attack':
      if (!monstersOf(me).some((f) => f.uid === sel.attackerUid)) push('INVARIANT', `selección '${sel.kind}' con un atacante que no está en el campo propio`);
      break;
    case 'choose-destroy-target':
      if (!monstersOf(me).some((f) => f.uid === sel.trapUid)) push('INVARIANT', 'selección choose-destroy-target sin el Monstruo de la Trampa 9 en el campo propio');
      break;
    case 'choose-trap-2-own':
      if (!monstersOf(me).some((f) => f.uid === sel.trapUid)) push('INVARIANT', 'selección choose-trap-2-own sin su Monstruo portador');
      if (sel.selectedUids.some((uid) => !monstersOf(me).some((f) => f.uid === uid))) push('INVARIANT', 'Trampa 2 mantiene seleccionado un Monstruo que ya no está en el campo');
      break;
    case 'choose-destroy-associated-card': {
      const chosenPlayer = state.players[sel.player];
      const carrier = chosenPlayer.field.find((fm) => fm?.uid === sel.trapUid);
      if (!carrier) push('INVARIANT', 'selección choose-destroy-associated-card sin Monstruo portador');
      break;
    }
  }

  if (state.turnCount < 0) push('INVARIANT', `turnCount negativo (${state.turnCount})`);
  return problems;
}

/**
 * Conservación de cartas: cada copia física (identificada por `instanceId`)
 * debe estar exactamente una vez en algún zona del juego. Detecta cartas
 * perdidas, duplicadas o teletransportadas.
 */
export function checkCardConservation(
  state: GameState,
  initialInstances: Set<string>,
  cardNameOf: Map<string, string>,
  context: string,
): string[] {
  const seen = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id === undefined) return;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  };
  for (const p of state.players) {
    for (const c of p.deck) bump(c.instanceId);
    for (const c of p.hand) bump(c.instanceId);
    for (const c of p.graveyard) bump(c.instanceId);
    for (const fm of p.field) {
      if (!fm) continue;
      bump(fm.card.instanceId);
      bump(fm.trap?.instanceId);
      bump(fm.magic?.instanceId);
    }
  }

  const label = (id: string) => cardNameOf.get(id) ?? 'desconocida';
  const problems: string[] = [];
  for (const id of initialInstances) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) problems.push(`${context}: la carta ${label(id)} aparece ${n} veces en el juego (debe aparecer exactamente 1)`);
  }
  for (const [id, n] of seen) {
    if (n !== 1) problems.push(`${context}: la carta ${label(id)} aparece ${n} veces y no estaba en el mazo inicial`);
  }
  return problems;
}

// ============================================================================
// 5. PARTIDA SIMULADA
// ============================================================================

export type EndReason = 'lp' | 'draw' | 'stalemate' | 'unfinished';

/**
 * Clases de hallazgo que la red de seguridad puede detectar.
 *
 * Un hallazgo NO es automáticamente un fallo de las pruebas: puede ser un defecto
 * PREEXISTENTE del motor que la red documenta y vigila. El test compara el
 * conjunto de hallazgos con la referencia `KNOWN_DEFECTS` del fichero de tests:
 * si aparece uno nuevo, o desaparece uno viejo, la prueba falla. Eso convierte
 * un defecto conocido en algo que no se puede arreglar ni olvidar en silencio.
 */
export type FindingCode =
  /** Invariante del estado roto (PV, tamaño de mano/campo, uid duplicado…). */
  | 'INVARIANT'
  /** Se ha superado la cuota de 3 cartas por turno (Regla 16). */
  | 'QUOTA_EXCEEDED'
  /** Una copia de carta ha desaparecido del juego o se ha duplicado. */
  | 'CARD_LOST'
  /** Hay un dado pendiente en una fase que no es la de tirar dados. */
  | 'DICE_ORPHANED'
  /** Hay un ganador registrado pero la partida no ha pasado a 'game-over'. */
  | 'WIN_NOT_APPLIED'
  /** El juego no avanza: demasiadas acciones dentro del mismo turno. */
  | 'LOOP'
  /** No hay ninguna acción aplicable para el jugador en turno. */
  | 'DEADLOCK'
  /** Una acción considerada legal no ha cambiado nada. */
  | 'NO_EFFECT'
  /** La CPU de producto ha propuesto una jugada que el reducer rechaza. */
  | 'CPU_REJECTED'
  /** La CPU de producto se atasca: repite la misma jugada rechazada. */
  | 'CPU_STUCK';

export interface Finding {
  code: FindingCode;
  detail: string;
  /** Cuántas veces se ha detectado este mismo problema a lo largo de la partida. */
  occurrences: number;
}

export interface GameResult {
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  endReason: EndReason;
  winner: 0 | 1 | null;
  isDraw: boolean;
  turns: number;
  steps: number;
  maxActionsInOneTurn: number;
  /** Acciones que la CPU de producto propuso y el reducer rechazó. */
  cpuRejections: number;
  /** Tipos de acción que la CPU propuso y el reducer rechazó. */
  cpuRejectedTypes: string[];
  /**
   * Acción que la CPU de producto ha propuesto de forma idéntica y consecutively
   * un número anómalo de veces: síntoma de bucle.
   */
  cpuLoopSuspected: string | null;
  /** Reparto de tipos de acción efectivamente aplicados. */
  actionCounts: Record<string, number>;
  /** Sondas de legalidad rechazadas por el reducer, por tipo de acción. */
  probeRejections: Record<string, number>;
  /** Incumplimientos detectados durante la partida. */
  findings: Finding[];
  traceHash: string;
}

const STALEMATE_MARK = 'Regla 27.2';

/** Cuántas acciones seguidas se considera un bucle (red de seguridad del driver). */
const LOOP_ALARM = 5;
/** Tope de acciones dentro de un mismo turno antes de dar la partida por colgada. */
const MAX_ACTIONS_PER_TURN = 400;

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Etiqueta estable para un `uid`: los uid se generan con `Math.random` y no son
 * estables entre partidas, así que la huella los sustituye por «jugador/hueco»
 * en el orden en que aparecen en el campo. Así la huella sí es comparable.
 */
function uidLabels(state: GameState): Map<string, string> {
  const labels = new Map<string, string>();
  for (const p of state.players) {
    p.field.forEach((fm, slot) => {
      if (fm) labels.set(fm.uid, `p${p.index}s${slot}`);
    });
  }
  return labels;
}

function fieldSignature(state: GameState): string {
  const parts: string[] = [];
  for (const p of state.players) {
    for (const fm of p.field) {
      if (!fm) {
        parts.push('.');
        continue;
      }
      parts.push(
        [
          fm.card.id,
          fm.position === 'attack' ? 'A' : 'D',
          fm.faceDown ? 'f' : 'v',
          fm.hasAttacked ? 'x' : '-',
          fm.hasChangedPosition ? 'c' : '-',
          fm.summonedThisTurn ? 'n' : '-',
          fm.pendingTurns,
          fm.pendingEffect ?? '-',
          fm.controlledBy ?? '-',
          fm.tempAtkModifier,
          fm.tempDefModifier,
          fm.diceProtection ? 'D' : '-',
          fm.trap?.id ?? '-',
          fm.magic?.id ?? '-',
        ].join(':'),
      );
    }
    parts.push('|');
  }
  return parts.join(',');
}

function zoneSignature(state: GameState): string {
  return state.players
    .map((p) => `L${p.lp} q${p.cardsPlayedThisTurn} h${p.hand.map((c) => c.id).join('/')} d${p.deck.length} g${p.graveyard.length}`)
    .join(' ');
}

function selectionSignature(state: GameState): string {
  const s = state.selection;
  const labels = uidLabels(state);
  const who = (uid: string) => labels.get(uid) ?? '?';
  switch (s.kind) {
    case 'none': return 'none';
    case 'place-trap': return `place-trap:${s.card.id}`;
    case 'place-magic': return `place-magic:${s.card.id}`;
    case 'magic-target-monster': return `magic-target-monster:${s.card.id}:${s.side}`;
    case 'attack': return `attack:${who(s.attackerUid)}`;
    case 'direct-attack': return `direct-attack:${who(s.attackerUid)}`;
    case 'attack-or-direct': return `attack-or-direct:${who(s.attackerUid)}`;
    case 'choose-destroy-target': return `choose-destroy-target:${who(s.trapUid)}`;
    case 'choose-destroy-associated-card': return `choose-destroy-associated-card:${who(s.trapUid)}:${s.player}:${s.targetUid ? who(s.targetUid) : '-'}`;
    case 'choose-trap-2-own': return `choose-trap-2-own:${who(s.trapUid)}:${s.selectedUids.map(who).join('/')}`;
    case 'revive-choice': return `revive-choice:${s.card.id}`;
  }
}

function describeAction(action: Action, state: GameState): string {
  const labels = uidLabels(state);
  const who = (uid: string) => labels.get(uid) ?? '?';
  const card = (c: Card) => c.id;
  switch (action.type) {
    case 'SUMMON_MONSTER': return `SUMMON_MONSTER:${card(action.card)}:${action.position}`;
    case 'SELECT_TRAP_PLACE': return `SELECT_TRAP_PLACE:${card(action.card)}`;
    case 'PLACE_TRAP_ON_MONSTER': return `PLACE_TRAP_ON_MONSTER:${card(action.card)}>${who(action.fieldUid)}`;
    case 'SELECT_MAGIC': return `SELECT_MAGIC:${card(action.card)}`;
    case 'PLACE_MAGIC_ON_MONSTER': return `PLACE_MAGIC_ON_MONSTER:${card(action.card)}:${action.side}>${who(action.fieldUid)}`;
    case 'MAGIC_TARGET_MONSTER': return `MAGIC_TARGET_MONSTER:${card(action.card)}:${action.side}>${who(action.fieldUid)}`;
    case 'MAGIC_INSTANT': return `MAGIC_INSTANT:${card(action.card)}`;
    case 'START_ATTACK': return `START_ATTACK:${who(action.attackerUid)}`;
    case 'DECLARE_ATTACK': return `DECLARE_ATTACK:${who(action.attackerUid)}>${who(action.defenderUid)}`;
    case 'DIRECT_ATTACK': return `DIRECT_ATTACK:${who(action.attackerUid)}`;
    case 'RESOLVE_TRAP': return `RESOLVE_TRAP:${action.activate}`;
    case 'CHANGE_POSITION': return `CHANGE_POSITION:${who(action.fieldUid)}`;
    case 'DESTROY_MONSTER': return `DESTROY_MONSTER:${who(action.fieldUid)}`;
    case 'REVIVE_CHOICE': return `REVIVE_CHOICE:${card(action.card)}:${action.choice}:${action.position ?? '-'}`;
    case 'ROLL_DICE': return `ROLL_DICE:${action.roll}`;
    default: return action.type;
  }
}

export interface SimulateOptions {
  seed: number;
  /** `harness` = ambos asientos los lleva la política de este arnés. `cpu` = el asiento 1 usa la CPU de producto. */
  driver: 'harness' | 'cpu';
  difficulty?: Difficulty;
  /** Cota dura de pasos, para que un fallo no deje el test colgado. */
  maxSteps?: number;
  /**
   * Costura para las pruebas: se invoca en cada paso con el estado y el conjunto
   * legal que el arnés dedujo DEL REDUCER. Sirve para contrastarlo con otra
   * fuente de legalidad sin que este fichero dependa de ella.
   */
  verificar?: (state: GameState, seat: 0 | 1, legalesPorSondeo: Action[]) => void;
}

/**
 * Juega UNA partida completa hasta que termina o hasta que se agota `maxSteps`.
 *
 * Política: elige AL AZAR entre las acciones que el reducer admite. El azar es
 * determinista (PRNG con semilla) y, sobre todo, es el mejorizador posible para
 * cubrir reglas: alcanza situaciones que ninguna estrategia humana recorrería.
 */
export function simulateGame(options: SimulateOptions): GameResult {
  const { seed, driver } = options;
  const difficulty = options.difficulty ?? 'normal';
  const maxSteps = options.maxSteps ?? 20000;

  return withSeededRandom(seed, (rand) => {
    const gameMode: GameMode = driver === 'cpu' ? 'cpu' : 'local';
    let state = reducer(
      { ...emptyState() },
      { type: 'START_GAME', mode: gameMode, difficulty },
    );

    const initialInstances = new Set<string>();
    const cardNameOf = new Map<string, string>();
    for (const p of state.players) {
      for (const c of [...p.deck, ...p.hand, ...p.graveyard]) {
        if (!c.instanceId) continue;
        initialInstances.add(c.instanceId);
        cardNameOf.set(c.instanceId, `${c.name} (${c.type})`);
      }
      for (const fm of p.field) {
        if (!fm?.card.instanceId) continue;
        initialInstances.add(fm.card.instanceId);
        cardNameOf.set(fm.card.instanceId, `${fm.card.name} (${fm.card.type})`);
      }
    }

    const actionCounts: Record<string, number> = {};
    const probeRejections: Record<string, number> = {};
    const cpuRejectedTypes: string[] = [];
    const trace: string[] = [];

    let cpuRejections = 0;
    let cpuLoopSuspected: string | null = null;
    let previousCpuAction: string | null = null;
    let previousCpuRepeats = 0;
    let steps = 0;
    let maxActionsInOneTurn = 0;
    let actionsThisTurn = 0;
    let previousTurn = state.turnCount;
    const findings: Finding[] = [];
    // Un mismo problema persiste durante toda la partida; se anota UNA vez con su
    // número de apariciones, para que el informe sea legible y comparable.
    const seenFindings = new Map<string, number>();
    const add = (code: FindingCode, detail: string) => {
      const signature = `${code}|${detail}`;
      const at = seenFindings.get(signature);
      if (at !== undefined) {
        findings[at] = { ...findings[at], occurrences: findings[at].occurrences + 1 };
        return;
      }
      seenFindings.set(signature, findings.length);
      findings.push({ code, detail, occurrences: 1 });
    };

    while (state.phase !== 'game-over' && steps < maxSteps) {
      steps++;

      // --- Detección de turno colgado (bucle sin avanzar de turno) ---
      if (state.turnCount === previousTurn) {
        actionsThisTurn++;
        if (actionsThisTurn > maxActionsInOneTurn) maxActionsInOneTurn = actionsThisTurn;
        if (actionsThisTurn > MAX_ACTIONS_PER_TURN) {
          add('LOOP', `${actionsThisTurn} acciones sin cambiar de turno (fase '${state.phase}', turno ${state.turnCount})`);
          break;
        }
      } else {
        previousTurn = state.turnCount;
        actionsThisTurn = 0;
      }

      const seat = state.currentPlayer;
      const useCpu = driver === 'cpu' && seat === 1;
      const legal = legalActionsByProbe(state, seat);
      if (legal.length === 0) {
        // No debería ocurrir: la interfaz siempre tiene alguna salida. Si ocurre,
        // es un defecto del motor (o del arnés) y hay que saberlo.
        add('DEADLOCK', `ninguna acción aplicable para el Jugador ${seat + 1} (fase '${state.phase}')`);
        break;
      }
      for (const [type, n] of rejectedByProbe(state, seat)) {
        probeRejections[type] = (probeRejections[type] ?? 0) + n;
      }
      options.verificar?.(state, seat, legal);

      let chosen: Action;
      if (useCpu) {
        const proposal = nextCpuAction(state);
        if (changedTheGame(state, reducer(state, proposal))) {
          chosen = proposal;
          previousCpuRepeats = 0;
          previousCpuAction = null;
        } else {
          // La CPU de producto ha propuesto algo que el reducer NO admite. Es un
          // hallazgo de la Fase F0, no un fallo del arnés: la CPU se atasca. En la
          // aplicación real solo la rescataría la red de seguridad de 60 acciones,
          // y esa salida tampoco se admite en las fases de Trampa ni de dados.
          // Aquí, para que la partida pueda continuar y seguir cubriendo reglas,
          // el arnés juega una jugada legal; el atasco queda registrado.
          cpuRejections++;
          const key = describeAction(proposal, state);
          cpuRejectedTypes.push(key);
          previousCpuRepeats = key === previousCpuAction ? previousCpuRepeats + 1 : 0;
          previousCpuAction = key;
          if (previousCpuRepeats === 0) {
            add('CPU_REJECTED', `la CPU propuso ${key} y el reducer la rechazó (fase '${state.phase}')`);
          }
          if (previousCpuRepeats + 1 >= LOOP_ALARM) {
            cpuLoopSuspected = `${key} (repetida ${previousCpuRepeats + 1} veces seguidas)`;
            add('CPU_STUCK', `la CPU repitió ${key} ${previousCpuRepeats + 1} veces sin avanzar (fase '${state.phase}')`);
          }
          chosen = legal[Math.floor(rand() * legal.length)];
        }
      } else {
        // Política del arnés: azar uniforme entre las acciones que el reducer admite.
        chosen = legal[Math.floor(rand() * legal.length)];
      }

      const before = state;
      const next = reducer(before, chosen);
      if (!changedTheGame(before, next)) {
        add('NO_EFFECT', `la acción ${describeAction(chosen, before)} no cambió nada pero fue elegida como legal`);
        break;
      }
      actionCounts[chosen.type] = (actionCounts[chosen.type] ?? 0) + 1;
      trace.push(
        [
          before.turnCount,
          before.phase,
          seat,
          describeAction(chosen, before),
          selectionSignature(before),
          fieldSignature(before),
          zoneSignature(before),
          selectionSignature(next),
          fieldSignature(next),
          zoneSignature(next),
        ].join('|'),
      );
      state = next;

      // Los hallazgos que NO impiden jugar (una carta perdida, un PV raro…) se
      // anotan y la partida CONTINÚA: interesa ver cuántas más cosas aparecen
      // después. Solo se corta la partida cuando el juego deja de avanzar.
      for (const problem of checkInvariants(state, `paso ${steps}`)) {
        const code = problem.split(': ')[1] as FindingCode;
        add(code, problem.replace(/^paso \d+: /, ''));
      }
      if (steps % 5 === 0) {
        for (const c of checkCardConservation(state, initialInstances, cardNameOf, `paso ${steps}`)) {
          add('CARD_LOST', c.replace(/^paso \d+: /, ''));
        }
      }
    }

    const lastLog = state.log[state.log.length - 1] ?? '';
    const endReason: EndReason =
      state.phase !== 'game-over'
        ? 'unfinished'
        : lastLog.includes(STALEMATE_MARK)
          ? 'stalemate'
          : state.isDraw
            ? 'draw'
            : 'lp';

    return {
      seed,
      mode: gameMode,
      difficulty,
      endReason,
      winner: state.winner,
      isDraw: state.isDraw,
      turns: state.turnCount,
      steps,
      maxActionsInOneTurn,
      cpuRejections,
      cpuRejectedTypes,
      cpuLoopSuspected,
      actionCounts,
      probeRejections,
      traceHash: fnv1a(trace.join('\n')),
      findings,
    };
  });
}

// ============================================================================
// 6. TORNEO
// ============================================================================

export interface TournamentReport {
  driver: 'harness' | 'cpu';
  games: number;
  seedBase: number;
  fingerprint: string;
  finished: number;
  unfinished: number;
  wins: [number, number];
  draws: number;
  endReasons: Record<EndReason, number>;
  totalSteps: number;
  maxStepsInOneGame: number;
  maxActionsInOneTurn: number;
  cpuRejections: number;
  cpuLoopSuspected: string | null;
  actionCounts: Record<string, number>;
  probeRejections: Record<string, number>;
  /** Hallazgos detectados en cualquier partida, con su clase. */
  findings: Array<Finding & { seed: number }>;
  /** Recuento por clase de hallazgo: lo que el test compara con la referencia. */
  findingCounts: Record<string, number>;
  /** Semillas en las que se ha detectado algún hallazgo de cada clase. */
  findingSeeds: Record<string, number[]>;
  perGameHashes: string[];
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * Juega `games` partidas con semillas consecutivas desde `seedBase` y resume el
 * resultado en una huella comparable entre ejecuciones.
 */
export function runTournament(options: {
  driver: 'harness' | 'cpu';
  games: number;
  seedBase?: number;
}): TournamentReport {
  const seedBase = options.seedBase ?? 1;
  const report: TournamentReport = {
    driver: options.driver,
    games: options.games,
    seedBase,
    fingerprint: '',
    finished: 0,
    unfinished: 0,
    wins: [0, 0],
    draws: 0,
    endReasons: { lp: 0, draw: 0, stalemate: 0, unfinished: 0 },
    totalSteps: 0,
    maxStepsInOneGame: 0,
    maxActionsInOneTurn: 0,
    cpuRejections: 0,
    cpuLoopSuspected: null,
    actionCounts: {},
    probeRejections: {},
    findings: [],
    findingCounts: {},
    findingSeeds: {},
    perGameHashes: [],
  };

  for (let i = 0; i < options.games; i++) {
    const seed = seedBase + i;
    const result = simulateGame({
      seed,
      driver: options.driver,
      difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
    });

    report.perGameHashes.push(result.traceHash);
    report.endReasons[result.endReason] += 1;
    if (result.endReason === 'unfinished') report.unfinished += 1;
    else report.finished += 1;
    if (result.isDraw) report.draws += 1;
    if (result.winner !== null) report.wins[result.winner] += 1;
    report.totalSteps += result.steps;
    report.maxStepsInOneGame = Math.max(report.maxStepsInOneGame, result.steps);
    report.maxActionsInOneTurn = Math.max(report.maxActionsInOneTurn, result.maxActionsInOneTurn);
    report.cpuRejections += result.cpuRejections;
    if (result.cpuLoopSuspected && report.cpuLoopSuspected === null) {
      report.cpuLoopSuspected = `${result.cpuLoopSuspected} (semilla ${seed})`;
    }
    for (const [k, v] of Object.entries(result.actionCounts)) {
      report.actionCounts[k] = (report.actionCounts[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(result.probeRejections)) {
      report.probeRejections[k] = (report.probeRejections[k] ?? 0) + v;
    }
    for (const finding of result.findings) {
      report.findings.push({ ...finding, seed });
      report.findingCounts[finding.code] =
        (report.findingCounts[finding.code] ?? 0) + finding.occurrences;
      const seeds = report.findingSeeds[finding.code] ?? (report.findingSeeds[finding.code] = []);
      if (!seeds.includes(seed)) seeds.push(seed);
    }
  }

  report.fingerprint = fnv1a(report.perGameHashes.join('\n'));
  return report;
}

// ============================================================================
// 7. UTILIDADES
// ============================================================================

function emptyState(): GameState {
  return {
    phase: 'start',
    mode: 'local',
    difficulty: 'normal',
    currentPlayer: 0,
    turnCount: 0,
    stateVersion: 0,
    players: [
      makeEmptyPlayer(0, 'Jugador 1'),
      makeEmptyPlayer(1, 'Jugador 2'),
    ],
    selection: { kind: 'none' },
    log: [],
    winner: null,
    isDraw: false,
    pendingTrap: null,
    pendingDice: null,
    lastCombat: null,
    passTarget: 0,
    diceResult: null,
  };
}

function makeEmptyPlayer(index: 0 | 1, name: string): PlayerState {
  return {
    index,
    name,
    lp: 100,
    deck: [],
    hand: [],
    field: [null, null, null, null, null, null],
    graveyard: [],
    cardsPlayedThisTurn: 0,
  };
}

/** Resumen legible para los informes de consola. */
export function formatReport(label: string, report: TournamentReport): string {
  const findings = Object.keys(report.findingCounts)
    .sort()
    .map((code) => `${code}=${report.findingCounts[code]}(semillas ${report.findingSeeds[code].join(',')})`)
    .join(' ');
  const lines = [
    `${label}: ${report.games} partidas · huella ${report.fingerprint}`,
    `  finales: LP=${report.endReasons.lp} empate=${report.endReasons.draw} bloqueo27.2=${report.endReasons.stalemate} sin terminar=${report.endReasons.unfinished}`,
    `  victorias: J1=${report.wins[0]} J2=${report.wins[1]} · pasos totales=${report.totalSteps} · máx acciones en un turno=${report.maxActionsInOneTurn}`,
    `  acciones aplicadas: ${Object.entries(report.actionCounts).sort().map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `  hallazgos: ${findings || 'ninguno'}`,
    `  rechazos de la CPU de producto: ${report.cpuRejections}${report.cpuLoopSuspected ? ` · bucle: ${report.cpuLoopSuspected}` : ''}`,
  ];
  return lines.join('\n');
}
