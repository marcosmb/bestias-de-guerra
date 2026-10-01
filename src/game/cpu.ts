import type { Action, Difficulty, FieldMonster, GameState } from './types';
import { canAttack, getEffectiveAtk, getEffectiveDef } from './types';
import type { MagicCard, MonsterCard, TrapCard } from './cardData';

/** Límite oficial de cartas jugadas/activadas desde la mano por turno. */
const MAX_CARDS_PER_TURN = 3;

/**
 * Valor máximo de ATQ/DEF posible en el mazo (Monstruo 12).
 * Se usa para asumir el peor caso ante información oculta.
 */
const MAX_MONSTER_VALUE = 12;

/**
 * Información oculta (punto 12 del reglamento).
 *
 * Un monstruo rival en Defensa boca abajo NO es identificable por el rival:
 * no se conoce ni su nombre ni sus valores reales. Para no aprovechar
 * información que un jugador real no tendría, se asume el valor MÁXIMO
 * posible del mazo (peor caso para quien decide atacar).
 */
function isHiddenFromOpponent(fm: FieldMonster): boolean {
  return fm.position === 'defense' && fm.faceDown;
}

function opponentAssumedAtk(fm: FieldMonster): number {
  return isHiddenFromOpponent(fm) ? MAX_MONSTER_VALUE : getEffectiveAtk(fm);
}

function opponentAssumedDef(fm: FieldMonster): number {
  return isHiddenFromOpponent(fm) ? MAX_MONSTER_VALUE : getEffectiveDef(fm);
}

function monstersOf(player: { field: (FieldMonster | null)[] }): FieldMonster[] {
  return player.field.filter((slot): slot is FieldMonster => slot !== null);
}

/**
 * Devuelve los objetivos legales para un ataque, según la Regla 22.
 *
 * - 22.1 Si hay monstruos en Defensa → solo esos (obligatorio).
 * - 22.2 Si no hay en Defensa pero sí en Ataque → cualquier monstruo + ataque directo.
 * - 22.3 Si no hay monstruos → solo ataque directo.
 */
export function legalTargets(defenders: FieldMonster[]): FieldMonster[] {
  const inDefense = defenders.filter((f) => f.position === 'defense');
  if (inDefense.length > 0) return inDefense;
  return defenders.filter((f) => f.position === 'attack');
}

export function canDirectAttack(defenders: FieldMonster[]): boolean {
  return defenders.filter((f) => f.position === 'defense').length === 0;
}

/** Monstruos propios que pueden atacar (regla 21). */
function availableAttackers(cpu: { field: (FieldMonster | null)[] }): FieldMonster[] {
  return monstersOf(cpu).filter((f) => f.position === 'attack' && !f.hasAttacked);
}

/** ¿Es legal colocar una Trampa ahora? (regla 19: 1 Trampa por monstruo) */
function trapTargets(cpu: { field: (FieldMonster | null)[] }): FieldMonster[] {
  return monstersOf(cpu).filter((f) => f.trap === null);
}

/** Elige la posición de invocación según dificultad. */
function chooseSummonPosition(monster: MonsterCard, difficulty: Difficulty, humanDefenders: FieldMonster[]): 'attack' | 'defense' {
  if (difficulty === 'easy') return 'attack';

  if (difficulty === 'normal') {
    // Monstruos con ATQ >= 4 pueden atacar; el resto se protege.
    return monster.atk >= 4 ? 'attack' : 'defense';
  }

  // hard: valora el estado real del campo rival, sin usar información oculta.
  const pressure = humanDefenders.length;
  if (monster.atk >= 6) return 'attack';
  if (monster.atk <= 3 && pressure >= 3) return 'defense';
  return monster.atk >= monster.def ? 'attack' : 'defense';
}

/** Elige qué Monstruo invocar de la mano. */
function chooseSummonCandidate(hand: MonsterCard[], difficulty: Difficulty): MonsterCard | null {
  if (hand.length === 0) return null;
  if (difficulty === 'easy') return hand[0];
  return [...hand].sort((a, b) => b.atk - a.atk)[0];
}

