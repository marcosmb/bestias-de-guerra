import type { Card, CardInstanceId, MonsterCard, TrapCard, MagicCard } from './cardData';

export type Position = 'attack' | 'defense';

export interface FieldMonster {
  uid: string;
  card: MonsterCard;
  position: Position;
  faceDown: boolean;
  trap: TrapCard | null;
  magic: MagicCard | null;
  hasAttacked: boolean;
  hasChangedPosition: boolean;
  /** true si el Monstruo fue colocado en el turno actual (Regla 19). */
  summonedThisTurn: boolean;
  pendingTurns: number;
  pendingEffect: 'death' | 'control' | 'three_turns' | null;
  controlledBy: 0 | 1 | null;
  tempAtkModifier: number;
  tempDefModifier: number;
  diceProtection: boolean;
  /** true cuando la Trampa asociada ya ha sido descubierta por el rival. */
  trapRevealed?: boolean;
}

export interface PlayerState {
  index: 0 | 1;
  name: string;
  lp: number;
  deck: Card[];
  hand: Card[];
  field: (FieldMonster | null)[];
  graveyard: Card[];
  cardsPlayedThisTurn: number;
}

export type Phase = 'start' | 'pass' | 'playing' | 'trap-response' | 'dice-roll' | 'game-over';
export type GameMode = 'local' | 'cpu' | 'online';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

/** Asiento que controla la CPU (siempre el 1 en el modo actual). */
export const CPU_SEAT: 0 | 1 = 1;

export type SelectionMode =
  | { kind: 'none' }
  | { kind: 'place-trap'; card: TrapCard }
  | { kind: 'place-magic'; card: MagicCard }
  | { kind: 'magic-target-monster'; card: MagicCard; side: 'self' | 'enemy' }
  | { kind: 'attack'; attackerUid: string }
  | { kind: 'direct-attack'; attackerUid: string }
  | { kind: 'attack-or-direct'; attackerUid: string }
  | { kind: 'choose-destroy-target'; trapUid: string }
  | { kind: 'choose-trap-2-own'; trapUid: string; selectedUids: string[] }
  | { kind: 'revive-choice'; card: MagicCard };

export interface PendingDice {
  reason: string;
  onRoll: (roll: number) => Action;
}

export type Action =
  | { type: 'START_GAME'; mode?: GameMode; difficulty?: Difficulty }
  | { type: 'CPU_PLAY' }
  | { type: 'CONFIRM_START' }
  | { type: 'CONFIRM_PASS' }
  | { type: 'SUMMON_MONSTER'; card: MonsterCard; position: Position }
  | { type: 'SELECT_TRAP_PLACE'; card: TrapCard }
  | { type: 'PLACE_TRAP_ON_MONSTER'; card: TrapCard; fieldUid: string }
  | { type: 'SELECT_MAGIC'; card: MagicCard }
  | { type: 'PLACE_MAGIC_ON_MONSTER'; card: MagicCard; side: 'self' | 'enemy'; fieldUid: string }
  | { type: 'MAGIC_TARGET_MONSTER'; card: MagicCard; side: 'self' | 'enemy'; fieldUid: string }
  | { type: 'MAGIC_INSTANT'; card: MagicCard }
  | { type: 'START_ATTACK'; attackerUid: string }
  | { type: 'DECLARE_ATTACK'; attackerUid: string; defenderUid: string }
  | { type: 'DIRECT_ATTACK'; attackerUid: string }
  | { type: 'RESOLVE_TRAP'; activate: boolean }
  | { type: 'CHANGE_POSITION'; fieldUid: string }
  | { type: 'END_TURN' }
  | { type: 'CANCEL_SELECTION' }
  | { type: 'ROLL_DICE'; roll: number }
  | { type: 'CLOSE_DICE_RESULT' }
  | { type: 'DESTROY_MONSTER'; fieldUid: string }
  | { type: 'TRAP_2_SELECT_OWN'; fieldUid: string }
  | { type: 'REVIVE_CHOICE'; card: MagicCard; choice: 'hand' | 'field'; position?: Position }
  | { type: 'RESTART' };

