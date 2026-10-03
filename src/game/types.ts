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
export type GameMode = 'local' | 'cpu';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export type SelectionMode =
  | { kind: 'none' }
  | { kind: 'place-trap'; card: TrapCard }
  | { kind: 'place-magic'; card: MagicCard }
  | { kind: 'magic-target-monster'; card: MagicCard; side: 'self' | 'enemy' }
  | { kind: 'attack'; attackerUid: string }
  | { kind: 'direct-attack'; attackerUid: string }
  | { kind: 'attack-or-direct'; attackerUid: string }
  | { kind: 'choose-destroy-target'; trapUid: string }
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
  | { type: 'DESTROY_MONSTER'; fieldUid: string }
  | { type: 'REVIVE_CHOICE'; card: MagicCard; choice: 'hand' | 'field'; position?: Position }
  | { type: 'RESTART' };

export interface CombatResult {
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerDamage: number;
  defenderDamage: number;
  log: string;
}

export interface GameState {
  phase: Phase;
  mode: GameMode;
  difficulty: Difficulty;
  currentPlayer: 0 | 1;
  turnCount: number;
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
      return player.field.some((f) => f !== null && f.position === 'attack' && !f.hasAttacked);
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
  if (magic.effect.kind === 'atk_boost' || magic.effect.kind === 'dice_protection') return 'self';
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
