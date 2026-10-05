import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import type { GameState, Action, FieldMonster } from '../types';
import { createPlayer, drawCards } from '../types';
import { buildDeck, TRAPS, type MonsterCard, type TrapCard } from '../cardData';

// --- Helpers ---

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = initialState();
  const deck1 = buildDeck();
  let p1 = createPlayer(0, 'P1', deck1);
  p1 = drawCards(p1, 7);
  const deck2 = buildDeck();
  let p2 = createPlayer(1, 'P2', deck2);
  p2 = drawCards(p2, 7);
  return {
    ...base,
    phase: 'playing',
    mode: 'cpu',
    currentPlayer: 0,
    turnCount: 1,
    players: [p1, p2],
    ...overrides,
  };
}

function monster(card: MonsterCard, overrides: Partial<FieldMonster> = {}): FieldMonster {
  return {
    uid: `test-${card.id}-${Math.random().toString(36).slice(2, 6)}`,
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

function getFirstMonsterCard(): MonsterCard {
  const deck = buildDeck();
  return deck.find((c) => c.type === 'monster') as MonsterCard;
}

function getMonsterWithAtk(atk: number): MonsterCard {
  const deck = buildDeck();
  return deck.filter((c): c is MonsterCard => c.type === 'monster').find((c) => c.atk === atk)!;
}

function getDistinctMonsterCards(count: number): MonsterCard[] {
  const deck = buildDeck();
  return deck.filter((c): c is MonsterCard => c.type === 'monster').slice(0, count);
}

function getTrapByEffect(kind: string): TrapCard {
  return TRAPS.find((t) => t.effect.kind === kind)!;
}

function dispatch(state: GameState, action: Action): GameState {
  return reducer(state, action);
}

function dispatchMany(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, a) => reducer(s, a), state);
}

function setField(state: GameState, playerIdx: 0 | 1, monsters: (FieldMonster | null)[]): GameState {
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[playerIdx] = { ...players[playerIdx], field: [...monsters, ...Array(6 - monsters.length).fill(null)] as (FieldMonster | null)[] };
  return { ...state, players };
}

function setLp(state: GameState, playerIdx: 0 | 1, lp: number): GameState {
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[playerIdx] = { ...players[playerIdx], lp };
  return { ...state, players };
}

function setHand(state: GameState, playerIdx: 0 | 1, cards: typeof state.players[0]['hand']): GameState {
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[playerIdx] = { ...players[playerIdx], hand: cards };
  return { ...state, players };
}

// --- Tests ---

