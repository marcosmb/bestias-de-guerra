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

export function canAttack(state: GameState): boolean {
  if (state.turnCount === 0 && state.currentPlayer === 0) return false;
  return true;
}

/**
 * Regla 27.2 — Determina si un jugador tiene alguna acción legal disponible.
 *
 * Se considera acción legal cualquier acción que el jugador podría realizar
 * en su turno según las reglas oficiales:
 *   - jugar una carta desde la mano (Monstruo, Trampa o Mágica);
 *   - atacar con un Monstruo en Ataque que aún no lo ha hecho;
 *   - cambiar la posición de un Monstruo que aún no lo ha hecho este turno.
 *
 * Esta función NO decide cuál es la mejor acción: solo indica si existe
 * al menos una. Nunca debe usarse para terminar la partida mientras devuelva true.
 */
export function hasAnyLegalAction(player: PlayerState, state: GameState): boolean {
  // 1) Jugar una carta desde la mano (límite de 3 cartas por turno — Regla 16)
  if (player.cardsPlayedThisTurn < 3) {
    const monsters = player.hand.filter((c) => c.type === 'monster');
    const traps = player.hand.filter((c) => c.type === 'trap');
    const magics = player.hand.filter((c) => c.type === 'magic');

    // Monstruo: necesita un espacio libre en el campo
    if (monsters.length > 0 && hasEmptySlot(player)) return true;

    // Trampa: necesita un monstruo propio sin Trampa y que no haya sido colocado este turno
    if (traps.length > 0) {
      const canPlaceTrap = player.field.some(
        (f) => f !== null && f.trap === null && !f.summonedThisTurn,
      );
      if (canPlaceTrap) return true;
    }

    // Mágica: necesita un objetivo válido o ser instantánea
    if (magics.length > 0) {
      const hasInstantMagic = magics.some((m) => m.placement === 'instant');
      if (hasInstantMagic) return true;

      // Mágicas de campo: necesitan un monstruo propio o rival sin Mágica
      const hasFieldMagic = magics.some((m) => m.placement === 'field');
      if (hasFieldMagic) {
        const hasOwnTarget = player.field.some((f) => f !== null && f.magic === null);
        const opp = state.players[player.index === 0 ? 1 : 0];
        const hasOppTarget = opp.field.some((f) => f !== null && f.magic === null);
        if (hasOwnTarget || hasOppTarget) return true;
      }
    }
  }

  // 2) Atacar (Regla 21): monstruo en Ataque que aún no ha atacado
  if (canAttack(state)) {
    const canAttackNow = player.field.some(
      (f) => f !== null && f.position === 'attack' && !f.hasAttacked,
    );
    if (canAttackNow) return true;
  }

  // 3) Cambiar posición (Regla 14): monstruo que aún no lo ha hecho este turno
  const canChangePosition = player.field.some(
    (f) => f !== null && !f.hasChangedPosition,
  );
  if (canChangePosition) return true;

  return false;
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
