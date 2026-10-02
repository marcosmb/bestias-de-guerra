import { describe, it, expect } from 'vitest';
import { hasAnyLegalAction, checkStalemate } from '../types';
import type { GameState, FieldMonster, PlayerState } from '../types';
import { createPlayer, shuffleDeck } from '../types';
import type { Card, MonsterCard, TrapCard, MagicCard } from '../cardData';
import { buildDeck } from '../cardData';

// ---------- Helpers ----------

function monster(overrides: Partial<MonsterCard> = {}): MonsterCard {
  return {
    id: `m-espadas-${overrides.atk ?? 5}`,
    type: 'monster',
    suit: 'espadas',
    number: overrides.atk ?? 5,
    name: `Monstruo ${overrides.atk ?? 5}`,
    atk: 5,
    def: 5,
    image: '',
    ...overrides,
  };
}

function trap(overrides: Partial<TrapCard> = {}): TrapCard {
  return {
    id: 't1',
    type: 'trap',
    suit: 'copas',
    number: 1,
    name: 'Trampa',
    description: '',
    effect: { kind: 'heal_per_turn', amount: 5 },
    image: '',
    ...overrides,
  };
}

function magic(overrides: Partial<MagicCard> = {}): MagicCard {
  return {
    id: 'm1',
    type: 'magic',
    suit: 'oros',
    number: 1,
    name: 'Mágica',
    description: '',
    effect: { kind: 'draw_cards', amount: 2 },
    placement: 'instant',
    ...overrides,
  };
}

function fieldMonster(card: MonsterCard, overrides: Partial<FieldMonster> = {}): FieldMonster {
  return {
    uid: `uid-${card.id}`,
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

function playerWith(
  index: 0 | 1,
  field: (FieldMonster | null)[],
  hand: Card[] = [],
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    ...createPlayer(index, `Jugador ${index + 1}`, shuffleDeck(buildDeck())),
    field,
    hand,
    ...overrides,
  };
}

function makeState(
  p1Field: (FieldMonster | null)[],
  p2Field: (FieldMonster | null)[],
  options: {
    p1Hand?: Card[];
    p2Hand?: Card[];
    p1Lp?: number;
    p2Lp?: number;
    p1Played?: number;
    p2Played?: number;
    turnCount?: number;
    currentPlayer?: 0 | 1;
  } = {},
): GameState {
  return {
    phase: 'playing',
    mode: 'local',
    difficulty: 'normal',
    currentPlayer: options.currentPlayer ?? 0,
    turnCount: options.turnCount ?? 1,
    players: [
      playerWith(0, p1Field, options.p1Hand ?? [], {
        lp: options.p1Lp ?? 100,
        cardsPlayedThisTurn: options.p1Played ?? 0,
      }),
      playerWith(1, p2Field, options.p2Hand ?? [], {
        lp: options.p2Lp ?? 100,
        cardsPlayedThisTurn: options.p2Played ?? 0,
      }),
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

const emptyField = (): (FieldMonster | null)[] => [null, null, null, null, null, null];

// ---------- Tests ----------

describe('Regla 27.2 — hasAnyLegalAction', () => {
  it('un jugador con cartas jugables tiene acciones legales', () => {
    const player = playerWith(0, emptyField(), [monster({ atk: 5 })]);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [monster({ atk: 5 })] });

    expect(hasAnyLegalAction(player, state)).toBe(true);
  });

  it('un jugador sin cartas en mano no tiene acciones legales de carta', () => {
    const player = playerWith(0, emptyField(), []);
    const state = makeState(emptyField(), emptyField());

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un monstruo en Ataque que no ha atacado NO impide el bloqueo por sí solo', () => {
    const fm = fieldMonster(monster({ atk: 5 }), { uid: 'a' });
    const player = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField());

    // Hay ataque disponible, pero ninguna carta jugable → no cuenta para 27.2
    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un monstruo en Defensa sin cambios de posición NO impide el bloqueo por sí solo', () => {
    const fm = fieldMonster(monster({ atk: 5 }), {
      uid: 'd',
      position: 'defense',
      faceDown: true,
    });
    const player = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField());

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un jugador con un monstruo que ya atacó y ya cambió posición no tiene acciones legales', () => {
    const fm = fieldMonster(monster({ atk: 5 }), {
      uid: 'used',
      hasAttacked: true,
      hasChangedPosition: true,
    });
    const player = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField());

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un jugador con 3 cartas jugadas no puede jugar más cartas', () => {
    const player = playerWith(0, emptyField(), [monster({ atk: 5 })], { cardsPlayedThisTurn: 3 });
    const state = makeState(emptyField(), emptyField(), { p1Played: 3 });

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un jugador con una Trampa en mano y un monstruo sin Trampa tiene acciones legales', () => {
    const fm = fieldMonster(monster({ atk: 5 }), { uid: 'own' });
    const player = playerWith(0, [fm], [trap()]);
    const state = makeState([fm], emptyField(), { p1Hand: [trap()] });

    expect(hasAnyLegalAction(player, state)).toBe(true);
  });

  it('un jugador con una Trampa en mano pero sin monstruo válido no tiene acciones legales de Trampa', () => {
    const player = playerWith(0, emptyField(), [trap()]);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [trap()] });

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un jugador con una Mágica instantánea en mano tiene acciones legales', () => {
    const player = playerWith(0, emptyField(), [magic()]);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [magic()] });

    expect(hasAnyLegalAction(player, state)).toBe(true);
  });

  it('un jugador con una Mágica de campo pero sin monstruo válido no tiene acciones legales de Mágica', () => {
    const fieldMagic = magic({ placement: 'field', effect: { kind: 'atk_boost', amount: 2 } });
    const player = playerWith(0, emptyField(), [fieldMagic]);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [fieldMagic] });

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('un jugador con un monstruo en Ataque que ya atacó y ya cambió posición no tiene acciones legales', () => {
    const fm = fieldMonster(monster({ atk: 5 }), {
      uid: 'used',
      hasAttacked: true,
      hasChangedPosition: true,
    });
    const player = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField());

    expect(hasAnyLegalAction(player, state)).toBe(false);
  });

  it('en el primer turno del jugador 1 no hay acción de carta aunque el monstruo pueda cambiar', () => {
    const fm = fieldMonster(monster({ atk: 5 }), { uid: 'a' });
    const player = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField(), { turnCount: 0, currentPlayer: 0 });

    // Sin cartas en mano → no hay acción de carta legal; el cambio de posición no cuenta
    expect(hasAnyLegalAction(player, state)).toBe(false);
  });
});