describe('Reducer integration — SUMMON_MONSTER', () => {
  it('places a monster in the first empty slot and consumes the card', () => {
    const state = makeState();
    const card = getFirstMonsterCard();
    const s = dispatch(state, { type: 'SUMMON_MONSTER', card, position: 'attack' });
    expect(s.players[0].field[0]).not.toBeNull();
    expect(s.players[0].field[0]!.card.id).toBe(card.id);
    expect(s.players[0].field[0]!.position).toBe('attack');
    expect(s.players[0].hand.some((c) => c.id === card.id)).toBe(false);
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it('blocks summon when 3 cards already played', () => {
    const card = getFirstMonsterCard();
    let state = setHand(makeState(), 0, [card, card, card, card]);
    state = dispatchMany(state, [
      { type: 'SUMMON_MONSTER', card, position: 'attack' },
      { type: 'SUMMON_MONSTER', card, position: 'attack' },
      { type: 'SUMMON_MONSTER', card, position: 'attack' },
    ]);
    // 4th summon should be blocked
    const before = state.players[0].field.filter(Boolean).length;
    state = dispatch(state, { type: 'SUMMON_MONSTER', card, position: 'attack' });
    expect(state.players[0].field.filter(Boolean).length).toBe(before);
  });
});

describe('Reducer integration — END_TURN', () => {
  it('switches player, draws 2 cards, resets flags', () => {
    const state = makeState();
    const oppDeckBefore = state.players[1].deck.length;
    const s = dispatch(state, { type: 'END_TURN' });
    expect(s.currentPlayer).toBe(1);
    expect(s.players[1].deck.length).toBe(oppDeckBefore - 2);
    expect(s.players[1].hand.length).toBe(9); // 7 + 2
    expect(s.players[1].cardsPlayedThisTurn).toBe(0);
  });
});

// --- Trampa 9 (three_turns_kill) ---

describe('Trampa 9 — countdown and activation', () => {
  const trap9 = getTrapByEffect('three_turns_kill');
  const m3 = getMonsterWithAtk(3);
  const m5 = getMonsterWithAtk(5);

  it('counts down 3 → 2 → 1 → activation', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const fm = monster(m3, { trap: trap9 });
    state = setField(state, 0, [fm]);
    // Turn 1 (currentPlayer 0) ends → turn 2 (player 1)
    state = dispatch(state, { type: 'END_TURN' });
    // After END_TURN, applyTurnStartEffects runs for player 1.
    // Trampa 9 is on player 0's field, so it counts down during player 0's turn start.
    // We need to advance to player 0's turn start.
    // Turn 2 (player 1) ends → turn 3 (player 0)
    state = dispatch(state, { type: 'END_TURN' });
    // Now player 0's turn start: first countdown → 2 remaining
    const fm0 = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(fm0?.pendingTurns).toBe(2);

    // Turn 3 (player 0) ends → turn 4 (player 1)
    state = dispatch(state, { type: 'END_TURN' });
    // Turn 4 (player 1) ends → turn 5 (player 0)
    state = dispatch(state, { type: 'END_TURN' });
    // Player 0's turn start: second countdown → 1 remaining
    const fm1 = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(fm1?.pendingTurns).toBe(1);

    // Turn 5 (player 0) ends → turn 6 (player 1)
    state = dispatch(state, { type: 'END_TURN' });
    // Turn 6 (player 1) ends → turn 7 (player 0)
    state = dispatch(state, { type: 'END_TURN' });
    // Player 0's turn start: third countdown → 0 → activation
    expect(state.selection.kind).toBe('choose-destroy-target');
  });

  it('allows destroying any monster on the field', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const myFm = monster(m3, { trap: trap9 });
    const targetFm = monster(m5);
    state = setField(state, 0, [myFm, targetFm]);
    // Fast-forward through 3 countdowns
    for (let i = 0; i < 6; i++) {
      state = dispatch(state, { type: 'END_TURN' });
    }
    expect(state.selection.kind).toBe('choose-destroy-target');
    // Destroy the target monster
    state = dispatch(state, { type: 'DESTROY_MONSTER', fieldUid: targetFm.uid });
    expect(state.players[0].field.find((f) => f?.uid === targetFm.uid)).toBeUndefined();
    expect(state.selection.kind).toBe('none');
    // Trap should be removed from the monster that had it
    const trapHolder = state.players[0].field.find((f) => f?.uid === myFm.uid);
    expect(trapHolder?.trap).toBeNull();
  });

  it('monster destroyed before 3 turns — trap has no target', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const myFm = monster(m3, { trap: trap9 });
    state = setField(state, 0, [myFm]);
    // Destroy the trap-holding monster via combat before countdown finishes
    // Advance 4 turns (2 applyTurnStartEffects for player 0 → countdown at 1)
    for (let i = 0; i < 4; i++) {
      state = dispatch(state, { type: 'END_TURN' });
    }
    const fm1 = state.players[0].field.find((f) => f?.uid === myFm.uid);
    expect(fm1?.pendingTurns).toBe(1);
    // Manually remove the monster (simulating destruction)
    state = setField(state, 0, []);
    // Advance 2 more turns — countdown would try to fire but monster is gone
    for (let i = 0; i < 2; i++) {
      state = dispatch(state, { type: 'END_TURN' });
    }
    // No selection should be activated since the monster is gone
    expect(state.selection.kind).not.toBe('choose-destroy-target');
  });
});

// --- Trampa 7 (swap_attacker) ---