export interface CombatResult {
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerDamage: number;
  defenderDamage: number;
  log: string;
  /** Datos públicos necesarios para la animación visual del combate. */
  attackerUid?: string;
  defenderUid?: string;
  attackerPlayer?: 0 | 1;
  attackerCard?: MonsterCard;
  defenderCard?: MonsterCard;
}

export interface GameState {
  phase: Phase;
  mode: GameMode;
  difficulty: Difficulty;
  currentPlayer: 0 | 1;
  turnCount: number;
  stateVersion: number;
  players: [PlayerState, PlayerState];
  selection: SelectionMode;
  log: string[];
  winner: 0 | 1 | null;
  isDraw: boolean;
  pendingTrap: {
    attackerUid: string;
    defenderUid: string;
    trap: TrapCard;
    defenderPlayer: 0 | 1;
    attackerPlayer: 0 | 1;
    attackerCard: MonsterCard;
    defenderCard: MonsterCard;
    defenderPosition: Position;
  } | null;
  pendingDice: PendingDice | null;
  lastCombat: CombatResult | null;
  passTarget: 0 | 1;
  diceResult: number | null;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Identidad de instancia (unicidad garantizada dentro de la sesión).
 *
 * Un contador monotónico evita cualquier colisión: aunque `Math.random` repitiera
 * una secuencia (o un test lo determinara), el prefijo nunca se repite. El
 * `FieldMonster.uid` usa exactamente el mismo generador, de modo que el juego
 * tiene UN SOLO esquema de identidad de instancia.
 */
let instanceCounter = 0;

export function newInstanceId(): string {
  instanceCounter += 1;
  return `c${instanceCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Regla 6 — Sella una copia de carta con su PROPIETARIO y su IDENTIDAD DE
 * INSTANCIA.
 *
 * `owner` no se reescribe si ya estaba fijado: la propiedad NUNCA cambia.
 * `instanceId` es siempre nuevo: si el mismo objeto carta se pasa dos veces a
 * `createPlayer` son dos copias físicas distintas y necesitan dos identidades.
 */
export function bindCardInstance<T extends Card>(card: T, owner: 0 | 1): T {
  return { ...card, owner: card.owner ?? owner, instanceId: newInstanceId() };
}

/** Identidad de instancia de una carta, o `null` si no está sellada. */
export function instanceIdOf(card: Card): CardInstanceId | null {
  return card.instanceId ?? null;
}

/**
 * Llave estable para identificar una copia concreta dentro de una zona.
 *
 * En partida real SIEMPRE devuelve el `instanceId`, porque `createPlayer` sella
 * todas las cartas. El repliegue a `id` solo existe para cartas construidas a
 * mano en pruebas, donde no hay dos copias del mismo tipo en la misma zona.
 */
export function cardInstanceKey(card: Card): string {
  return card.instanceId ?? card.id;
}

/** Localiza la copia EXACTA de una carta dentro de una zona por su instancia. */
export function indexOfCardInstance(zone: Card[], card: Card): number {
  if (card.instanceId !== undefined) {
    return zone.findIndex((c) => c.instanceId === card.instanceId);
  }
  return zone.findIndex((c) => c.id === card.id);
}

export function createPlayer(index: 0 | 1, name: string, deck: Card[]): PlayerState {
  return {
    index,
    name,
    lp: 100,
    // Regla 6: cada carta nace siendo propiedad de quien recibió el mazo, y esa
    // propiedad no cambiará aunque la carta pase a la mano o al campo del rival.
    // Cada copia física recibe además una identidad de instancia única, que
    // viaja con ella durante toda la partida.
    deck: deck.map((c) => bindCardInstance(c, index)),
    hand: [],
    field: [null, null, null, null, null, null],
    graveyard: [],
    cardsPlayedThisTurn: 0,
  };
}

export const MAX_HAND_SIZE = 9;

export function drawCards(player: PlayerState, n: number): PlayerState {
  const count = Math.max(0, Math.min(n, player.deck.length, MAX_HAND_SIZE - player.hand.length));
  const drawn = player.deck.slice(0, count);
  const remaining = player.deck.slice(count);
  return {
    ...player,
    deck: remaining,
    hand: [...player.hand, ...drawn],
  };
}

export function getEffectiveAtk(fm: FieldMonster): number {
  return Math.max(0, fm.card.atk + fm.tempAtkModifier);
}

export function getEffectiveDef(fm: FieldMonster): number {
  return Math.max(0, fm.card.def + fm.tempDefModifier);
}

export function resolveCombat(attacker: FieldMonster, defender: FieldMonster): CombatResult {
  const atk = getEffectiveAtk(attacker);
  const defVal = defender.position === 'attack' ? getEffectiveAtk(defender) : getEffectiveDef(defender);

  if (defender.position === 'attack') {
    if (atk > defVal) {
      return { attackerDestroyed: false, defenderDestroyed: true, attackerDamage: 0, defenderDamage: atk - defVal, log: `${attacker.card.name} (${atk}) destruye a ${defender.card.name} (${defVal}). Rival pierde ${atk - defVal} PV.` };
    } else if (atk < defVal) {
      return { attackerDestroyed: true, defenderDestroyed: false, attackerDamage: defVal - atk, defenderDamage: 0, log: `${attacker.card.name} (${atk}) es destruido por ${defender.card.name} (${defVal}). Pierdes ${defVal - atk} PV.` };
    } else {
      return { attackerDestroyed: true, defenderDestroyed: true, attackerDamage: 0, defenderDamage: 0, log: `Ambos monstruos (${atk}) se destruyen mutuamente.` };
    }
  } else {
    if (atk > defVal) {
      return { attackerDestroyed: false, defenderDestroyed: true, attackerDamage: 0, defenderDamage: 0, log: `${attacker.card.name} (${atk} ATQ) destruye a ${defender.card.name} (${defVal} DEF).` };
    } else if (atk < defVal) {
      return { attackerDestroyed: false, defenderDestroyed: false, attackerDamage: defVal - atk, defenderDamage: 0, log: `${attacker.card.name} (${atk} ATQ) rebota contra ${defender.card.name} (${defVal} DEF). Pierdes ${defVal - atk} PV.` };
    } else {
      return { attackerDestroyed: false, defenderDestroyed: false, attackerDamage: 0, defenderDamage: 0, log: `Empate: ${atk} ATQ vs ${defVal} DEF. Sin daño.` };
    }
  }
}

export function hasEmptySlot(player: PlayerState): boolean {
  return player.field.some((s) => s === null);
}

export function getFirstEmptySlot(player: PlayerState): number {
  return player.field.findIndex((s) => s === null);
}

/**
 * Retira un monstruo del campo de un jugador SIN enviarlo al cementerio.
 * Usar para mover cartas entre campos (Trampa 7, Trampa 10).
 */
export function detachFieldMonster(player: PlayerState, uid: string): PlayerState {
  return { ...player, field: player.field.map((f) => (f?.uid === uid ? null : f)) };
}

/**
 * Coloca un FieldMonster en el primer espacio libre del campo de un jugador.
 * No verifica nada — el llamador debe comprobar hasEmptySlot antes.
 */
export function placeFieldMonster(player: PlayerState, fm: FieldMonster): PlayerState {
  const slot = getFirstEmptySlot(player);
  return { ...player, field: player.field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[] };
}

export function canAttack(state: GameState): boolean {
  if (state.turnCount === 0 && state.currentPlayer === 0) return false;
  return true;
}

/** Límite oficial de cartas jugadas o activadas desde la mano por turno. */
export const MAX_CARDS_PER_TURN = 3;

/**
 * Regla 19 (oficial) — "¿Puede colocarse esta Trampa bajo este Monstruo?"
 *
 * El reglamento establece: "Una Trampa puede colocarse sobre un monstruo propio
 * aunque ese monstruo haya sido invocado o colocado durante el mismo turno."
 *
 * Por tanto las únicas condiciones son:
 *   - que el destino sea un Monstruo propio (pertenece a `player.field`);
 *   - que no tenga ya una Trampa asociada (máximo 1 Trampa por Monstruo).
 *
 * `summonedThisTurn` NO interviene: invocar en el turno actual no impide
 * colocar una Trampa.
 */
export function canPlaceTrapOn(player: PlayerState, fieldUid: string): boolean {
  const fm = player.field.find((f) => f?.uid === fieldUid);
  if (!fm) return false;
  return fm.trap === null;
}

/** ¿Existe algún Monstruo propio que admita legalmente una Trampa? */
export function hasTrapTarget(player: PlayerState): boolean {
  return player.field.some((f) => f !== null && f.trap === null);
}

function opponentOf(player: PlayerState, state: GameState): PlayerState {
  return state.players[player.index === 0 ? 1 : 0];
}

// ============================================================================
// PROPIEDAD DE LAS CARTAS (Regla 6)
// ============================================================================

/** Propietario original de una carta, o `null` si no está marcada. */
export function ownerOf(card: Card): 0 | 1 | null {
  return card.owner ?? null;
}

/**
 * Pregunta si en esta zona hay MÁS DE UNA copia del mismo tipo de carta.
 *
 * Solo puede ocurrir legítimamente por la Mágica 2 (la copia del rival acaba en
 * mi mano). Dentro de un mismo mazo NUNCA hay dos cartas con el mismo `id`, así
 * que un duplicado en la mano siempre significa "una es mía y la otra no".
 * Los tests lo usan para dejar constancia de ese invariante.
 */
export function hasDuplicateIds(zone: Card[]): boolean {
  const vistos = new Set<string>();
  for (const c of zone) {
    if (vistos.has(c.id)) return true;
    vistos.add(c.id);
  }
  return false;
}

/**
 * Regla 6 — ¿Existe en esta zona una copia de `card` perteneciente al mismo
 * propietario?
 *
 * Es la comprobación que necesita la Mágica 5: recuperar del cementerio una
 * carta que ya está representada en la mano POR OTRA COPIA PROPIA introduciría
 * un duplicado propio. Si la copia que hay en la mano es del RIVAL (puede
 * ocurrir por la Mágica 2), no es una copia propia y no lo impide.
 */
export function hasOwnCopy(zone: Card[], card: Card): boolean {
  return zone.some((c) => c.id === card.id && ownerOf(c) === ownerOf(card));
}

// ============================================================================
// MÁGICAS: ¿SON LEGALMENTE UTILIZABLES?
// ============================================================================

/**
 * Devuelve true si la Mágica indicada puede activarse AHORA con un objetivo o
 * condición válida, sin consumirla.
 *
 * Regla 5 (oficial): «Como regla general, una Mágica asociada se coloca sobre
 * un Monstruo propio, salvo que su efecto indique expresamente otra cosa. **La
 * Mágica 8 es una excepción: se coloca sobre un Monstruo rival.**»
 *
 * Por tanto:
 *   - Mágicas 4 y 9 → solo objetivo PROPIO.
 *   - Mágica 8       → solo objetivo RIVAL.
 *
 * No existe ninguna regla general que prohíba cartas con el mismo `id` en una
 * mano (decisión del creador): la Mágica 2 puede robar la copia del rival.
 */
export function canActivateMagic(player: PlayerState, state: GameState, magic: MagicCard): boolean {
  const opp = opponentOf(player, state);

  switch (magic.effect.kind) {
    case 'steal_hand_card': {
      // Mágica 2: única condición oficial → el rival debe tener cartas.
      // Se permiten duplicados: la carta robada conserva a su propietario.
      return player.hand.length < MAX_HAND_SIZE && opp.hand.length > 0;
    }
    case 'revive_monster': {
      // Mágica 5: recuperar del cementerio PROPIO sin crear una segunda copia
      // propia. (Cementerio → Campo solo exige un espacio libre.)
      const propios = player.graveyard.filter((c) => c.type === 'monster');
      if (propios.length === 0) return false;
      const canGoToHand =
        player.hand.length < MAX_HAND_SIZE &&
        propios.some((c) => !hasOwnCopy(player.hand, c));
      const canGoToField = hasEmptySlot(player);
      return canGoToHand || canGoToField;
    }
    case 'direct_attack':
      return player.field.some((f) => f !== null && f.magic === null);
    case 'atk_boost':
    case 'dice_protection':
      // Regla 5: solo sobre un Monstruo PROPIO.
      return player.field.some((f) => f !== null && f.magic === null);
    case 'def_reduce':
      // Regla 5: la Mágica 8 es la excepción → solo sobre un Monstruo RIVAL.
      return opp.field.some((f) => f !== null && f.magic === null);
    default:
      // hand_swap, destroy_all_field, switch_all_opp_position,
      // draw_cards, dice_damage, clean_opp_field: activables sin objetivo.
      return true;
  }
}

/**
 * Lado exigido por una Mágica de campo, o `null` si no usa objetivo.
 * `self` = solo monstruos propios (Mágicas 4 y 9). `enemy` = solo rivales (Mágica 8).
 */
export function magicRequiredSide(magic: MagicCard): 'self' | 'enemy' | null {
  if (magic.effect.kind === 'atk_boost' || magic.effect.kind === 'dice_protection' || magic.effect.kind === 'direct_attack') return 'self';
  if (magic.effect.kind === 'def_reduce') return 'enemy';
  return null;
}

// ============================================================================
// REGLA 27.2 — ACCIONES LEGALES Y POSIBILIDAD DE CONTINUAR
// ============================================================================

/**
 * Regla 14 — ¿Tiene el jugador algún Monstruo que pueda cambiar de posición?
 * (1 vez por turno, no consume cuota).
 */
export function hasLegalPositionChange(player: PlayerState): boolean {
  return player.field.some((f) => f !== null && !f.hasChangedPosition);
}

/**
 * Reglas 21/22 — ¿Tiene el jugador algún Monstruo en Ataque que pueda atacar?
 *
 * `canAttack` aplica la Regla 17: el jugador que comienza no ataca en su
 * primer turno.
 */
export function hasLegalAttack(player: PlayerState, state: GameState): boolean {
  if (!canAttack(state)) return false;
  return player.field.some((f) => f !== null && f.position === 'attack' && !f.hasAttacked);
}

/**
 * Decisión del creador — `deck.length > 0 && hand.length < MAX_HAND_SIZE`.
 *
 * El robo es AUTOMÁTICO al comienzo del turno (Regla 15), por lo que NO es una
 * acción legal (no cuenta para el test A). Lo que demuestra es el test B: que
 * la partida PUEDE CONTINUAR, porque ese jugador recibirá cartas nuevas en su
 * siguiente turno (Regla 9.3).
 *
 * El tope de 9 cartas es lo que hace que un mazo no vacío pueda quedar
 * neutralizado: con la mano a 9/9 la Regla 9.3 dice «no roba».
 */
export function canReceiveNewCards(player: PlayerState): boolean {
  return player.deck.length > 0 && player.hand.length < MAX_HAND_SIZE;
}

/**
 * Test A — ¿Tiene el jugador alguna CARTA que pueda jugar o activar AHORA,
 * sea cual sea su cuota de turno?
 *
 * La cuota de 3 cartas (Regla 16) NO interviene: se reinicia en cada turno, así
 * que agotarla no bloquea la partida.
 */
export function hasLegalCardAction(player: PlayerState, state: GameState): boolean {
  for (const card of player.hand) {
    if (card.type === 'monster') {
      if (hasEmptySlot(player)) return true;
    } else if (card.type === 'trap') {
      if (hasTrapTarget(player)) return true;
    } else if (canActivateMagic(player, state, card)) {
      return true;
    }
  }
  return false;
}

/**
 * Regla 27.2 — ¿Puede el jugador hacer algo que cambie la partida, ahora o en
 * un turno posterior?
 *
 * A) ACCIÓN LEGAL DISPONIBLE (Regla 15): jugar Monstruo, colocar/activar
 *    Trampa, utilizar Mágica legalmente, atacar, cambiar posición.
 * B) POSIBILIDAD DE CONTINUAR: tener mazo y hueco en la mano garantiza cartas
 *    nuevas en el siguiente turno.
 */
export function hasPlayableCard(player: PlayerState, state: GameState): boolean {
  return (
    hasLegalCardAction(player, state) ||      // A) cartas
    hasLegalAttack(player, state) ||          // A) atacar (Regla 21)
    hasLegalPositionChange(player) ||         // A) cambiar posición (Regla 14)
    canReceiveNewCards(player)                // B) robo del siguiente turno
  );
}

/**
 * Regla 16 — ¿Puede el jugador jugar una carta AHORA MISMO en su turno?
 *
 * Aplica el límite de 3 cartas por turno. La interfaz la usa para no ofrecer
 * jugadas que el reducer rechazará. NO se usa para la Regla 27.2.
 */
export function canPlayCardNow(player: PlayerState, state: GameState): boolean {
  if (player.cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return false;
  return hasLegalCardAction(player, state);
}

/**
 * Regla 27.2 — Criterio oficial de «acción legal» para el fin de la partida.
 * Alias de `hasPlayableCard`, que ya incluye ataques, cambios de posición y la
 * posibilidad de continuar.
 */
export function hasAnyLegalAction(player: PlayerState, state: GameState): boolean {
  return hasPlayableCard(player, state);
}

/**
 * Regla 27.2 — La partida solo termina por bloqueo cuando NINGÚN jugador puede
 * actuar (test A) y ADEMÁS no existe vía reglamentaria de continuación (test B).
 */
export function isBlockedByStalemate(state: GameState): boolean {
  return !hasPlayableCard(state.players[0], state) && !hasPlayableCard(state.players[1], state);
}

/**
 * Regla 27.2 — Explica por qué un jugador NO puede continuar, para el registro
 * del juego y para el historial. Solo es informativo.
 */
export function describeBlock(player: PlayerState, state: GameState): string {
  if (hasPlayableCard(player, state)) return `${player.name}: puede continuar`;

  const reasons: string[] = [];
  if (!hasLegalCardAction(player, state)) reasons.push('sin carta jugable');
  if (!hasLegalAttack(player, state)) reasons.push('sin ataque disponible');
  if (!hasLegalPositionChange(player)) reasons.push('sin cambio de posición disponible');
  if (!canReceiveNewCards(player)) {
    reasons.push(
      player.deck.length === 0
        ? 'mazo vacío'
        : `mano a ${player.hand.length}/${MAX_HAND_SIZE} sin poder robar`,
    );
  }
  return `${player.name}: ${reasons.join(', ') || 'sin acciones'}`;
}

/**
 * Regla 27.2 — Determina el resultado por bloqueo comparando los LP.
 * Devuelve el ganador (0 o 1) o null si hay empate de LP.
 */
export function checkStalemate(players: [PlayerState, PlayerState]): 0 | 1 | null {
  const [a, b] = players;
  if (a.lp > b.lp) return 0;
  if (b.lp > a.lp) return 1;
  return null; // empate
}

// ============================================================================
// GENERADOR DE ACCIONES LEGALES (CPU / FUTURO SERVIDOR)
// ============================================================================

/**
 * Devuelve TODAS las acciones legales que puede ejecutar `player` en este estado.
 * Es la FUENTE ÚNICA de verdad para la legalidad (CPU, UI, futuro servidor).
 * 
 * Principio: si `legalActions()` devuelve una acción `a`, entonces el reducer
 * puede ejecutarla y cambiará el estado.
 */
export function legalActions(state: GameState, player: 0 | 1): Action[] {
  const me = state.players[player];
  const opp = state.players[player === 0 ? 1 : 0];
  const meField = me.field.filter((f): f is FieldMonster => f !== null);
  const oppField = state.players[player === 0 ? 1 : 0].field.filter((f: FieldMonster | null): f is FieldMonster => f !== null);
  const out: Action[] = [];

  if (state.phase === 'start' || state.phase === 'game-over') return [];
  if (state.phase === 'pass') return player === state.currentPlayer ? [{ type: 'CONFIRM_PASS' }] : [];
  if (state.phase === 'dice-roll') {
    if (state.pendingDice && player === state.currentPlayer) {
      return [1, 2, 3, 4, 5, 6].map((roll) => ({ type: 'ROLL_DICE', roll }));
    }
    return [];
  }
  if (state.phase === 'trap-response') {
    if (!state.pendingTrap || state.pendingTrap.defenderPlayer !== player) return [];
    return [
      { type: 'RESOLVE_TRAP', activate: true },
      { type: 'RESOLVE_TRAP', activate: false },
    ];
  }
  if (state.phase !== 'playing' || player !== state.currentPlayer) return [];

  // --- Selecciones pendientes ---
  const sel = state.selection;
  if (sel.kind !== 'none') {
    const completing: Action[] = [];
    switch (sel.kind) {
      case 'place-trap':
        for (const fm of state.players[player].field) {
          if (fm && fm.trap === null) completing.push({ type: 'PLACE_TRAP_ON_MONSTER', card: sel.card, fieldUid: fm.uid });
        }
        break;
      case 'place-magic':
      case 'magic-target-monster':
        if (magicRequiredSide(sel.card) === 'enemy') {
          for (const fm of state.players[player === 0 ? 1 : 0].field) {
            if (fm && fm.magic === null) completing.push({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'enemy', fieldUid: fm.uid });
          }
        } else {
          for (const fm of state.players[player].field) {
            if (fm && fm.magic === null) completing.push({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'self', fieldUid: fm.uid });
          }
        }
        break;
      case 'attack': {
        const attacker = state.players[player].field.find((f) => f?.uid === sel.attackerUid);
        if (attacker && attacker.position === 'attack' && !attacker.hasAttacked && canAttack(state)) {
          for (const target of state.players[player === 0 ? 1 : 0].field) {
            if (target && target.position === 'defense') {
              completing.push({ type: 'DECLARE_ATTACK', attackerUid: sel.attackerUid, defenderUid: target.uid });
            }
          }
        }
        break;
      }
      case 'attack-or-direct': {
        const attacker = state.players[player].field.find((f) => f?.uid === sel.attackerUid);
        if (attacker && attacker.position === 'attack' && !attacker.hasAttacked && canAttack(state)) {
          const opp = state.players[player === 0 ? 1 : 0];
          const hasDefense = opp.field.some((f) => f && f.position === 'defense');
          if (hasDefense) {
            for (const target of opp.field) {
              if (target && target.position === 'defense') {
                completing.push({ type: 'DECLARE_ATTACK', attackerUid: sel.attackerUid, defenderUid: target.uid });
              }
            }
          } else {
            for (const target of opp.field) {
              if (target && target.position === 'attack') {
                completing.push({ type: 'DECLARE_ATTACK', attackerUid: sel.attackerUid, defenderUid: target.uid });
              }
            }
            completing.push({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid });
          }
        }
        break;
      }
      case 'direct-attack': {
        const attacker = state.players[player].field.find((f) => f?.uid === sel.attackerUid);
        if (attacker && attacker.position === 'attack' && !attacker.hasAttacked && canAttack(state)) {
          const opp = state.players[player === 0 ? 1 : 0];
          if (!opp.field.some((f) => f && f.position === 'defense')) {
            completing.push({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid });
          }
        }
        break;
      }
      case 'choose-destroy-target': {
        for (const fm of state.players[player].field) {
          if (fm) completing.push({ type: 'DESTROY_MONSTER', fieldUid: fm.uid });
        }
        break;
      }
      case 'revive-choice': {
        const canGoToHand = state.players[player].hand.length < 9;
        const canGoToField = state.players[player].field.some((f) => f === null);
        if (canGoToHand) completing.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'hand' });
        if (canGoToField) {
          completing.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'attack' });
          completing.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'defense' });
        }
        break;
      }
    }
    completing.push({ type: 'CANCEL_SELECTION' });
    return completing;
  }

  // --- Jugadas libres (sin selección pendiente) ---
  const canPlayCard = me.cardsPlayedThisTurn < 3;

  if (canPlayCard) {
    for (const card of me.hand) {
      if (card.type === 'monster') {
        if (hasEmptySlot(state.players[player])) {
          out.push({ type: 'SUMMON_MONSTER', card, position: 'attack' });
          out.push({ type: 'SUMMON_MONSTER', card, position: 'defense' });
        }
      } else if (card.type === 'trap') {
        if (hasTrapTarget(state.players[player])) {
          out.push({ type: 'SELECT_TRAP_PLACE', card });
        }
      } else if (card.type === 'magic') {
        if (canActivateMagic(state.players[player], state, card)) {
          out.push({ type: 'SELECT_MAGIC', card });
        }
      }
    }
  }

  // Atacar
  if (canAttack(state)) {
    for (const fm of meField) {
      if (fm && fm.position === 'attack' && !fm.hasAttacked) {
        out.push({ type: 'START_ATTACK', attackerUid: fm.uid });
      }
    }
  }

  // Cambio de posición
  for (const fm of meField) {
    if (fm && !fm.hasChangedPosition) {
      out.push({ type: 'CHANGE_POSITION', fieldUid: fm.uid });
    }
  }

  // Cerrar turno
  out.push({ type: 'END_TURN' });

  return out;
}

/**
 * Verifica si una acción concreta es legal para `player` en este estado.
 * Útil para validar entradas externas (ej. servidor online).
 */
export function isLegalAction(state: GameState, player: 0 | 1, action: Action): boolean {
  return legalActions(state, player).some((a) => actionsEqual(a, action));
}

function actionsEqual(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'SUMMON_MONSTER': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card) && (a as any).position === (b as any).position;
    case 'SELECT_TRAP_PLACE': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card);
    case 'PLACE_TRAP_ON_MONSTER': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card) && (a as any).fieldUid === (b as any).fieldUid;
    case 'SELECT_MAGIC': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card);
    case 'PLACE_MAGIC_ON_MONSTER':
    case 'MAGIC_TARGET_MONSTER': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card) && (a as any).fieldUid === (b as any).fieldUid;
    case 'MAGIC_INSTANT': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card);
    case 'START_ATTACK': return (a as any).attackerUid === (b as any).attackerUid;
    case 'DECLARE_ATTACK': return (a as any).attackerUid === (b as any).attackerUid && (a as any).defenderUid === (b as any).defenderUid;
    case 'DIRECT_ATTACK': return (a as any).attackerUid === (b as any).attackerUid;
    case 'RESOLVE_TRAP': return (a as any).activate === (b as any).activate;
    case 'CHANGE_POSITION': return (a as any).fieldUid === (b as any).fieldUid;
    case 'DESTROY_MONSTER': return (a as any).fieldUid === (b as any).fieldUid;
    case 'ROLL_DICE': return (a as any).roll === (b as any).roll;
    case 'REVIVE_CHOICE': return cardInstanceKey((a as any).card) === cardInstanceKey((b as any).card) && (a as any).choice === (b as any).choice && (a as any).position === (b as any).position;
    case 'START_GAME': case 'CPU_PLAY': case 'CONFIRM_START': case 'CONFIRM_PASS': case 'END_TURN': case 'CANCEL_SELECTION': case 'RESTART':
      return true;
    default: return false;
  }
}

/**
 * Regla 22 — Un ataque a Monstruo puede elegir cualquier Monstruo rival,
 * tanto en Ataque como en Defensa.
 */
export function legalTargets(defenders: FieldMonster[]): FieldMonster[] {
  return defenders;
}

/**
 * El ataque directo mantiene su regla independiente: un Monstruo en Defensa
 * sigue impidiendo el ataque directo, salvo la excepción de la Mágica 1.
 */
export function canDirectAttack(defenders: FieldMonster[]): boolean {
  return defenders.every((f) => f.position !== 'defense');
}

/**
 * Devuelve los monstruos del campo de un jugador.
 */
export function monstersOf(player: PlayerState): FieldMonster[] {
  return player.field.filter((f): f is FieldMonster => f !== null);
}