/**
 * Magics that are resolved instantly by the reducer without needing a target.
 * These are always legal to play if the CPU still has cards this turn.
 */
const INSTANT_MAGIC_KINDS = new Set([
  'steal_hand_card',
  'hand_swap',
  'revive_monster',
  'destroy_all_field',
  'switch_all_opp_position',
  'draw_cards',
  'clean_opp_field',
  'dice_damage',
  'direct_attack',
]);

/** Magics que requieren elegir un monstruo propio. */
const SELF_TARGET_MAGIC_KINDS = new Set(['atk_boost', 'dice_protection']);

/** Magics que requieren elegir un monstruo rival (Mágica 8). */
const ENEMY_TARGET_MAGIC_KINDS = new Set(['def_reduce']);

function hasCardsLeft(cpu: { cardsPlayedThisTurn: number }): boolean {
  return cpu.cardsPlayedThisTurn < MAX_CARDS_PER_TURN;
}

/**
 * Completa una selección de Trampa o Mágica pendiente.
 * Devuelve null si no hay nada que completar.
 */
function completePendingSelection(state: GameState): Action | null {
  const cpu = state.players[1];
  const sel = state.selection;

  if (sel.kind === 'place-trap') {
    const targets = trapTargets(cpu);
    if (targets.length > 0) {
      return { type: 'PLACE_TRAP_ON_MONSTER', card: sel.card, fieldUid: targets[0].uid };
    }
    return { type: 'CANCEL_SELECTION' };
  }

  if (sel.kind === 'place-magic') {
    const effect = sel.card.effect;
    if (ENEMY_TARGET_MAGIC_KINDS.has(effect.kind)) {
      // Mágica 8: va sobre un monstruo rival (Regla 20).
      const opponents = monstersOf(state.players[0]);
      if (opponents.length > 0) {
        return { type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'enemy', fieldUid: opponents[0].uid };
      }
      return { type: 'CANCEL_SELECTION' };
    }
    // Magics over own monsters.
    const ownTargets = monstersOf(cpu).filter((f) => f.magic === null);
    if (ownTargets.length > 0) {
      // Mágica 4: +2 ATQ tiene más impacto sobre el ATQ más alto.
      const best = [...ownTargets].sort((a, b) => getEffectiveAtk(b) - getEffectiveAtk(a))[0];
      return { type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'self', fieldUid: best.uid };
    }
    return { type: 'CANCEL_SELECTION' };
  }

  return null;
}

