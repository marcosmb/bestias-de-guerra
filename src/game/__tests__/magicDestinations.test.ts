import { describe, expect, it } from 'vitest';
import { MAGICS, type Card, type MagicCard, type MonsterCard } from '../cardData';
import { initialState, reducer } from '../useGame';
import { createPlayer, type FieldMonster } from '../types';

const m = (id: string, instanceId: string, owner: 0 | 1 = 0): MagicCard => ({
  ...(MAGICS.find((card) => card.id === id) as MagicCard),
  instanceId,
  owner,
});

const fieldMonster = (instanceId: string, overrides: Partial<FieldMonster> = {}): FieldMonster => ({
  uid: `field-${instanceId}`,
  card: monster(instanceId),
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
});

const monster = (instanceId: string, owner: 0 | 1 = 0): MonsterCard => ({
  id: `monster-${instanceId}`,
  type: 'monster',
  suit: 'espadas',
  number: 4,
  name: 'Monstruo de prueba',
  atk: 4,
  def: 4,
  image: '',
  instanceId,
  owner,
});

function stateWithHands(
  myHand: Card[],
  rivalHand: Card[] = [],
  deck: Card[] = [],
  myGraveyard: Card[] = [],
  myField: (FieldMonster | null)[] = [],
  rivalField: (FieldMonster | null)[] = [],
) {
  const emptyField = () => [null, null, null, null, null, null] as (FieldMonster | null)[];
  const players = [
    { ...createPlayer(0, 'Jugador 1', []), hand: myHand, deck, graveyard: myGraveyard, field: myField.length ? myField : emptyField() },
    { ...createPlayer(1, 'Jugador 2', []), hand: rivalHand, field: rivalField.length ? rivalField : emptyField() },
  ] as ReturnType<typeof initialState>['players'];
  return { ...initialState(), phase: 'playing' as const, turnCount: 3, currentPlayer: 0 as const, players };
}

describe('destino de Mágicas instantáneas', () => {
  it.each([[ 'M11 primero', ['m11', 'm9'] ], [ 'M9 primero', ['m9', 'm11'] ]] as const)(
    '%s: M11 resuelve y consume su instancia exacta, conservando M9',
    (_order, ids) => {
      const cards = ids.map((id) => m(id, `instance-${id}`));
      const damage = cards.find((card) => card.id === 'm11')!;
      const protection = cards.find((card) => card.id === 'm9')!;
      const start = stateWithHands(cards);
      const asksForRoll = reducer(start, { type: 'SELECT_MAGIC', card: damage });

      expect(asksForRoll.phase).toBe('dice-roll');
      expect(asksForRoll.pendingDice?.magicCardInstanceId).toBe(damage.instanceId);
      const resolved = reducer(asksForRoll, { type: 'ROLL_DICE', roll: 4 });

      expect(resolved.players[0].hand).toContain(protection);
      expect(resolved.players[0].hand).not.toContain(damage);
      expect(resolved.players[0].graveyard).toContain(damage);
      expect(resolved.players[1].lp).toBe(start.players[1].lp - 4);
    },
  );

  it('envía M10 al cementerio tras robar hasta las cartas disponibles', () => {
    const drawMagic = m('m10', 'm10-active');
    const first = monster('deck-card-1');
    const start = stateWithHands([drawMagic], [], [first]);
    const result = reducer(start, { type: 'SELECT_MAGIC', card: drawMagic });

    expect(result.players[0].hand).toContain(first);
    expect(result.players[0].graveyard).toContain(drawMagic);
    expect(result.players[0].deck).toHaveLength(0);
  });

  it('M2 roba una instancia aleatoria y envía M2 al cementerio', () => {
    const steal = m('m2', 'm2-active');
    const duplicates = [monster('rival-copy-a', 1), monster('rival-copy-b', 1)];
    duplicates.forEach((card) => { card.id = 'same-monster-id'; });
    const start = stateWithHands([steal], duplicates);
    const result = reducer(start, { type: 'SELECT_MAGIC', card: steal });

    expect(result.players[0].hand).toHaveLength(1);
    expect(result.players[0].hand[0].owner).toBe(1);
    expect(result.players[1].hand).toHaveLength(1);
    expect(result.players[0].graveyard).toContain(steal);
  });

  it('M5 envía la instantánea al cementerio después de recuperar a la mano', () => {
    const revive = m('m5', 'm5-active');
    const recovered = monster('grave-monster');
    const start = stateWithHands([revive], [], [], [recovered]);
    const choosing = reducer(start, { type: 'SELECT_MAGIC', card: revive });
    const result = reducer(choosing, { type: 'REVIVE_CHOICE', card: revive, choice: 'hand' });

    expect(result.players[0].hand).toContain(recovered);
    expect(result.players[0].graveyard).toContain(revive);
    expect(result.players[0].graveyard).not.toContain(recovered);
  });

  it.each(['m6', 'm7', 'm12'] as const)('%s envía la instancia utilizada al cementerio', (id) => {
    const instant = m(id, `${id}-active`);
    const enemy = fieldMonster(`${id}-enemy`);
    const start = stateWithHands([instant], [], [], [], [], [enemy]);
    const result = reducer(start, { type: 'SELECT_MAGIC', card: instant });

    expect(result.players[0].graveyard).toContain(instant);
    expect(result.players[0].hand).not.toContain(instant);
  });

  it('M5 recupera automáticamente a la mano cuando el campo está lleno y conserva el tamaño de mano', () => {
    const revive = m('m5', 'm5-full-field');
    const recovered = monster('m5-recovered');
    const fillers = Array.from({ length: 9 }, (_, index) => monster(`hand-${index}`));
    const fullField = Array.from({ length: 6 }, (_, index) => fieldMonster(`field-${index}`));
    const start = stateWithHands([revive, ...fillers], [], [], [recovered], fullField);
    const result = reducer(start, { type: 'SELECT_MAGIC', card: revive });

    expect(result.players[0].hand).toHaveLength(10);
    expect(result.players[0].hand).toContain(recovered);
    expect(result.players[0].graveyard).toContain(revive);
    expect(result.selection.kind).toBe('none');
  });

  it('si M3 ya descartó su propia instancia, no la duplica al consumirla', () => {
    const swap = m('m3', 'm3-active');
    const start = stateWithHands([swap], [], Array.from({ length: 5 }, (_, i) => monster(`draw-${i}`)));
    const result = reducer(start, { type: 'SELECT_MAGIC', card: swap });

    expect(result.players[0].hand.filter((card) => card.instanceId === swap.instanceId)).toHaveLength(0);
    expect(result.players[0].graveyard.filter((card) => card.instanceId === swap.instanceId)).toHaveLength(1);
  });

  it('conserva la propiedad al mandar una Mágica robada al cementerio', () => {
    const stolenM10 = m('m10', 'rival-m10', 1);
    const draw = monster('draw-card');
    const start = stateWithHands([stolenM10], [], [draw]);
    const result = reducer(start, { type: 'SELECT_MAGIC', card: stolenM10 });

    expect(result.players[0].graveyard).not.toContain(stolenM10);
    expect(result.players[1].graveyard).toContain(stolenM10);
  });

});
