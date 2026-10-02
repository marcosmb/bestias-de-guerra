import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import {
  hasAnyLegalAction,
  hasPlayableCard,
  canPlayCardNow,
  checkStalemate,
  isBlockedByStalemate,
  describeBlock,
  canReceiveNewCards,
  hasLegalAttack,
  hasLegalPositionChange,
  hasLegalCardAction,
  canAttack,
  MAX_HAND_SIZE,
  MAX_CARDS_PER_TURN,
} from '../types';
import type { Action, GameState, FieldMonster, PlayerState } from '../types';
import { createPlayer } from '../types';
import type { MonsterCard, TrapCard, MagicCard } from '../cardData';

/**
 * REGLA 27.2 — Criterio de bloqueo de la partida.
 *
 * Decisiones del creador (máxima autoridad, Regla 33.1):
 *
 *   1. ATAQUE y CAMBIO DE POSICIÓN son acciones legales a efectos de la 27.2.
 *   2. `deck.length > 0 && hand.length < MAX_HAND_SIZE` implica que el jugador
 *      recibirá cartas nuevas por el robo automático de su siguiente turno, así
 *      que LA PARTIDA PUEDE CONTINUAR. El robo no es una acción legal: es
 *      automático al inicio del turno (Regla 15).
 *   3. El límite de 3 cartas por turno NO es un bloqueo: se reinicia cada turno.
 *   4. Primero se resuelve la Regla 27.1 (0 LP). Solo si nadie tiene 0 LP se
 *      aplica la 27.2.
 */

// ---------- Helpers ----------

let seq = 0;
function uid(): string {
  seq += 1;
  return `uid-${seq}`;
}

function monster(id: string, atk = 5, owner: 0 | 1 = 0): MonsterCard {
  return {
    id,
    type: 'monster',
    suit: 'espadas',
    number: atk,
    name: `Monstruo ${id}`,
    atk,
    def: atk,
    image: '',
    owner,
  };
}

function trap(id = 't1', owner: 0 | 1 = 0): TrapCard {
  return {
    id,
    type: 'trap',
    suit: 'copas',
    number: 1,
    name: 'Trampa',
    description: '',
    // Efecto neutro a propósito: al inicio del turno no altera los LP, para
    // que los tests puedan comprobar los LP exactos del stalemate.
    effect: { kind: 'dice_count_field' },
    image: '',
    owner,
  };
}

function magic(id = 'm10', owner: 0 | 1 = 0): MagicCard {
  return {
    id,
    type: 'magic',
    suit: 'oros',
    number: 1,
    name: 'Mágica',
    description: '',
    effect: { kind: 'draw_cards', amount: 2 },
    placement: 'instant',
    owner,
  };
}

function fieldMonster(
  card: MonsterCard,
  overrides: Partial<FieldMonster> = {},
): FieldMonster {
  return {
    uid: overrides.uid ?? uid(),
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

function player(
  index: 0 | 1,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    ...createPlayer(index, `Jugador ${index + 1}`, []),
    deck: [],
    hand: [],
    field: [null, null, null, null, null, null],
    ...overrides,
  };
}

function makeState(
  players: [PlayerState, PlayerState],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    ...initialState(),
    phase: 'playing',
    mode: 'local',
    turnCount: 2,
    currentPlayer: 0,
    players,
    ...overrides,
  };
}

function run(s: GameState, ...a: Action[]): GameState {
  return a.reduce((acc, act) => reducer(acc, act), s);
}

const emptyField = (): (FieldMonster | null)[] => [null, null, null, null, null, null];

/**
 * Campo lleno: 6 Monstruos que ya gastaron el ataque, el cambio de posición y
 * que además tienen ya una Trampa asociada. No dejan ninguna acción legal de
 * Regla 15 (ni colocar otra Trampa: máximo 1 por Monstruo).
 */
function fullSpentField(owner: 0 | 1): FieldMonster[] {
  return Array.from({ length: 6 }, (_, i) =>
    fieldMonster(monster(`lleno-${owner}-${i}`, 5, owner), {
      hasAttacked: true,
      hasChangedPosition: true,
      trap: trap(`lleno-trap-${owner}-${i}`, owner),
    }),
  );
}

/** Un jugador realmente bloqueado: sin mazo, sin mano, sin campo. */
function blockedPlayer(index: 0 | 1, lp = 100): PlayerState {
  return player(index, { lp });
}

// ==========================================================================
// A) ACCIÓN LEGAL DISPONIBLE
// ==========================================================================

