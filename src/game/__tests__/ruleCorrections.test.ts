import { describe, expect, it } from 'vitest';
import { MAGICS, TRAPS, buildDeck } from '../cardData';
import { legalActions } from '../legalActions';
import { initialState, reducer } from '../useGame';
import type { FieldMonster, GameState, PlayerState } from '../types';
import type { Card, MonsterCard, TrapCard } from '../cardData';
import { createPlayer } from '../types';

const magic5 = MAGICS.find((card) => card.id === 'm5')!;
const trap5 = TRAPS.find((card) => card.id === 't5')!;
const trap7 = TRAPS.find((card) => card.id === 't7')!;

function monster(id: string, owner?: 0 | 1): MonsterCard {
  return { id, type: 'monster', suit: 'espadas', number: 4, name: id, atk: 4, def: 4, image: '', owner };
}

function fieldMonster(
  card: MonsterCard,
  uid: string,
  overrides: Partial<FieldMonster> = {},
): FieldMonster {
  return {
    uid,
    card,
    position: 'attack',
    faceDown: false,
    trap: null,
    magic: null,
    hasAttacked: false,
    hasChangedPosition: false,
    summonedThisTurn: false,
    pendingTurns: 0,
    pendingEffect: null,
    controlledBy: null,
    tempAtkModifier: 0,
    tempDefModifier: 0,
    diceProtection: false,
    ...overrides,
  };
}

function player(index: 0 | 1, overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...createPlayer(index, `P${index}`, buildDeck()), ...overrides };
}

function scene(options: {
  currentPlayer?: 0 | 1;
  turnCount?: number;
  me?: Partial<PlayerState>;
  opp?: Partial<PlayerState>;
} = {}): GameState {
  const base = initialState();
  return {
    ...base,
    phase: 'playing',
    currentPlayer: options.currentPlayer ?? 0,
    turnCount: options.turnCount ?? 2,
    players: [player(0, options.me), player(1, options.opp)],
    selection: { kind: 'none' },
    pendingTrap: null,
  };
}

function handRecoveryActions(state: GameState) {
  return legalActions(state, state.currentPlayer).filter(
    (action) => action.type === 'REVIVE_CHOICE' && action.choice === 'hand',
  );
}

function attackWithTrap(state: GameState, attackerUid: string, defenderUid: string): GameState {
  return reducer(state, { type: 'DECLARE_ATTACK', attackerUid, defenderUid });
}

describe('Mágica 5: recuperación a la mano sin límite de tamaño', () => {
  it.each([8, 9, 10, 11, 12])('ofrece y resuelve la recuperación con %i cartas', (handSize) => {
    const recovered = monster(`recovered-${handSize}`, 0);
    const hand = [magic5, ...Array.from({ length: handSize - 1 }, (_, i) => monster(`hand-${handSize}-${i}`, 0))] as Card[];
    const state = scene({ me: { hand, graveyard: [recovered] } });

    expect(legalActions(state, 0).some((action) => action.type === 'SELECT_MAGIC' && action.card === magic5)).toBe(true);

    const choosing = reducer(state, { type: 'SELECT_MAGIC', card: magic5 });
    expect(choosing.selection.kind).toBe('revive-choice');
    expect(handRecoveryActions(choosing)).toHaveLength(1);

    const after = reducer(choosing, { type: 'REVIVE_CHOICE', card: magic5, choice: 'hand' });
    expect(after.players[0].hand).toHaveLength(handSize);
    expect(after.players[0].hand).toContain(recovered);
    expect(after.players[0].hand).not.toContain(magic5);
    expect(after.players[0].graveyard).not.toContain(recovered);
    expect(after.selection.kind).toBe('none');
  });

  it('sigue rechazando la recuperación de una copia propia ya presente en la mano', () => {
    const ownCopyInHand = monster('same-monster', 0);
    const ownCopyInGraveyard = monster('same-monster', 0);
    const state = scene({
      me: { hand: [magic5, ownCopyInHand], graveyard: [ownCopyInGraveyard] },
    });
    const choosing = reducer(state, { type: 'SELECT_MAGIC', card: magic5 });
    expect(handRecoveryActions(choosing)).toHaveLength(0);
    expect(reducer(choosing, { type: 'REVIVE_CHOICE', card: magic5, choice: 'hand' })).toBe(choosing);
  });
});