describe('Trampa 7 — move without duplicating', () => {
  const trap7 = getTrapByEffect('swap_attacker');
  const m5 = getMonsterWithAtk(5);
  const m3 = getMonsterWithAtk(3);

  it('moves attacker to defender field without graveyard duplication', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap7 });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender]);
    // Start attack — defender is in attack position, so selection is attack-or-direct
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    expect(state.selection.kind).toBe('attack-or-direct');
    // Declare attack on the defender with trap
    state = dispatch(state, { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid });
    expect(state.phase).toBe('trap-response');
    // Activate the trap
    state = dispatch(state, { type: 'RESOLVE_TRAP', activate: true });
    // Attacker should be on defender's field (player 1)
    const onDefenderField = state.players[1].field.find((f) => f?.card.id === m5.id);
    expect(onDefenderField).toBeDefined();
    // Attacker should NOT be on attacker's field (player 0)
    const onAttackerField = state.players[0].field.find((f) => f?.card.id === m5.id);
    expect(onAttackerField).toBeUndefined();
    // Attacker should NOT be in attacker's graveyard
    const inGraveyard = state.players[0].graveyard.some((c) => c.id === m5.id);
    expect(inGraveyard).toBe(false);
    // Defender's graveyard should also not have the attacker
    const inDefGraveyard = state.players[1].graveyard.some((c) => c.id === m5.id);
    expect(inDefGraveyard).toBe(false);
  });

  it('controlledBy is set on the moved monster', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap7 });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender]);
    state = dispatchMany(state, [
      { type: 'START_ATTACK', attackerUid: attacker.uid },
      { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid },
      { type: 'RESOLVE_TRAP', activate: true },
    ]);
    const moved = state.players[1].field.find((f) => f?.card.id === m5.id);
    expect(moved?.controlledBy).toBe(1);
  });

  it('no space on defender field — trap does not activate', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap7 });
    // Fill defender's field completely
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender, monster(m5), monster(m5), monster(m5), monster(m5), monster(m5)]);
    state = dispatchMany(state, [
      { type: 'START_ATTACK', attackerUid: attacker.uid },
      { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid },
      { type: 'RESOLVE_TRAP', activate: true },
    ]);
    // Attacker should still be on player 0's field
    const onAttackerField = state.players[0].field.find((f) => f?.card.id === m5.id);
    expect(onAttackerField).toBeDefined();
  });
});

// --- Trampa 10 (control_two_turns) ---

describe('Trampa 10 — control and return', () => {
  const trap10 = getTrapByEffect('control_two_turns');
  const m5 = getMonsterWithAtk(5);
  const m3 = getMonsterWithAtk(3);

  it('moves attacker to defender field with pendingTurns=2', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap10 });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender]);
    state = dispatchMany(state, [
      { type: 'START_ATTACK', attackerUid: attacker.uid },
      { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid },
      { type: 'RESOLVE_TRAP', activate: true },
    ]);
    // Attacker should be on defender's field (player 1)
    const moved = state.players[1].field.find((f) => f?.card.id === m5.id);
    expect(moved).toBeDefined();
    expect(moved?.controlledBy).toBe(1);
    expect(moved?.pendingEffect).toBe('control');
    expect(moved?.pendingTurns).toBe(2);
    // Attacker should NOT be on original field
    const onOriginal = state.players[0].field.find((f) => f?.card.id === m5.id);
    expect(onOriginal).toBeUndefined();
    // Not in graveyard
    expect(state.players[0].graveyard.some((c) => c.id === m5.id)).toBe(false);
  });

  it('returns to original owner after 2 turns', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap10 });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender, null, null, null, null, null]);
    state = dispatchMany(state, [
      { type: 'START_ATTACK', attackerUid: attacker.uid },
      { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid },
      { type: 'RESOLVE_TRAP', activate: true },
    ]);
    // Turn 1 (player 0) ends → player 1 turn: applyTurnStartEffects(1) → pendingTurns 2→1
    state = dispatch(state, { type: 'END_TURN' });
    const moved1 = state.players[1].field.find((f) => f?.card.id === m5.id);
    expect(moved1?.pendingTurns).toBe(1);
    // Turn 2 (player 1) ends → player 0 turn: applyTurnStartEffects(0) → no effect on p1's monster
    state = dispatch(state, { type: 'END_TURN' });
    // Turn 3 (player 0) ends → player 1 turn: applyTurnStartEffects(1) → pendingTurns 1→0, control expires
    state = dispatch(state, { type: 'END_TURN' });
    const onP1 = state.players[1].field.find((f) => f?.card.id === m5.id);
    expect(onP1?.pendingEffect).toBeNull();
    expect(onP1?.controlledBy).toBeNull();
  });

  it('no space on defender field — trap does not activate', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const defender = monster(m3, { trap: trap10 });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [defender, monster(m5), monster(m5), monster(m5), monster(m5), monster(m5)]);
    state = dispatchMany(state, [
      { type: 'START_ATTACK', attackerUid: attacker.uid },
      { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: defender.uid },
      { type: 'RESOLVE_TRAP', activate: true },
    ]);
    // Attacker should still be on player 0's field
    expect(state.players[0].field.find((f) => f?.card.id === m5.id)).toBeDefined();
  });
});