describe('Regla 27.2 — checkStalemate', () => {
  it('A tiene más LP → gana A', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 80 });
    const p2 = playerWith(1, emptyField(), [], { lp: 50 });

    expect(checkStalemate([p1, p2])).toBe(0);
  });

  it('B tiene más LP → gana B', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 30 });
    const p2 = playerWith(1, emptyField(), [], { lp: 60 });

    expect(checkStalemate([p1, p2])).toBe(1);
  });

  it('mismos LP → empate (null)', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 50 });
    const p2 = playerWith(1, emptyField(), [], { lp: 50 });

    expect(checkStalemate([p1, p2])).toBeNull();
  });
});

describe('Regla 27.2 — integración con el reducer', () => {
  it('ambos jugadores sin acciones legales y A con más LP → game-over, gana A', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 80 });
    const p2 = playerWith(1, emptyField(), [], { lp: 50 });
    const state = makeState(emptyField(), emptyField(), { p1Lp: 80, p2Lp: 50 });

    // Simular la comprobación de estancamiento
    const p1CanAct = hasAnyLegalAction(p1, state);
    const p2CanAct = hasAnyLegalAction(p2, state);

    expect(p1CanAct).toBe(false);
    expect(p2CanAct).toBe(false);

    const winner = checkStalemate(state.players);
    expect(winner).toBe(0);
  });

  it('ambos jugadores sin acciones legales y B con más LP → game-over, gana B', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 30 });
    const p2 = playerWith(1, emptyField(), [], { lp: 60 });
    const state = makeState(emptyField(), emptyField(), { p1Lp: 30, p2Lp: 60 });

    const p1CanAct = hasAnyLegalAction(p1, state);
    const p2CanAct = hasAnyLegalAction(p2, state);

    expect(p1CanAct).toBe(false);
    expect(p2CanAct).toBe(false);

    const winner = checkStalemate(state.players);
    expect(winner).toBe(1);
  });

  it('ambos jugadores sin acciones legales y mismos LP → empate', () => {
    const p1 = playerWith(0, emptyField(), [], { lp: 50 });
    const p2 = playerWith(1, emptyField(), [], { lp: 50 });
    const state = makeState(emptyField(), emptyField(), { p1Lp: 50, p2Lp: 50 });

    const p1CanAct = hasAnyLegalAction(p1, state);
    const p2CanAct = hasAnyLegalAction(p2, state);

    expect(p1CanAct).toBe(false);
    expect(p2CanAct).toBe(false);

    const winner = checkStalemate(state.players);
    expect(winner).toBeNull();
  });

  it('existe una carta jugable → la partida NO termina', () => {
    const p1 = playerWith(0, emptyField(), [monster({ atk: 6 })]);
    const p2 = playerWith(1, emptyField(), []);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [monster({ atk: 6 })] });

    const p1CanAct = hasAnyLegalAction(p1, state);
    const p2CanAct = hasAnyLegalAction(p2, state);

    expect(p1CanAct || p2CanAct).toBe(true);
  });

  it('un ataque legal disponible NO impide declarar el final', () => {
    const fm = fieldMonster(monster({ atk: 8 }), { uid: 'attacker' });
    const p1 = playerWith(0, [fm], []);
    const p2 = playerWith(1, emptyField(), []);
    const state = makeState([fm], emptyField());

    expect(hasAnyLegalAction(p1, state)).toBe(false);
    expect(hasAnyLegalAction(p2, state)).toBe(false);
  });

  it('un cambio de posición legal disponible NO impide declarar el final', () => {
    const fm = fieldMonster(monster({ atk: 5 }), {
      uid: 'defender',
      position: 'defense',
      faceDown: true,
    });
    const p1 = playerWith(0, [fm], []);
    const state = makeState([fm], emptyField());

    expect(hasAnyLegalAction(p1, state)).toBe(false);
  });

  it('quedarse sin Monstruos con cartas no jugables → la partida termina', () => {
    const p1 = playerWith(0, emptyField(), [trap()]);
    const p2 = playerWith(1, emptyField(), []);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [trap()] });

    // Trampa sin Monstruo válido → no hay acción de carta → bloqueo
    expect(hasAnyLegalAction(p1, state)).toBe(false);
    expect(hasAnyLegalAction(p2, state)).toBe(false);
  });

  it('un jugador con cartas jugables impide declarar el final', () => {
    const p1 = playerWith(0, emptyField(), [monster({ atk: 5 })]);
    const p2 = playerWith(1, emptyField(), []);
    const state = makeState(emptyField(), emptyField(), { p1Hand: [monster({ atk: 5 })] });

    expect(hasAnyLegalAction(p1, state)).toBe(true);
    expect(hasAnyLegalAction(p2, state)).toBe(false);
  });
});