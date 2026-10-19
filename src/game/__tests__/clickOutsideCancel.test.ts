import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import type { GameState, Action, FieldMonster } from '../types';
import { createPlayer, drawCards } from '../types';
import { buildDeck, TRAPS, MAGICS, type MonsterCard, type TrapCard, type MagicCard } from '../cardData';

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

function getMonsterWithAtk(atk: number): MonsterCard {
  const deck = buildDeck();
  return deck.filter((c): c is MonsterCard => c.type === 'monster').find((c) => c.atk === atk)!;
}

function getFirstTrapCard(): TrapCard {
  return TRAPS[0];
}

function getFieldMagicCard(): MagicCard {
  return MAGICS.find((m) => m.placement === 'field')!;
}

function setField(state: GameState, playerIdx: 0 | 1, monsters: (FieldMonster | null)[]): GameState {
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[playerIdx] = { ...players[playerIdx], field: [...monsters, ...Array(6 - monsters.length).fill(null)] as (FieldMonster | null)[] };
  return { ...state, players };
}

function setHand(state: GameState, playerIdx: 0 | 1, cards: typeof state.players[0]['hand']): GameState {
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[playerIdx] = { ...players[playerIdx], hand: cards };
  return { ...state, players };
}

function stateWithTrapAndOwnMonster(trap: TrapCard): GameState {
  let state = setHand(makeState(), 0, [trap]);
  state = setField(state, 0, [monster(getMonsterWithAtk(5))]);
  return state;
}

function dispatch(state: GameState, action: Action): GameState {
  return reducer(state, action);
}

// --- Tests ---

describe('CANCEL_SELECTION — barra de ataque', () => {
  it('cancela la selección de ataque con CANCEL_SELECTION', () => {
    const m5 = getMonsterWithAtk(5);
    const m3 = getMonsterWithAtk(3);
    const myFm = monster(m5);
    const oppFm = monster(m3);
    let state = setField(makeState(), 0, [myFm]);
    state = setField(state, 1, [oppFm]);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: myFm.uid });
    expect(state.selection.kind).toBe('attack-or-direct');

    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');
  });

  it('cancelar el ataque no marca al monstruo como que ya atacó', () => {
    const m5 = getMonsterWithAtk(5);
    const m3 = getMonsterWithAtk(3);
    const myFm = monster(m5);
    const oppFm = monster(m3);
    let state = setField(makeState(), 0, [myFm]);
    state = setField(state, 1, [oppFm]);
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: myFm.uid });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });

    const fm = state.players[0].field.find((f) => f?.uid === myFm.uid);
    expect(fm?.hasAttacked).toBe(false);
  });

  it('cancelar el ataque no causa daño ni cambia LP', () => {
    const m5 = getMonsterWithAtk(5);
    const m3 = getMonsterWithAtk(3);
    const myFm = monster(m5);
    const oppFm = monster(m3);
    let state = setField(makeState(), 0, [myFm]);
    state = setField(state, 1, [oppFm]);
    const lpBefore = state.players[1].lp;
    state = dispatch(state, { type: 'START_ATTACK', attackerUid: myFm.uid });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[1].lp).toBe(lpBefore);
  });
});

describe('CANCEL_SELECTION — selección de objetivo de Trampa', () => {
  it('cancela la selección de colocación de trampa', () => {
    const trap = getFirstTrapCard();
    let state = stateWithTrapAndOwnMonster(trap);
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    expect(state.selection.kind).toBe('place-trap');

    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');
  });

  it('cancelar no consume la carta de trampa de la mano', () => {
    const trap = getFirstTrapCard();
    let state = stateWithTrapAndOwnMonster(trap);
    const handBefore = state.players[0].hand.length;
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].hand.length).toBe(handBefore);
    expect(state.players[0].hand.some((c) => c.id === trap.id)).toBe(true);
  });

  it('cancelar no incrementa cardsPlayedThisTurn', () => {
    const trap = getFirstTrapCard();
    let state = stateWithTrapAndOwnMonster(trap);
    const playedBefore = state.players[0].cardsPlayedThisTurn;
    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].cardsPlayedThisTurn).toBe(playedBefore);
  });
});