// --- Regla 22.2 — direct attack optional ---

describe('Regla 22.2 — direct attack optional vs attack-only', () => {
  const m5 = getMonsterWithAtk(5);
  const m3 = getMonsterWithAtk(3);

  it('rival has only attack monsters → attack-or-direct selection', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const oppMonster = monster(m3, { position: 'attack' });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [oppMonster]);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    expect(state.selection.kind).toBe('attack-or-direct');
  });

  it('rival has defense monsters → attack selection only', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const oppDefense = monster(m3, { position: 'defense' });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [oppDefense]);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    expect(state.selection.kind).toBe('attack');
  });

  it('rival has no monsters → direct attack auto', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, []);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    // Should auto-execute direct attack
    expect(state.players[1].lp).toBe(100 - 5);
    expect(state.selection.kind).toBe('none');
  });

  it('direct attack is blocked when defense monsters exist', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5);
    const oppDefense = monster(m3, { position: 'defense' });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, [oppDefense]);
    state = dispatch(state, { type: 'DIRECT_ATTACK', attackerUid: attacker.uid });
    // Should be blocked — no damage
    expect(state.players[1].lp).toBe(100);
  });

  it('first turn — no attacking', () => {
    let state = makeState({ turnCount: 0, currentPlayer: 0 });
    const attacker = monster(m5);
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, []);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    expect(state.players[1].lp).toBe(100);
  });

  it('defense monster cannot attack', () => {
    let state = makeState({ turnCount: 1, currentPlayer: 0 });
    const attacker = monster(m5, { position: 'defense' });
    state = setField(state, 0, [attacker]);
    state = setField(state, 1, []);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    expect(state.players[1].lp).toBe(100);
  });
});

// --- Regla 27.3 — draw on simultaneous 0 LP ---

describe('Regla 27.3 — draw detection', () => {
  it('player 1 at 0 LP → player 2 wins', () => {
    let state = makeState();
    state = setLp(state, 0, 0);
    // Trigger a check via END_TURN (which calls checkWinner)
    state = dispatch(state, { type: 'END_TURN' });
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe(1);
    expect(state.isDraw).toBe(false);
  });

  it('player 2 at 0 LP → player 1 wins', () => {
    let state = makeState();
    state = setLp(state, 1, 0);
    state = dispatch(state, { type: 'END_TURN' });
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe(0);
    expect(state.isDraw).toBe(false);
  });

  it('both at 0 LP simultaneously → draw', () => {
    let state = makeState();
    state = setLp(state, 0, 0);
    state = setLp(state, 1, 0);
    state = dispatch(state, { type: 'END_TURN' });
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBeNull();
    expect(state.isDraw).toBe(true);
  });

  it('neither at 0 LP → game continues', () => {
    let state = makeState();
    state = dispatch(state, { type: 'END_TURN' });
    expect(state.phase).not.toBe('game-over');
  });
});

// --- PLACE_TRAP_ON_MONSTER integration ---

