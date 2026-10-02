import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import type { Action, GameState, FieldMonster } from '../types';
import { createPlayer, canPlaceTrapOn } from '../types';
import {
  buildDeck,
  TRAPS,
  MAGICS,
  type Card,
  type MagicCard,
  type MonsterCard,
} from '../cardData';

/**
 * Tests de regresión de la corrección funcional:
 *   - summonedThisTurn (Regla 19): el flag pertenece al Monstruo y se limpia
 *     en la frontera de turno aunque cambie de controlador.
 *   - Gestión de cartas: una instancia por jugada, sin duplicados y sin
 *     perder cartas cuando un efecto no puede resolverse.
 */

// --- Helpers ---

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

function baseState(): GameState {
  const players = [
    { ...createPlayer(0, 'Jugador 1', []), hand: [] },
    { ...createPlayer(1, 'Jugador 2', []), hand: [] },
  ] as GameState['players'];
  return { ...initialState(), phase: 'playing', mode: 'local', turnCount: 1, players };
}

function monster(id: string, atk = 5): MonsterCard {
  return {
    id,
    type: 'monster',
    suit: id.startsWith('m-bastos') ? 'bastos' : 'espadas',
    number: atk,
    name: `M${atk}`,
    atk,
    def: atk,
    image: '',
  };
}

function magic(id: string, effect: MagicCard['effect']): MagicCard {
  return { id, type: 'magic', suit: 'oros', number: 1, name: id, description: '', effect, placement: 'instant' };
}