describe('Regla 27.2 (A) — acción legal disponible', () => {
  it('jugar un Monstruo es acción legal', () => {
    const p = player(0, { hand: [monster('m1')], field: emptyField() });
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasLegalCardAction(p, s)).toBe(true);
    expect(hasPlayableCard(p, s)).toBe(true);
  });

  it('colocar una Trampa sobre un Monstruo propio es acción legal', () => {
    const own = fieldMonster(monster('campo-1', 5, 0), { uid: 'propio' });
    const p = player(0, { hand: [trap()], field: [own, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasLegalCardAction(p, s)).toBe(true);
  });

  it('una Trampa sin Monstruo propio donde colocarse NO es acción legal', () => {
    const p = player(0, { hand: [trap()] });
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasLegalCardAction(p, s)).toBe(false);
  });

  it('utilizar una Mágica instantánea es acción legal', () => {
    const p = player(0, { hand: [magic()] });
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasLegalCardAction(p, s)).toBe(true);
  });

  it('G · ATAQUE legal disponible → acción legal', () => {
    const atk = fieldMonster(monster('atacante', 8, 0), { uid: 'a', position: 'attack' });
    const p = player(0, { field: [atk, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    expect(hasLegalAttack(p, s)).toBe(true);
    expect(hasPlayableCard(p, s)).toBe(true);
  });

  it('un Monstruo que ya atacó no ofrece acción de ataque', () => {
    const spent = fieldMonster(monster('gastado', 8, 0), {
      uid: 'a',
      position: 'attack',
      hasAttacked: true,
      hasChangedPosition: true,
    });
    const p = player(0, { field: [spent, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    expect(hasLegalAttack(p, s)).toBe(false);
  });

  it('Regla 17 · el jugador que abre la partida no ataca en su primer turno', () => {
    const atk = fieldMonster(monster('atacante', 8, 0), { uid: 'a', position: 'attack' });
    const p = player(0, { field: [atk, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 0, currentPlayer: 0 });
    expect(canAttack(s)).toBe(false);
    expect(hasLegalAttack(p, s)).toBe(false);
    // Pero sí puede cambiar de posición: es una acción legal distinta.
    expect(hasLegalPositionChange(p)).toBe(true);
  });

  it('H · CAMBIO DE POSICIÓN legal → acción legal', () => {
    const def = fieldMonster(monster('defensa', 5, 0), {
      uid: 'd',
      position: 'defense',
      faceDown: true,
    });
    const p = player(0, { field: [def, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    expect(hasLegalPositionChange(p)).toBe(true);
    expect(hasPlayableCard(p, s)).toBe(true);
  });

  it('un Monstruo que ya cambió de posición no ofrece esa acción', () => {
    const used = fieldMonster(monster('usado', 5, 0), {
      uid: 'u',
      hasAttacked: true,
      hasChangedPosition: true,
    });
    const p = player(0, { field: [used, null, null, null, null, null] });
    expect(hasLegalPositionChange(p)).toBe(false);
  });
});

// ==========================================================================
// B) POSIBILIDAD DE CONTINUAR
// ==========================================================================

describe('Regla 27.2 (B) — posibilidad de continuar', () => {
  it('mazo con cartas + mano por debajo de 9 → puede continuar', () => {
    const p = player(0, { deck: [monster('d1', 1), monster('d2', 2)], hand: [monster('h1')] });
    expect(canReceiveNewCards(p)).toBe(true);
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasPlayableCard(p, s)).toBe(true);
  });

  it('D · mano < 9 + mazo no vacío → NO stalemate aunque no haya carta jugable', () => {
    // Campo lleno de Monstruos ya gastados, mano con SOLO Monstruos y campo
    // lleno: hoy no hay carta jugable, pero el mazo garantiza cartas nuevas.
    const p0 = player(0, {
      deck: Array.from({ length: 20 }, (_, i) => monster(`mazo0-${i}`, 4, 0)),
      hand: [monster('h0-1', 3, 0)],
      field: fullSpentField(0),
    });
    const p1 = player(1, {
      deck: Array.from({ length: 20 }, (_, i) => monster(`mazo1-${i}`, 4, 1)),
      hand: [monster('h1-1', 3, 1)],
      field: fullSpentField(1),
    });
    const s = makeState([p0, p1]);

    // No hay ninguna carta jugable ahora mismo...
    expect(hasLegalCardAction(p0, s)).toBe(false);
    expect(hasLegalCardAction(p1, s)).toBe(false);
    expect(hasLegalAttack(p0, s)).toBe(false);
    expect(hasLegalPositionChange(p0)).toBe(false);
    // ...pero la partida puede continuar.
    expect(isBlockedByStalemate(s)).toBe(false);
  });

  it('C · mano vacía + mazo con cartas → NO stalemate', () => {
    const p = player(0, { deck: [monster('d1', 1)], hand: [] });
    expect(canReceiveNewCards(p)).toBe(true);
    const s = makeState([p, blockedPlayer(1)]);
    expect(hasPlayableCard(p, s)).toBe(true);
  });

  it('E · mano 9/9 + mazo no vacío → el mazo NO evita el bloqueo por sí solo', () => {
    // Regla 9.3: con la mano a 9/9 no se roba, así que el mazo no abre vía de
    // continuación. La mano se llena de Trampas y no hay Monstruo propio sin
    // Trampa donde colocarlas, de modo que no hay ninguna acción de carta.
    const p = player(0, {
      deck: Array.from({ length: 10 }, (_, i) => monster(`d${i}`, 4, 0)),
      hand: Array.from({ length: MAX_HAND_SIZE }, (_, i) => trap(`h${i}`, 0)),
    });
    expect(p.hand).toHaveLength(9);
    expect(p.deck.length).toBeGreaterThan(0);
    expect(canReceiveNewCards(p)).toBe(false);

    const s = makeState([p, blockedPlayer(1)]);
    expect(hasLegalCardAction(p, s)).toBe(false);
    expect(hasLegalAttack(p, s)).toBe(false);
    expect(hasLegalPositionChange(p)).toBe(false);

    // Con el rival también bloqueado, sí es un bloqueo real.
    expect(isBlockedByStalemate(s)).toBe(true);
  });

  it('el máximo oficial de mano es 9', () => {
    expect(MAX_HAND_SIZE).toBe(9);
  });

  it('mazo vacío NO termina la partida si hay acciones legales', () => {
    const atk = fieldMonster(monster('atacante', 8, 0), { uid: 'a', position: 'attack' });
    const p0 = player(0, { deck: [], field: [atk, null, null, null, null, null] });
    const p1 = player(1, { deck: [], hand: [] });
    const s = makeState([p0, p1], { turnCount: 2 });
    expect(isBlockedByStalemate(s)).toBe(false);
    expect(hasPlayableCard(p1, s)).toBe(false); // J2 sí está sin salida
  });
});

// ==========================================================================
// ESCENARIOS A–I DE LA DECISIÓN DEL CREADOR
// ==========================================================================

describe('Regla 27.2 — escenarios decididos por el creador', () => {
  it('A · campo lleno + mano solo Monstruos + mazos con cartas + manos < 9 → NO stalemate', () => {
    const p0 = player(0, {
      deck: Array.from({ length: 30 }, (_, i) => monster(`a-mazo0-${i}`, 4, 0)),
      hand: Array.from({ length: 4 }, (_, i) => monster(`a-h0-${i}`, 3, 0)),
      field: fullSpentField(0),
    });
    const p1 = player(1, {
      deck: Array.from({ length: 30 }, (_, i) => monster(`a-mazo1-${i}`, 4, 1)),
      hand: Array.from({ length: 4 }, (_, i) => monster(`a-h1-${i}`, 3, 1)),
      field: fullSpentField(1),
    });
    const s = makeState([p0, p1]);

    for (const p of [p0, p1]) {
      expect(p.hand.every((c) => c.type === 'monster')).toBe(true);
      expect(p.hand.length).toBeLessThan(MAX_HAND_SIZE);
      expect(p.deck.length).toBeGreaterThan(0);
      expect(p.field.every((f) => f !== null)).toBe(true);
      expect(hasPlayableCard(p, s)).toBe(true);
    }
    expect(isBlockedByStalemate(s)).toBe(false);

    // Y el reducer NO cierra la partida.
    const next = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    expect(next.phase).toBe('playing');
    expect(next.winner).toBeNull();
    expect(next.isDraw).toBe(false);
  });

  it('B1 · campo lleno + solo Monstruos + mazos vacíos, pero con ATAQUE legal → NO stalemate', () => {
    const ready = fieldMonster(monster('listo', 8, 0), { uid: 'listo', position: 'attack' });
    const spent = fullSpentField(0).slice(1);
    const p0 = player(0, {
      deck: [],
      hand: Array.from({ length: 3 }, (_, i) => monster(`b1-h0-${i}`, 3, 0)),
      field: [ready, ...spent],
    });
    const p1 = player(1, { deck: [], hand: [] });
    const s = makeState([p0, p1], { turnCount: 2 });

    expect(p0.deck).toHaveLength(0);
    expect(hasLegalAttack(p0, s)).toBe(true);
    expect(isBlockedByStalemate(s)).toBe(false);
    expect(run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' }).phase).toBe('playing');
  });

  it('B2 · cambio de posición legal disponible, sin cartas ni ataque → NO stalemate', () => {
    const canMove = fieldMonster(monster('movil', 5, 0), {
      uid: 'm',
      position: 'defense',
      faceDown: true,
    });
    const p0 = player(0, {
      deck: [],
      hand: [],
      field: [canMove, ...fullSpentField(0).slice(1)],
    });
    const p1 = player(1, { deck: [], hand: [] });
    const s = makeState([p0, p1], { turnCount: 2 });

    expect(hasLegalCardAction(p0, s)).toBe(false);
    expect(hasLegalAttack(p0, s)).toBe(false);
    expect(hasLegalPositionChange(p0)).toBe(true);
    expect(isBlockedByStalemate(s)).toBe(false);
    expect(run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' }).phase).toBe('playing');
  });

  it('I · bloqueo real: sin cartas, sin ataque, sin cambio y sin mazo → stalemate', () => {
    const p0 = player(0, {
      deck: [],
      hand: [trap()], // Trampa, pero todos los Monstruos ya tienen una
      field: fullSpentField(0),
      lp: 80,
    });
    const p1 = player(1, { deck: [], hand: [], lp: 50 });
    const s = makeState([p0, p1], { turnCount: 2 });

    expect(hasLegalCardAction(p0, s)).toBe(false);
    expect(hasLegalAttack(p0, s)).toBe(false);
    expect(hasLegalPositionChange(p0)).toBe(false);
    expect(canReceiveNewCards(p0)).toBe(false);
    expect(isBlockedByStalemate(s)).toBe(true);
  });

  it('F · 3/3 de cartas jugadas NO termina la partida', () => {
    const p0 = player(0, {
      deck: [],
      hand: [monster('f-0', 3, 0)],
      cardsPlayedThisTurn: MAX_CARDS_PER_TURN,
    });
    const p1 = blockedPlayer(1);
    const s = makeState([p0, p1], { turnCount: 2 });

    // La cuota bloquea la jugada de AHORA...
    expect(canPlayCardNow(p0, s)).toBe(false);
    // ...pero no la partida: se reinicia en el siguiente turno.
    expect(hasPlayableCard(p0, s)).toBe(true);
    expect(isBlockedByStalemate(s)).toBe(false);
  });

  it('ambos jugadores en 3/3 → NO stalemate', () => {
    const p0 = player(0, { hand: [monster('f2-0', 3, 0)], cardsPlayedThisTurn: 3 });
    const p1 = player(1, { hand: [monster('f2-1', 3, 1)], cardsPlayedThisTurn: 3 });
    const s = makeState([p0, p1], { turnCount: 2 });
    expect(isBlockedByStalemate(s)).toBe(false);
  });
});

// ==========================================================================
// REGLA 27.1 TIENE PRIORIDAD
// ==========================================================================

describe('Regla 27.1 antes que 27.2', () => {
  it('con 0 LP se resuelve la victoria y NO se aplica el stalemate', () => {
    // Ambos bloqueados (27.2 se cumpliría) pero J1 tiene 0 LP: gana J2 por 27.1.
    const p0 = blockedPlayer(0, 0);
    const p1 = blockedPlayer(1, 100);
    const s = makeState([p0, p1], { turnCount: 2 });

    expect(isBlockedByStalemate(s)).toBe(true);

    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(1);
    expect(next.isDraw).toBe(false);
  });

  it('doble 0 LP → empate por 27.1, no por 27.2', () => {
    const p0 = blockedPlayer(0, 0);
    const p1 = blockedPlayer(1, 0);
    const s = makeState([p0, p1], { turnCount: 2 });

    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBeNull();
    expect(next.isDraw).toBe(true);
  });
});

// ==========================================================================
// checkStalemate — desempate por LP
// ==========================================================================

describe('Regla 27.2 — checkStalemate', () => {
  it('A tiene más LP → gana A', () => {
    expect(checkStalemate([blockedPlayer(0, 80), blockedPlayer(1, 50)])).toBe(0);
  });

  it('B tiene más LP → gana B', () => {
    expect(checkStalemate([blockedPlayer(0, 30), blockedPlayer(1, 60)])).toBe(1);
  });

  it('mismos LP → empate (null)', () => {
    expect(checkStalemate([blockedPlayer(0, 50), blockedPlayer(1, 50)])).toBeNull();
  });

  it('integración: bloqueo real con más LP en J1 → gana J1', () => {
    const s = makeState([blockedPlayer(0, 80), blockedPlayer(1, 50)], { turnCount: 2 });
    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(0);
    expect(next.isDraw).toBe(false);
    expect(next.selection.kind).toBe('none');
  });

  it('integración: bloqueo real con mismos LP → empate', () => {
    const s = makeState([blockedPlayer(0, 50), blockedPlayer(1, 50)], { turnCount: 2 });
    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBeNull();
    expect(next.isDraw).toBe(true);
  });

  it('el log del stalemate registra la condición que lo activó', () => {
    // `currentPlayer: 1` para que END_TURN reinicie las marcas de J2, no las de
    // J1, que es quien está bloqueado.
    const p0 = player(0, { deck: [], hand: [trap()], field: fullSpentField(0), lp: 80 });
    const p1 = player(1, { deck: [], hand: [], lp: 50 });
    const s = makeState([p0, p1], { turnCount: 2, currentPlayer: 1 });

    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    const last = next.log[next.log.length - 1];
    expect(last).toContain('Regla 27.2');
    expect(last).toContain(`J1 ${next.players[0].lp} LP`);
    expect(last).toContain(`J2 ${next.players[1].lp} LP`);
    expect(last).toContain('mazo vacío');
  });

  it('un CONFIRM_PASS rezagado no resucita una partida terminada', () => {
    const s = makeState([blockedPlayer(0, 80), blockedPlayer(1, 50)], { turnCount: 2 });
    const over = run(s, { type: 'END_TURN' });
    expect(over.phase).toBe('game-over');

    const after = reducer(over, { type: 'CONFIRM_PASS' });
    expect(after.phase).toBe('game-over');
    expect(after.winner).toBe(0);
  });
});

// ==========================================================================
// describeBlock — trazabilidad para el registro y el historial
// ==========================================================================

describe('Regla 27.2 — describeBlock', () => {
  it('un jugador con salida se describe como able de continuar', () => {
    const atk = fieldMonster(monster('atacante', 8, 0), { uid: 'a', position: 'attack' });
    const p = player(0, { deck: [monster('d1', 1)], field: [atk, null, null, null, null, null] });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    expect(describeBlock(p, s)).toContain('puede continuar');
  });

  it('un jugador bloqueado detalla todos los motivos', () => {
    const p = player(0, {
      deck: [],
      hand: [trap()],
      field: fullSpentField(0),
    });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    const d = describeBlock(p, s);
    expect(d).toContain('sin carta jugable');
    expect(d).toContain('sin ataque disponible');
    expect(d).toContain('sin cambio de posición disponible');
    expect(d).toContain('mazo vacío');
  });

  it('mano llena con mazo lleno se describe como no poder robar', () => {
    const p = player(0, {
      deck: [monster('d1', 1)],
      hand: Array.from({ length: MAX_HAND_SIZE }, (_, i) => trap(`h${i}`, 0)),
    });
    const s = makeState([p, blockedPlayer(1)], { turnCount: 2 });
    expect(describeBlock(p, s)).toContain(`mano a ${MAX_HAND_SIZE}/${MAX_HAND_SIZE}`);
  });
});

// ---------- alias.hasAnyLegalAction (usado por la interfaz) ----------

describe('Regla 27.2 — hasAnyLegalAction es el mismo criterio que hasPlayableCard', () => {
  it('alias coherente en los cuatro pilares', () => {
    const atk = fieldMonster(monster('a', 8, 0), { uid: 'a', position: 'attack' });
    const p0 = player(0, { deck: [monster('d', 1)], field: [atk, null, null, null, null, null] });
    const p1 = player(1, { deck: [], hand: [] });
    const s = makeState([p0, p1], { turnCount: 2 });

    expect(hasAnyLegalAction(p0, s)).toBe(hasPlayableCard(p0, s));
    expect(hasAnyLegalAction(p1, s)).toBe(hasPlayableCard(p1, s));
    expect(hasAnyLegalAction(p0, s)).toBe(true);
    expect(hasAnyLegalAction(p1, s)).toBe(false);
  });
});