describe('CANCEL_SELECTION — selección de objetivo de Mágica', () => {
  // Regla 5: la Mágica de campo necesita un objetivo legal para abrir la
  // selección. `makeState()` arranca con los dos campos vacíos, así que estos
  // tests colocan un Monstruo propio antes de activar la Mágica.
  function stateWithOwnMonster(magic: MagicCard): GameState {
    let s = setHand(makeState(), 0, [magic]);
    s = setField(s, 0, [monster(getMonsterWithAtk(3))]);
    return s;
  }

  it('cancela la selección de colocación de mágica', () => {
    const magic = getFieldMagicCard();
    let state = stateWithOwnMonster(magic);
    state = dispatch(state, { type: 'SELECT_MAGIC', card: magic });
    expect(state.selection.kind).toBe('place-magic');

    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');
  });

  it('cancelar no consume la carta mágica de la mano', () => {
    const magic = getFieldMagicCard();
    let state = stateWithOwnMonster(magic);
    const handBefore = state.players[0].hand.length;
    state = dispatch(state, { type: 'SELECT_MAGIC', card: magic });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].hand.length).toBe(handBefore);
    expect(state.players[0].hand.some((c) => c.id === magic.id)).toBe(true);
  });

  it('cancelar no incrementa cardsPlayedThisTurn', () => {
    const magic = getFieldMagicCard();
    let state = stateWithOwnMonster(magic);
    const playedBefore = state.players[0].cardsPlayedThisTurn;
    state = dispatch(state, { type: 'SELECT_MAGIC', card: magic });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].cardsPlayedThisTurn).toBe(playedBefore);
  });

  it('sin objetivo legal NO abre una selección imposible de resolver', () => {
    // Con ambos campos vacíos la Mágica de campo no tiene dónde colocarse.
    // Abrir la selección dejaría la partida en un estado pendiente que el
    // jugador no puede completar.
    const magic = getFieldMagicCard();
    let state = setHand(makeState(), 0, [magic]);

    state = dispatch(state, { type: 'SELECT_MAGIC', card: magic });

    expect(state.selection.kind).toBe('none');
    expect(state.players[0].hand.some((c) => c.id === magic.id)).toBe(true);
    expect(state.players[0].cardsPlayedThisTurn).toBe(0);
  });
});

describe('CANCEL_SELECTION — choose-destroy-target', () => {
  it('cancela la selección de destruir objetivo', () => {
    const m3 = getMonsterWithAtk(3);
    const myFm = monster(m3);
    let state = setField(makeState(), 0, [myFm]);
    state = { ...state, selection: { kind: 'choose-destroy-target', trapUid: myFm.uid } };
    expect(state.selection.kind).toBe('choose-destroy-target');

    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');
  });

  it('cancelar no destruye ningún monstruo del campo', () => {
    const m3 = getMonsterWithAtk(3);
    const m5 = getMonsterWithAtk(5);
    const myFm = monster(m3);
    const targetFm = monster(m5);
    let state = setField(makeState(), 0, [myFm, targetFm]);
    state = { ...state, selection: { kind: 'choose-destroy-target', trapUid: myFm.uid } };

    const fieldBefore = state.players[0].field.filter(Boolean).length;
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].field.filter(Boolean).length).toBe(fieldBefore);
  });
});

describe('CANCEL_SELECTION — no altera el estado de la partida', () => {
  it('no cambia el jugador actual', () => {
    let state = makeState();
    const cpBefore = state.currentPlayer;
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.currentPlayer).toBe(cpBefore);
  });

  it('no cambia el turno', () => {
    let state = makeState();
    const turnBefore = state.turnCount;
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.turnCount).toBe(turnBefore);
  });

  it('no cambia la fase', () => {
    let state = makeState({ phase: 'playing' });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.phase).toBe('playing');
  });

  it('no cambia los LP de ningún jugador', () => {
    let state = makeState();
    const lp0 = state.players[0].lp;
    const lp1 = state.players[1].lp;
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].lp).toBe(lp0);
    expect(state.players[1].lp).toBe(lp1);
  });

  it('no cambia el campo de ningún jugador', () => {
    const m5 = getMonsterWithAtk(5);
    const myFm = monster(m5);
    let state = setField(makeState(), 0, [myFm]);
    const fieldBefore = state.players[0].field.filter(Boolean).length;
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.players[0].field.filter(Boolean).length).toBe(fieldBefore);
  });
});

describe('CANCEL_SELECTION — acciones válidas siguen funcionando tras cancelar', () => {
  it('tras cancelar una selección de trampa, se puede seguir jugando', () => {
    const trap = getFirstTrapCard();
    const m5 = getMonsterWithAtk(5);
    const myFm = monster(m5);
    let state = setField(setHand(makeState(), 0, [trap]), 0, [myFm]);

    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');

    state = dispatch(state, { type: 'SELECT_TRAP_PLACE', card: trap });
    expect(state.selection.kind).toBe('place-trap');

    state = dispatch(state, { type: 'PLACE_TRAP_ON_MONSTER', card: trap, fieldUid: myFm.uid });
    expect(state.selection.kind).toBe('none');
    const fm = state.players[0].field.find((f) => f?.uid === myFm.uid);
    expect(fm?.trap).not.toBeNull();
    expect(fm?.trap?.id).toBe(trap.id);
  });

  it('tras cancelar un ataque, se puede volver a atacar', () => {
    const m5 = getMonsterWithAtk(5);
    const m3 = getMonsterWithAtk(3);
    const myFm = monster(m5);
    const oppFm = monster(m3);
    let state = setField(makeState(), 0, [myFm]);
    state = setField(state, 1, [oppFm]);

    state = dispatch(state, { type: 'START_ATTACK', attackerUid: myFm.uid });
    state = dispatch(state, { type: 'CANCEL_SELECTION' });
    expect(state.selection.kind).toBe('none');

    state = dispatch(state, { type: 'START_ATTACK', attackerUid: myFm.uid });
    expect(state.selection.kind).toBe('attack-or-direct');

    state = dispatch(state, { type: 'DECLARE_ATTACK', attackerUid: myFm.uid, defenderUid: oppFm.uid });
    expect(state.selection.kind).toBe('none');
  });
});