function fm(uid: string, card: MonsterCard, overrides: Partial<FieldMonster> = {}): FieldMonster {
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

function setField(state: GameState, idx: 0 | 1, monsters: FieldMonster[]): GameState {
  const players = [...state.players] as GameState['players'];
  const field: (FieldMonster | null)[] = [null, null, null, null, null, null];
  monsters.forEach((m, i) => { field[i] = m; });
  players[idx] = { ...players[idx], field };
  return { ...state, players };
}

function setHand(state: GameState, idx: 0 | 1, cards: Card[]): GameState {
  const players = [...state.players] as GameState['players'];
  players[idx] = { ...players[idx], hand: cards };
  return { ...state, players };
}

function setGraveyard(state: GameState, idx: 0 | 1, cards: Card[]): GameState {
  const players = [...state.players] as GameState['players'];
  players[idx] = { ...players[idx], graveyard: cards };
  return { ...state, players };
}

function handIds(state: GameState, idx: 0 | 1): string[] {
  return state.players[idx].hand.map((c) => c.id);
}

function duplicateIds(hand: Card[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of hand) {
    if (seen.has(c.id)) dupes.add(c.id);
    seen.add(c.id);
  }
  return [...dupes];
}

// ---------------------------------------------------------------------------
// PRIORIDAD 2 — summonedThisTurn
// ---------------------------------------------------------------------------

describe('Regla 19 — summonedThisTurn', () => {
  it('la Trampa SÍ puede colocarse sobre un Monstruo invocado este mismo turno', () => {
    const trap = TRAPS[0];
    const card = monster('m-espadas-5', 5);
    let state = setHand(baseState(), 0, [card, trap]);
    state = run(state, { type: 'SUMMON_MONSTER', card, position: 'attack' });

    const placed = state.players[0].field.find((f) => f !== null)!;
    expect(placed.summonedThisTurn).toBe(true);
    expect(canPlaceTrapOn(state.players[0], placed.uid)).toBe(true);

    state = run(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = run(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: placed.uid });
    expect(state.players[0].field.find((f) => f?.uid === placed.uid)?.trap?.id).toBe(trap.id);
  });

  it('la Trampa NO puede colocarse sobre un Monstruo que ya tiene Trampa', () => {
    const trap = TRAPS[0];
    const card = monster('m-espadas-5', 5);
    let state = setHand(baseState(), 0, [trap]);
    state = setField(state, 0, [fm('own', card, { trap: TRAPS[1] })]);

    expect(canPlaceTrapOn(state.players[0], 'own')).toBe(false);
    state = run(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = run(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: 'own' });

    expect(state.players[0].field.find((f) => f?.uid === 'own')?.trap?.id).toBe(TRAPS[1].id);
    expect(handIds(state, 0)).toContain(trap.id);
  });

  it('END_TURN limpia summonedThisTurn en los DOS campos', () => {
    // El Monstruo del Jugador 2 se marca summonedThisTurn durante el turno del
    // Jugador 2 (no del 0), pero al cerrar el turno debe quedar limpio.
    let state = baseState();
    state = setField(state, 0, [fm('p0', monster('m-espadas-5', 5), { summonedThisTurn: true })]);
    state = setField(state, 1, [fm('p1', monster('m-bastos-5', 5), { summonedThisTurn: true })]);

    state = run(state, { type: 'END_TURN' });

    const field0 = state.players[0].field.filter(Boolean) as FieldMonster[];
    const field1 = state.players[1].field.filter(Boolean) as FieldMonster[];
    expect(field0.every((f) => f.summonedThisTurn === false)).toBe(true);
    expect(field1.every((f) => f.summonedThisTurn === false)).toBe(true);
  });

  it('el flag se limpia aunque el Monstruo haya cambiado de controlador (Trampa 7)', () => {
    const trap = TRAPS.find((t) => t.effect.kind === 'swap_attacker')!;
    const myCard = monster('m-espadas-8', 8);
    const rivalCard = monster('m-bastos-6', 6);
    // Mágica de reserva: siempre activable, evita el fin por bloqueo (Regla 27.2).
    const keep0 = magic('m10', { kind: 'draw_cards', amount: 2 });
    const keep1 = magic('m11', { kind: 'dice_damage' });

    // Jugador 0 coloca la Trampa 7 bajo su propio Monstruo.
    let state = setField(baseState(), 0, [fm('mine', myCard)]);
    state = setHand(state, 0, [trap, keep0]);
    state = setHand(state, 1, [keep1]);
    state = run(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = run(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: 'mine' });
    expect(state.players[0].field.find((f) => f?.uid === 'mine')?.trap?.id).toBe(trap.id);

    // Jugador 0 termina; Jugador 1 invoca (queda summonedThisTurn) y ataca.
    state = run(state, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    state = setHand(state, 1, [rivalCard, keep1]);
    state = run(state, { type: 'SUMMON_MONSTER', card: rivalCard, position: 'attack' });
    const rivalUid = state.players[1].field.find((f) => f !== null)!.uid;
    expect(state.players[1].field.find((f) => f?.uid === rivalUid)!.summonedThisTurn).toBe(true);

    state = run(state, { type: 'START_ATTACK', attackerUid: rivalUid });
    state = run(state, { type: 'DECLARE_ATTACK', attackerUid: rivalUid, defenderUid: 'mine' });
    expect(state.phase).toBe('trap-response');
    state = run(state, { type: 'RESOLVE_TRAP', activate: true });

    // El atacante pasó al campo del Jugador 0.
    expect(state.players[0].field.some((f) => f?.uid === rivalUid)).toBe(true);
    expect(state.players[1].field.some((f) => f?.uid === rivalUid)).toBe(false);

    // Al empezar el turno del Jugador 0 el flag debe estar limpio en su campo.
    state = run(state, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    expect(state.currentPlayer).toBe(0);
    const field0 = state.players[0].field.filter(Boolean) as FieldMonster[];
    expect(field0.every((f) => f.summonedThisTurn === false)).toBe(true);
  });

  it('el reseteo por jugador de hasAttacked/hasChangedPosition no se altera', () => {
    let state = setField(baseState(), 0, [fm('used', monster('m-espadas-5', 5), {
      hasAttacked: true,
      hasChangedPosition: true,
    })]);
    state = run(state, { type: 'END_TURN' });
    const f = state.players[0].field.find((x) => x?.uid === 'used')!;
    expect(f.hasAttacked).toBe(false);
    expect(f.hasChangedPosition).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PRIORIDAD 4 — Gestión de cartas
// ---------------------------------------------------------------------------

describe('Gestión de cartas — una instancia por jugada', () => {
  it('SUMMON_MONSTER elimina solo un ejemplar de la mano', () => {
    // Mano con dos cartas de Test (mismo id), jugamos una: debe quedar una.
    const card = monster('m-espadas-9', 9);
    let state = setHand(baseState(), 0, [card, card]);
    state = run(state, { type: 'SUMMON_MONSTER', card, position: 'attack' });
    expect(handIds(state, 0)).toEqual([card.id]);
    expect(state.players[0].field.filter(Boolean)).toHaveLength(1);
  });

  it('el mazo inicial no contiene cartas repetidas', () => {
    const deck = buildDeck();
    const seen = new Set(deck.map((c) => c.id));
    expect(seen.size).toBe(deck.length);
    expect(deck).toHaveLength(48);
  });
});

describe('Gestión de cartas — Mágica 2 sin duplicados', () => {
  it('no roba una carta que el jugador ya tiene en la mano', () => {
    const shared = monster('m-espadas-7', 7);
    const steal = magic('m2', { kind: 'steal_hand_card' });
    let state = setHand(baseState(), 0, [shared, steal]);
    state = setHand(state, 1, [shared]);

    state = run(state, { type: 'SELECT_MAGIC', card: steal });

    // No puede robar el duplicado: la mano no cambia y la Mágica no se consume.
    expect(duplicateIds(state.players[0].hand)).toEqual([]);
    expect(handIds(state, 0)).toEqual([shared.id, 'm2']);
    expect(handIds(state, 1)).toEqual([shared.id]);
    expect(state.players[0].cardsPlayedThisTurn).toBe(0);
  });

  it('roba una carta que el jugador NO tiene (comportamiento normal)', () => {
    const mine = monster('m-espadas-1', 1);
    const steal = magic('m2', { kind: 'steal_hand_card' });
    const theirs = monster('m-bastos-5', 5);
    let state = setHand(baseState(), 0, [mine, steal]);
    state = setHand(state, 1, [theirs]);

    state = run(state, { type: 'SELECT_MAGIC', card: steal });

    expect(handIds(state, 0)).toContain(theirs.id);
    expect(handIds(state, 1)).not.toContain(theirs.id);
    expect(duplicateIds(state.players[0].hand)).toEqual([]);
  });

  it('no se consume la Mágica si la mano está llena', () => {
    const steal = magic('m2', { kind: 'steal_hand_card' });
    const full = Array.from({ length: 9 }, (_, i) => monster(`h-${i}`, i + 1));
    let state = setHand(baseState(), 0, [...full, steal]);
    state = setHand(state, 1, [monster('m-bastos-9', 9)]);

    state = run(state, { type: 'SELECT_MAGIC', card: steal });

    expect(handIds(state, 0)).toContain('m2'); // sigue en la mano
    expect(state.players[0].cardsPlayedThisTurn).toBe(0);
  });
});

describe('Gestión de cartas — Mágica 5 sin duplicados ni pérdidas', () => {
  it('no revive a la mano un Monstruo que el jugador ya posee', () => {
    const held = monster('m-espadas-8', 8);
    const revive = magic('m5', { kind: 'revive_monster' });
    // Cementerio con un Monstruo que el jugador ya tiene; campo lleno → no hay destino.
    let state = setHand(baseState(), 0, [held, revive]);
    state = setGraveyard(state, 0, [held]);
    state = setField(state, 0, Array.from({ length: 6 }, (_, i) => fm(`f${i}`, monster(`x${i}`, i + 1))));

    state = run(state, { type: 'SELECT_MAGIC', card: revive });

    expect(duplicateIds(state.players[0].hand)).toEqual([]);
    expect(handIds(state, 0)).toContain('m5'); // no se consumió
    expect(state.players[0].graveyard.some((c) => c.id === held.id)).toBe(true);
  });

  it('REVIVE_CHOICE no duplica al elegir la mano', () => {
    const revive = magic('m5', { kind: 'revive_monster' });
    const target = monster('m-bastos-2', 2);
    // Mano con espacio y campo con huecos → pide elección.
    let state = setHand(baseState(), 0, [revive]);
    state = setGraveyard(state, 0, [target]);

    state = run(state, { type: 'SELECT_MAGIC', card: revive });
    expect(state.selection.kind).toBe('revive-choice');

    state = run(state, { type: 'REVIVE_CHOICE', card: revive, choice: 'hand' });

    expect(duplicateIds(state.players[0].hand)).toEqual([]);
    expect(handIds(state, 0)).toContain(target.id);
  });

  it('REVIVE_CHOICE no pierde la carta si el campo está lleno', () => {
    const revive = magic('m5', { kind: 'revive_monster' });
    const target = monster('m-bastos-2', 2);
    let state = setHand(baseState(), 0, [revive]);
    state = setGraveyard(state, 0, [target]);
    state = run(state, { type: 'SELECT_MAGIC', card: revive });
    expect(state.selection.kind).toBe('revive-choice');

    // Se llena el campo antes de resolver la elección.
    state = setField(state, 0, Array.from({ length: 6 }, (_, i) => fm(`f${i}`, monster(`y${i}`, i + 1))));
    const after = run(state, { type: 'REVIVE_CHOICE', card: revive, choice: 'field' });

    // La carta sigue en el cementerio (no se pierde) y la Mágica sigue en la mano.
    expect(after.players[0].graveyard.some((c) => c.id === target.id)).toBe(true);
    expect(handIds(after, 0)).toContain('m5');
  });
});

describe('Gestión de cartas — una Mágica ilegal no se consume', () => {
  it('Mágica 5 sin Monstruos en el cementerio no se consume', () => {
    const revive = magic('m5', { kind: 'revive_monster' });
    let state = setHand(baseState(), 0, [revive]);

    state = run(state, { type: 'SELECT_MAGIC', card: revive });

    expect(handIds(state, 0)).toContain('m5');
    expect(state.players[0].cardsPlayedThisTurn).toBe(0);
  });

  it('una Mágica instantánea legal sí se consume', () => {
    const draw = magic('m10', { kind: 'draw_cards', amount: 2 });
    let state = setHand(baseState(), 0, [draw]);

    state = run(state, { type: 'SELECT_MAGIC', card: draw });

    expect(handIds(state, 0)).not.toContain('m10');
    expect(state.players[0].cardsPlayedThisTurn).toBe(1);
  });
});

describe('Sanidad — datos de cartas', () => {
  it('hay 12 Trampas y 12 Mágicas definidas', () => {
    expect(TRAPS).toHaveLength(12);
    expect(MAGICS).toHaveLength(12);
  });
});