describe('Trampa 7: intercambio incluso con el campo defensor lleno', () => {
  it.each([false, true])('intercambia control/casilla y conserva posiciones y cartas asociadas (defensa=%s)', (defenderInDefense) => {
    const attackerUid = 'attacker';
    const defenderUid = 'defender';
    const attackerTrap: TrapCard = { ...TRAPS[0], instanceId: 'attacker-trap', owner: 0 };
    const defenderMagic = MAGICS[0];
    const attacker = fieldMonster(monster('attacker-card', 0), attackerUid, {
      position: 'attack',
      trap: attackerTrap,
      magic: MAGICS[1],
    });
    const defender = fieldMonster(monster('defender-card', 1), defenderUid, {
      position: defenderInDefense ? 'defense' : 'attack',
      faceDown: defenderInDefense,
      trap: { ...trap7, instanceId: 'trap7-copy', owner: 1 },
      magic: defenderMagic,
    });
    const fullField = [defender, ...Array.from({ length: 5 }, (_, i) => fieldMonster(monster(`filler-${i}`, 1), `filler-${i}`))];
    const state = scene({
      me: { field: [attacker, null, null, null, null, null] },
      opp: { field: fullField },
    });

    const after = attackWithTrap(state, attackerUid, defenderUid);
    const attackerAfter = after.players[1].field.find((fm) => fm?.uid === attackerUid);
    const defenderAfter = after.players[0].field.find((fm) => fm?.uid === defenderUid);

    expect(attackerAfter).toMatchObject({ uid: attackerUid, position: 'attack', controlledBy: 1, trap: attackerTrap, magic: MAGICS[1] });
    expect(defenderAfter).toMatchObject({ uid: defenderUid, position: defender.position, controlledBy: 0, magic: defenderMagic });
    expect(defenderAfter?.faceDown).toBe(defenderInDefense);
    expect(defenderAfter?.trap).toBeNull();
    expect(after.players[1].field.filter(Boolean)).toHaveLength(6);
    expect(after.players[0].field.filter(Boolean)).toHaveLength(1);
    expect(after.players[1].graveyard).toContain(defender.trap);
    expect(after.players[0].graveyard).not.toContain(defender.trap);
    expect(after.players.flatMap((p) => p.graveyard)).not.toContain(attacker.card);
    expect(after.players.flatMap((p) => p.graveyard)).not.toContain(defender.card);
  });
});

describe('Trampa 5: excluir solo la instancia activada', () => {
  it.each([
    ['Mágica', 'magic' as const],
    ['Trampa', 'trap' as const],
  ])('permite elegir y destruye una %s del defensor al cementerio de su propietario', (_label, cardType) => {
    const activated = { ...trap5, instanceId: 'activated-trap5', owner: 1 as const };
    const targetMagic = { ...MAGICS[0], instanceId: 'target-magic', owner: 1 as const };
    const targetTrap = { ...TRAPS[0], instanceId: 'target-trap', owner: 0 as const };
    const attacker = fieldMonster(monster('attacker', 0), 'attacker');
    const defender = fieldMonster(monster('defender', 1), 'defender', {
      trap: activated,
      magic: cardType === 'magic' ? targetMagic : null,
    });
    const other = fieldMonster(monster('other', 1), 'other', {
      trap: cardType === 'trap' ? targetTrap : null,
    });
    const state = scene({
      me: { field: [attacker, null, null, null, null, null] },
      opp: { field: [defender, other, null, null, null, null] },
    });

    const choosing = attackWithTrap(state, attacker.uid, defender.uid);
    expect(choosing.selection.kind).toBe('choose-destroy-associated-card');
    if (choosing.selection.kind !== 'choose-destroy-associated-card') throw new Error('Missing Trap 5 target selection');
    expect(choosing.currentPlayer).toBe(0);
    expect(choosing.selection.player).toBe(0);
    const availableTargets = legalActions(choosing, 0).filter(
      (action) => action.type === 'DESTROY_ASSOCIATED_CARD',
    );
    expect(availableTargets).toContainEqual({
      type: 'DESTROY_ASSOCIATED_CARD',
      fieldUid: cardType === 'magic' ? defender.uid : other.uid,
      cardType,
    });
    expect(choosing.players[1].graveyard).toContain(activated);

    const after = reducer(choosing, {
      type: 'DESTROY_ASSOCIATED_CARD',
      fieldUid: cardType === 'magic' ? defender.uid : other.uid,
      cardType,
    });
    const destroyed = cardType === 'magic' ? targetMagic : targetTrap;
    const owner = cardType === 'magic' ? 1 : 0;
    expect(after.players[owner].graveyard).toContain(destroyed);
    expect(cardType === 'magic' ? after.players[1].field[0]?.magic : after.players[1].field[1]?.trap).toBeNull();
    expect(after.players[1].graveyard).toContain(activated);
    expect(after.selection.kind).toBe('none');
  });

  it('ofrece otra Trampa 5 como único objetivo adicional y nunca permite seleccionar la activada', () => {
    const activated = { ...trap5, instanceId: 'activated-trap5', owner: 1 as const };
    const otherTrap5 = { ...trap5, instanceId: 'other-trap5', owner: 1 as const };
    const attacker = fieldMonster(monster('attacker', 0), 'attacker');
    const defender = fieldMonster(monster('defender', 1), 'defender', { trap: activated });
    const other = fieldMonster(monster('other-defender', 1), 'other', { trap: otherTrap5 });
    const choosing = attackWithTrap(scene({
      me: { field: [attacker, null, null, null, null, null] },
      opp: { field: [defender, other, null, null, null, null] },
    }), attacker.uid, defender.uid);

    expect(choosing.selection.kind).toBe('choose-destroy-associated-card');
    const legalTargets = legalActions(choosing, 0).filter((action) => action.type === 'DESTROY_ASSOCIATED_CARD');
    expect(legalTargets).toContainEqual({
      type: 'DESTROY_ASSOCIATED_CARD', fieldUid: other.uid, cardType: 'trap',
    });
    expect(legalTargets).not.toContainEqual({
      type: 'DESTROY_ASSOCIATED_CARD', fieldUid: defender.uid, cardType: 'trap',
    });
    expect(choosing.players[1].field[0]?.trap).toBeNull();
    expect(choosing.players[1].graveyard).toContain(activated);

    const after = reducer(choosing, {
      type: 'DESTROY_ASSOCIATED_CARD', fieldUid: other.uid, cardType: 'trap',
    });
    expect(after.players[1].graveyard).toContain(otherTrap5);
    expect(after.players[1].graveyard).toContain(activated);
  });
});