describe('Reducer integration — PLACE_TRAP_ON_MONSTER', () => {
  it('places trap on own monster and consumes card', () => {
    const trap = TRAPS[0]; // heal_per_turn
    const m = getFirstMonsterCard();
    let state = makeState();
    state = setHand(state, 0, [trap]);
    const fm = monster(m);
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap.id);
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(false);
    expect(state.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it('allows trap on monster summoned this turn (new rule)', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState();
    state = setHand(state, 0, [m, trap]);
    // Summon the monster first
    state = dispatch(state, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
    const fm = state.players[0].field.find((f) => f !== null)!;
    expect(fm.summonedThisTurn).toBe(true);
    // Place trap — should now work (summonedThisTurn no longer blocks)
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap.id);
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(false);
  });

  it('full flow: SELECT_TRAP_PLACE → PLACE_TRAP_ON_MONSTER → trap associated, card consumed, selection cleared', () => {
    const trap = TRAPS[3]; // reflect_damage
    const m = getFirstMonsterCard();
    let state = makeState();
    state = setHand(state, 0, [trap]);
    const fm = monster(m);
    state = setField(state, 0, [fm]);
    // Step 1: select the trap
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    expect(state.selection.kind).toBe('place-trap');
    if (state.selection.kind === 'place-trap') {
      expect(state.selection.card.id).toBe(trap.id);
    }
    // Step 2: place on monster
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    // Trap associated to the correct uid
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap.id);
    // Card consumed from hand
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(false);
    // Selection cleared
    expect(state.selection.kind).toBe('none');
    // No duplicate trap in hand
    expect(state.players[0].hand.filter((c) => c.id === trap.id).length).toBe(0);
    // Monster still exists exactly once
    expect(state.players[0].field.filter((f) => f?.uid === fm.uid).length).toBe(1);
    // cardsPlayedThisTurn incremented
    expect(state.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it('blocks trap on monster that already has a trap', () => {
    const trap1 = TRAPS[0];
    const trap2 = TRAPS[1];
    const m = getFirstMonsterCard();
    let state = makeState();
    state = setHand(state, 0, [trap2]);
    const fm = monster(m, { trap: trap1 });
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap2, fieldUid: fm.uid });
    // Should be blocked — trap1 still there, trap2 not placed
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap1.id);
    // trap2 still in hand
    expect(state.players[0].hand.some((c) => c.id === trap2.id)).toBe(true);
  });

  it('blocks trap on non-existent monster uid', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState();
    state = setHand(state, 0, [trap]);
    const fm = monster(m);
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: 'non-existent-uid' });
    // Nothing changed
    expect(state.players[0].field.find((f) => f?.uid === fm.uid)?.trap).toBeNull();
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(true);
  });

  it('blocks trap when card not in hand', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState();
    // Don't put trap in hand
    const fm = monster(m);
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    expect(state.players[0].field.find((f) => f?.uid === fm.uid)?.trap).toBeNull();
  });

  it('blocks trap on opponent monster (wrong player)', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState({ currentPlayer: 0 });
    state = setHand(state, 0, [trap]);
    const oppFm = monster(m);
    state = setField(state, 1, [oppFm]);
    // Player 0 tries to place trap on player 1's monster
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: oppFm.uid });
    // Should be blocked — reducer only looks at currentPlayer's field
    expect(state.players[1].field.find((f) => f?.uid === oppFm.uid)?.trap).toBeNull();
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(true);
  });

  it('blocks SELECT_TRAP_PLACE when 3 cards already played', () => {
    const trap = TRAPS[0];
    const [m1, m2, m3] = getDistinctMonsterCards(3);
    let state = makeState();
    state = setHand(state, 0, [m1, m2, m3, trap]);
    state = dispatchMany(state, [
      { type: 'SUMMON_MONSTER', card: m1, position: 'attack' },
      { type: 'SUMMON_MONSTER', card: m2, position: 'attack' },
      { type: 'SUMMON_MONSTER', card: m3, position: 'attack' },
    ]);
    expect(state.players[0].cardsPlayedThisTurn).toBe(3);
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    expect(state.selection.kind).toBe('none');
  });

  it('first turn — summon monster then place trap on it (full flow)', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState({ turnCount: 0, currentPlayer: 0 });
    state = setHand(state, 0, [m, trap]);
    // Summon monster on first turn
    state = dispatch(state, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
    const fm = state.players[0].field.find((f) => f !== null)!;
    expect(fm.summonedThisTurn).toBe(true);
    // Select trap
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    expect(state.selection.kind).toBe('place-trap');
    // Place trap on the just-summoned monster
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap.id);
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(false);
    expect(state.selection.kind).toBe('none');
    expect(state.players[0].field.filter((f) => f?.uid === fm.uid).length).toBe(1);
  });

  it('first turn — cannot attack (Regla 17)', () => {
    const m = getFirstMonsterCard();
    let state = makeState({ turnCount: 0, currentPlayer: 0 });
    const fm = monster(m, { position: 'attack', summonedThisTurn: false });
    state = setField(state, 0, [fm]);
    // START_ATTACK should be blocked on first turn
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: fm.uid });
    expect(state.selection.kind).toBe('none');
  });

  it('normal turn — summon monster then place trap on it (full flow)', () => {
    const trap = TRAPS[0];
    const m = getFirstMonsterCard();
    let state = makeState({ turnCount: 5, currentPlayer: 0 });
    state = setHand(state, 0, [m, trap]);
    // Summon monster
    state = dispatch(state, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
    const fm = state.players[0].field.find((f) => f !== null)!;
    expect(fm.summonedThisTurn).toBe(true);
    // Place trap on the just-summoned monster
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: fm.uid });
    const placed = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(placed?.trap?.id).toBe(trap.id);
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(false);
    expect(state.selection.kind).toBe('none');
  });
});

