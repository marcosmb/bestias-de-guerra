import { describe, expect, it } from 'vitest';
import { getTrap3CountingOrder } from '../trapCounting';
import type { FieldMonster, PlayerState } from '../types';

function monster(uid: string): FieldMonster {
  return {
    uid,
    card: {
      id: `monster-${uid}`,
      type: 'monster',
      suit: 'espadas',
      number: 1,
      name: uid,
      atk: 1,
      def: 1,
      image: '',
    },
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
  };
}

function player(field: (FieldMonster | null)[]): PlayerState {
  return {
    lp: 100,
    hand: [],
    deck: [],
    graveyard: [],
    field,
    cardsPlayedThisTurn: 0,
  } as PlayerState;
}

describe('Trampa 3 — orden de conteo', () => {
  it('empieza en la Trampa, sigue a la derecha, luego rival de izquierda a derecha y salta huecos', () => {
    const players: [PlayerState, PlayerState] = [
      player([null, monster('A'), null, monster('B'), monster('C'), null]),
      player([monster('D'), null, monster('E'), null, monster('F'), null]),
    ];

    const order = getTrap3CountingOrder(players, 0, 'A');

    expect(order.map(({ fm }) => fm.uid)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