/** Magics instantáneas que el CPU tiene sentido de usar ahora. */
function chooseInstantMagic(state: GameState): Action | null {
  const cpu = state.players[1];
  const human = state.players[0];
  const magics = cpu.hand.filter((c): c is MagicCard => c.type === 'magic');

  for (const magic of magics) {
    if (!INSTANT_MAGIC_KINDS.has(magic.effect.kind)) continue;

    switch (magic.effect.kind) {
      case 'direct_attack': {
        // Solo tiene sentido si hay un atacante disponible y no hay monstruos en Defensa.
        const defenders = monstersOf(human);
        if (!canDirectAttack(defenders)) break;
        const attacker = availableAttackers(cpu)
          .sort((a, b) => getEffectiveAtk(b) - getEffectiveAtk(a))[0];
        if (attacker) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'draw_cards': {
        // Robar solo aporta si no está al límite de mano.
        if (cpu.hand.length < 9) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'revive_monster': {
        const monstersInGraveyard = cpu.graveyard.filter((c) => c.type === 'monster');
        if (monstersInGraveyard.length === 0) break;
        const hasSpaceInField = cpu.field.some((f) => f === null);
        const hasSpaceInHand = cpu.hand.length < 9;
        if (hasSpaceInField || hasSpaceInHand) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'destroy_all_field': {
        // Solo si realmente hay cartas en el campo que destruir.
        if (monstersOf(cpu).length > 0 || monstersOf(human).length > 0) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'clean_opp_field': {
        if (monstersOf(human).length > 0) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'switch_all_opp_position': {
        if (monstersOf(human).length > 0) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'steal_hand_card': {
        if (human.hand.length > 0 && cpu.hand.length < 9) {
          return { type: 'SELECT_MAGIC', card: magic };
        }
        break;
      }
      case 'hand_swap':
      case 'dice_damage': {
        return { type: 'SELECT_MAGIC', card: magic };
      }
      default:
        break;
    }
  }

  return null;
}

/** Magics que requieren selección de objetivo propio o rival. */
function chooseTargetedMagic(state: GameState): Action | null {
  const cpu = state.players[1];
  const human = state.players[0];
  const magics = cpu.hand.filter((c): c is MagicCard => c.type === 'magic');

  for (const magic of magics) {
    const kind = magic.effect.kind;

    if (SELF_TARGET_MAGIC_KINDS.has(kind)) {
      const ownTargets = monstersOf(cpu).filter((f) => f.magic === null);
      if (ownTargets.length === 0) continue;
      // No tiene sentido colocar una Mágica sobre un monstruo que nunca atacará.
      if (!ownTargets.some((f) => f.position === 'attack')) continue;
      return { type: 'SELECT_MAGIC', card: magic };
    }

    if (ENEMY_TARGET_MAGIC_KINDS.has(kind)) {
      // Mágica 8 (-2 DEF): útil sobre un monstruo rival que vaya a atacar.
      const enemyAttackers = monstersOf(human).filter((f) => f.position === 'attack' && f.magic === null);
      if (enemyAttackers.length > 0) {
        return { type: 'SELECT_MAGIC', card: magic };
      }
      continue;
    }
  }

  return null;
}

/** Elige la Trampa que colocar, si hay alguna útil. */
function chooseTrapToPlace(state: GameState): Action | null {
  const cpu = state.players[1];
  if (trapTargets(cpu).length === 0) return null;
  const traps = cpu.hand.filter((c): c is TrapCard => c.type === 'trap');
  if (traps.length === 0) return null;
  // Easy is consistent: la primera Trampa de la mano.
  return { type: 'SELECT_TRAP_PLACE', card: traps[0] };
}

/**
 * Decide el siguiente ataque del CPU respetando la Regla 22.
 */
function chooseAttack(state: GameState): Action | null {
  const cpu = state.players[1];
  const human = state.players[0];
  if (!canAttack(state)) return null;

  const attackers = availableAttackers(cpu);
  if (attackers.length === 0) return null;

  const defenders = monstersOf(human);
  const targets = legalTargets(defenders);
  const directAllowed = canDirectAttack(defenders);

  for (const attacker of attackers) {
    const atk = getEffectiveAtk(attacker);

    // Sin monstruos rivales → ataque directo (Regla 22.3).
    if (defenders.length === 0) {
      return { type: 'DIRECT_ATTACK', attackerUid: attacker.uid };
    }

    // Prioriza destruir objetivos que puede batir realmente.
    const lethal = targets.find((t) => {
      const targetValue = t.position === 'attack' ? opponentAssumedAtk(t) : opponentAssumedDef(t);
      return targetValue < atk;
    });

    if (lethal) {
      return { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: lethal.uid };
    }

    // Regla 22.1: si hay monstruos en Defensa, atacar a esos es obligatorio.
    // Se elige al más débil (el más fácil de abatir).
    if (targets.some((t) => t.position === 'defense')) {
      if (state.difficulty === 'easy') {
        // easy no se sacrifica un monstruo sin ventaja clara.
        continue;
      }
      const weakest = [...targets].sort((a, b) => {
        const av = a.position === 'attack' ? opponentAssumedAtk(a) : opponentAssumedDef(a);
        const bv = b.position === 'attack' ? opponentAssumedAtk(b) : opponentAssumedDef(b);
        return av - bv;
      })[0];
      return { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: weakest.uid };
    }

    // Regla 22.2: sin monstruos en Defensa → puede atacar a un Ataque o hacer ataque directo.
    const beatable = targets.find((t) => opponentAssumedAtk(t) < atk);
    if (beatable) {
      return { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: beatable.uid };
    }

    // easy no hace ataques directos suicidas; hard/normal aprovechan el ATQ.
    if (directAllowed && state.difficulty !== 'easy') {
      return { type: 'DIRECT_ATTACK', attackerUid: attacker.uid };
    }
  }

  return null;
}

/**
 * Cambio de posición legal (regla 14: 1 vez por monstruo y turno,
 * no consume ninguna de las 3 cartas del turno).
 */
function choosePositionChange(state: GameState): Action | null {
  const cpu = state.players[1];
  if (state.difficulty === 'easy') return null;

  const candidates = monstersOf(cpu).filter((f) => !f.hasChangedPosition);

  // 1) Un monstruo que ya atacó pasa a Defensa para protegerse.
  const afterAttack = candidates.find((f) => f.position === 'attack' && f.hasAttacked);
  if (afterAttack) {
    return { type: 'CHANGE_POSITION', fieldUid: afterAttack.uid };
  }

  // 2) Un monstruo fuerte en Defensa pasa a Ataque para presionar.
  const defenders = candidates.filter((f) => f.position === 'defense');
  if (defenders.length > 0) {
    const best = [...defenders].sort((a, b) => getEffectiveDef(b) - getEffectiveDef(a))[0];
    if (getEffectiveDef(best) >= 6) {
      return { type: 'CHANGE_POSITION', fieldUid: best.uid };
    }
  }

  return null;
}

/**
 * Devuelve la siguiente acción del CPU.
 *
 * Garantiza siempre una salida segura: si no hay ninguna acción legal
 * disponible, devuelve END_TURN. Esto evita bucles y turnos congelados.
 */
export function nextCpuAction(state: GameState): Action {
  const cpu = state.players[1];
  const human = state.players[0];

  // 1) Si hay una selección pendiente, completarla primero.
  const pending = completePendingSelection(state);
  if (pending) return pending;

  // 2) Magias resolubles al instante.
  if (hasCardsLeft(cpu)) {
    const instantMagic = chooseInstantMagic(state);
    if (instantMagic) return instantMagic;
  }

  // 3) Magias que necesitan objetivo.
  if (hasCardsLeft(cpu)) {
    const targetedMagic = chooseTargetedMagic(state);
    if (targetedMagic) return targetedMagic;
  }

  // 4) Invocar Monstruos mientras queden espacios y cartas.
  if (hasCardsLeft(cpu) && cpu.field.some((slot) => slot === null)) {
    const monsters = cpu.hand.filter((c): c is MonsterCard => c.type === 'monster');
    const candidate = chooseSummonCandidate(monsters, state.difficulty);
    if (candidate) {
      const position = chooseSummonPosition(candidate, state.difficulty, monstersOf(human));
      return { type: 'SUMMON_MONSTER', card: candidate, position };
    }
  }

  // 5) Colocar Trampas sobre monstruos propios sin Trampa.
  if (hasCardsLeft(cpu)) {
    const trap = chooseTrapToPlace(state);
    if (trap) return trap;
  }

  // 6) Atacar.
  const attack = chooseAttack(state);
  if (attack) return attack;

  // 7) Cambios de posición legales.
  const positionChange = choosePositionChange(state);
  if (positionChange) return positionChange;

  // 8) Salida segura: finalizar el turno.
  return { type: 'END_TURN' };
}

/**
 * Retardo entre acciones del CPU.
 * Suficientemente pausado para ser legible, sin ralentizar la partida.
 */
export function cpuDelay(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 450 : difficulty === 'hard' ? 850 : 650;
}