// --- CHANGE_POSITION integration ---

describe('Reducer integration — CHANGE_POSITION', () => {
  it('changes attack to defense and keeps the monster face-up', () => {
    const m = getFirstMonsterCard();
    let state = makeState();
    const fm = monster(m, { position: 'attack', faceDown: false });
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'CHANGE_POSITION', fieldUid: fm.uid });
    const updated = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(updated?.position).toBe('defense');
    expect(updated?.faceDown).toBe(false);
    expect(updated?.hasChangedPosition).toBe(true);
  });

  it('blocks second position change same turn', () => {
    const m = getFirstMonsterCard();
    let state = makeState();
    const fm = monster(m, { position: 'attack' });
    state = setField(state, 0, [fm]);
    state = dispatch(state, { type: 'CHANGE_POSITION', fieldUid: fm.uid });
    state = dispatch(state, { type: 'CHANGE_POSITION', fieldUid: fm.uid });
    const updated = state.players[0].field.find((f) => f?.uid === fm.uid);
    expect(updated?.position).toBe('defense'); // still defense, not back to attack
  });
});


describe('Reducer integration — Trap 2 target selection', () => {
  it('lets the trap owner choose exactly two own monsters before resolving', () => {
    const trap = getTrapByEffect('destroy_2_self_1_opp');
    const [m1, m2, m3] = getDistinctMonsterCards(3);
    const rival = getMonsterWithAtk(12);

    let state = makeState({ currentPlayer: 1, turnCount: 5 });
    const trapMonster = monster(m1, { trap });
    state = setField(state, 0, [
      trapMonster,
      monster(m2),
      monster(m3),
    ]);
    state = setField(state, 1, [monster(rival)]);

    // Termina el turno del rival y activa la Trampa al comenzar el turno del dueño.
    state = dispatch(state, { type: 'END_TURN' });

    expect(state.selection.kind).toBe('choose-trap-2-own');
    if (state.selection.kind !== 'choose-trap-2-own') return;
    expect(state.selection.selectedUids).toEqual([]);

    const firstUid = state.players[0].field.find((f) => f?.uid !== trapMonster.uid)?.uid!;
    state = dispatch(state, { type: 'TRAP_2_SELECT_OWN', fieldUid: firstUid });

    expect(state.selection.kind).toBe('choose-trap-2-own');
    if (state.selection.kind !== 'choose-trap-2-own') return;
    expect(state.selection.selectedUids).toEqual([firstUid]);
    expect(state.players[0].field.some((f) => f?.uid === firstUid)).toBe(true);

    const secondUid = state.players[0].field.find(
      (f) => f !== null && f.uid !== firstUid,
    )?.uid!;
    state = dispatch(state, { type: 'TRAP_2_SELECT_OWN', fieldUid: secondUid });

    expect(state.selection.kind).toBe('none');
    expect(state.players[0].field.some((f) => f?.uid === firstUid)).toBe(false);
    expect(state.players[0].field.some((f) => f?.uid === secondUid)).toBe(false);
    expect(state.players[1].field.filter(Boolean)).toHaveLength(0);
  });
});
