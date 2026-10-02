import type { Card, MonsterCard, TrapCard, MagicCard } from './cardData';

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
export type Difficulty = 'easy' | 'normal' | 'hard';

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

export function createPlayer(index: 0 | 1, name: string, deck: Card[]): PlayerState {
  return {
    index,
    name,
    lp: 100,
    deck,
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

/**
 * Devuelve true si la Mágica indicada puede resolverse con un objetivo o
 * condición válida ahora (sin consumirla). Es la comprobación previa que
 * decide si una Mágica puede jugarse/activarse legalmente.
 */
export function canActivateMagic(player: PlayerState, state: GameState, magic: MagicCard): boolean {
  const opp = opponentOf(player, state);

  switch (magic.effect.kind) {
    case 'steal_hand_card': {
      // Mágica 2: solo se puede tomar una carta que no tengas ya en la mano.
      const canSteal = opp.hand.some((c) => !player.hand.some((h) => h.id === c.id));
      return player.hand.length < MAX_HAND_SIZE && canSteal;
    }
    case 'revive_monster': {
      const hasMonster = player.graveyard.some((c) => c.type === 'monster');
      if (!hasMonster) return false;
      // Para llevarla a la mano no puede producir un duplicado de lo que ya tienes.
      const canGoToHand =
        player.hand.length < MAX_HAND_SIZE &&
        player.graveyard.some((c) => c.type === 'monster' && !player.hand.some((h) => h.id === c.id));
      const canGoToField = hasEmptySlot(player);
      return canGoToHand || canGoToField;
    }
    case 'direct_attack':
      return player.field.some((f) => f !== null && f.position === 'attack' && !f.hasAttacked);
    case 'atk_boost':
    case 'def_reduce':
    case 'dice_protection':
      return (
        player.field.some((f) => f !== null && f.magic === null) ||
        opp.field.some((f) => f !== null && f.magic === null)
      );
    default:
      // hand_swap, destroy_all_field, switch_all_opp_position,
      // draw_cards, dice_damage, clean_opp_field: activables sin objetivo.
      return true;
  }
}

/**
 * Regla 27.2 — El único criterio de «acción legal» que puede terminar la
 * partida es poder jugar o activar una carta. Los ataques y los cambios de
 * posición NO cuentan: el bloqueo solo se produce cuando ningún jugador puede
 * jugar ni activar legalmente ninguna carta.
 */
export function hasPlayableCard(player: PlayerState, state: GameState): boolean {
  if (player.cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return false;

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
 * Regla 27.2 — Criterio oficial de «acción legal» para el fin de la partida.
 *
 * La partida solo puede terminar por bloqueo cuando ningún jugador puede
 * jugar ni activar legalmente ninguna CARTA. Los ataques y los cambios de
 * posición NO se consideran acciones legales a efectos del fin de partida.
 */
export function hasAnyLegalAction(player: PlayerState, state: GameState): boolean {
  return hasPlayableCard(player, state);
}

/**
 * Regla 27.2 — Determina si la partida debe finalizar porque ningún jugador
 * puede realizar acciones legales.
 *
 * Devuelve el ganador (0 o 1), o null si la partida debe continuar.
 * Si ambos tienen los mismos LP, el resultado es empate (winner = null pero
 * con flag de empate).
 */
export function checkStalemate(players: [PlayerState, PlayerState]): 0 | 1 | null {
  const [a, b] = players;
  if (a.lp > b.lp) return 0;
  if (b.lp > a.lp) return 1;
  return null; // empate
}
