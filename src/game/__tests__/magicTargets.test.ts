import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import { canActivateMagic, magicRequiredSide } from '../types';
import type { Action, GameState, FieldMonster, PlayerState } from '../types';
import { createPlayer } from '../types';
import type { MagicCard } from '../cardData';
import { MAGICS } from '../cardData';

/**
 * REGLA 5 — Colocación de las Mágicas de campo.
 *
 * Texto oficial: «Como regla general, una Mágica asociada se coloca sobre un
 * Monstruo propio, salvo que su efecto indique expresamente otra cosa. La Mágica
 * 8 es una excepción: se coloca sobre un Monstruo rival.»
 *
 * Por tanto:
 *   - Mágica 4 (+2 ATQ)          → solo Monstruo PROPIO.
 *   - Mágica 9 (protección dado) → solo Monstruo PROPIO.
 *   - Mágica 8 (-2 DEF)          → solo Monstruo RIVAL.
 *
 * Y si una Mágica exige objetivo y no existe ningún objetivo legal, NO debe:
 * consumirse, gastar cuota, registrar un éxito falso ni dejar un estado
 * pendiente imposible de resolver.
 */

let seq = 0;
const uid = () => `uid-${(seq += 1)}`;

function monster(id: string, atk = 5, def = 5) {
  return {
    id,
    type: 'monster' as const,
    suit: 'espadas' as const,
    number: atk,
    name: id,
    atk,
    def,
    image: '',
    owner: 0 as const,
  };
}

function fm(card: ReturnType<typeof monster>, overrides: Partial<FieldMonster> = {}): FieldMonster {
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

function byId(id: string): MagicCard {
  return MAGICS.find((m) => m.id === id)!;
}

const M4 = () => byId('m4'); // +2 ATQ  → propio
const M8 = () => byId('m8'); // -2 DEF  → rival
const M9 = () => byId('m9'); // dado    → propio

function player(index: 0 | 1, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    ...createPlayer(index, `Jugador ${index + 1}`, []),
    deck: [],
    hand: [],
    field: [null, null, null, null, null, null],
    ...overrides,
  };
}

function makeState(
  p0: PlayerState,
  p1: PlayerState,
  currentPlayer: 0 | 1 = 0,
): GameState {
  return {
    ...initialState(),
    phase: 'playing',
    mode: 'local',
    turnCount: 2,
    currentPlayer,
    players: [p0, p1],
  };
}

function run(s: GameState, ...a: Action[]): GameState {
  return a.reduce((acc, act) => reducer(acc, act), s);
}

const lastLog = (s: GameState) => s.log[s.log.length - 1] ?? '';

// ==========================================================================
// magicRequiredSide
// ==========================================================================

describe('Regla 5 — magicRequiredSide', () => {
  it('Mágicas 4 y 9 exig Monstruo propio; la 8 exige rival', () => {
    expect(magicRequiredSide(M4())).toBe('self');
    expect(magicRequiredSide(M9())).toBe('self');
    expect(magicRequiredSide(M8())).toBe('enemy');
  });

  it('las Mágicas sin objetivo no imponen lado', () => {
    expect(magicRequiredSide(byId('m10'))).toBeNull();
    expect(magicRequiredSide(byId('m2'))).toBeNull();
  });
});

// ==========================================================================
// canActivateMagic — NO debe devolver true si el único objetivo es del lado
// equivocado.
// ==========================================================================

describe('Regla 5 — canActivateMagic respeta el lado del objetivo', () => {
  const ownOnly = fm(monster('mio'), { uid: 'mio' });
  const enemyOnly = fm(monster('rival', 5, 5), { uid: 'rival' });

  it('M4 solo es activable con un Monstruo PROPIO libre de Mágica', () => {
    const conPropio = makeState(player(0, { field: [ownOnly] }), player(1, { field: [enemyOnly] }));
    expect(canActivateMagic(conPropio.players[0], conPropio, M4())).toBe(true);

    const soloRival = makeState(player(0, {}), player(1, { field: [enemyOnly] }));
    expect(canActivateMagic(soloRival.players[0], soloRival, M4())).toBe(false);
  });

  it('M9 solo es activable con un Monstruo PROPIO libre de Mágica', () => {
    const conPropio = makeState(player(0, { field: [ownOnly] }), player(1, { field: [enemyOnly] }));
    expect(canActivateMagic(conPropio.players[0], conPropio, M9())).toBe(true);

    const soloRival = makeState(player(0, {}), player(1, { field: [enemyOnly] }));
    expect(canActivateMagic(soloRival.players[0], soloRival, M9())).toBe(false);
  });

  it('M8 solo es activable con un Monstruo RIVAL libre de Mágica', () => {
    const conRival = makeState(player(0, { field: [ownOnly] }), player(1, { field: [enemyOnly] }));
    expect(canActivateMagic(conRival.players[0], conRival, M8())).toBe(true);

    const soloPropio = makeState(player(0, { field: [ownOnly] }), player(1, {}));
    expect(canActivateMagic(soloPropio.players[0], soloPropio, M8())).toBe(false);
  });

  it('un Monstruo que ya tiene Mágica no es objetivo válido (Regla 4/5)', () => {
    const conM4 = fm(monster('ya-magico'), { uid: 'ya', magic: M4() });
    const s = makeState(player(0, { field: [conM4] }), player(1, {}));
    expect(canActivateMagic(s.players[0], s, M4())).toBe(false);
    expect(canActivateMagic(s.players[0], s, M9())).toBe(false);
  });
});

// ==========================================================================
// SELECT_MAGIC — no abrir una selección imposible
// ==========================================================================

describe('Regla 5 — SELECT_MAGIC no abre una selección imposible', () => {
  it('M4 sin Monstruo propio no abre selección ni se consume', () => {
    let s = makeState(player(0, { hand: [M4()] }), player(1, { field: [fm(monster('r'))] }));
    s = run(s, { type: 'SELECT_MAGIC', card: M4() });

    expect(s.selection.kind).toBe('none');
    expect(s.players[0].hand.some((c) => c.id === 'm4')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(lastLog(s)).toContain('no se utiliza');
  });

  it('M9 sin Monstruo propio no abre selección ni se consume', () => {
    let s = makeState(player(0, { hand: [M9()] }), player(1, {}));
    s = run(s, { type: 'SELECT_MAGIC', card: M9() });

    expect(s.selection.kind).toBe('none');
    expect(s.players[0].hand.some((c) => c.id === 'm9')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
  });

  it('M8 sin Monstruo rival no abre selección ni se consume', () => {
    let s = makeState(player(0, { hand: [M8()], field: [fm(monster('mio'))] }), player(1, {}));
    s = run(s, { type: 'SELECT_MAGIC', card: M8() });

    expect(s.selection.kind).toBe('none');
    expect(s.players[0].hand.some((c) => c.id === 'm8')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(lastLog(s)).toContain('rival no tiene');
  });

  it('M8 SÍ abre selección cuando hay un Monstruo rival', () => {
    let s = makeState(player(0, { hand: [M8()] }), player(1, { field: [fm(monster('r'))] }));
    s = run(s, { type: 'SELECT_MAGIC', card: M8() });
    expect(s.selection.kind).toBe('place-magic');
    expect(s.players[0].cardsPlayedThisTurn).toBe(0); // aún no se consume
  });
});

// ==========================================================================
// PLACE_MAGIC_ON_MONSTER — el lado equivocado se rechaza
// ==========================================================================

describe('Regla 5 — el lado equivocado se rechaza sin consumir la Mágica', () => {
  it('M4 sobre un Monstruo RIVAL no se resuelve', () => {
    const rival = fm(monster('rival'), { uid: 'rival' });
    let s = makeState(player(0, { hand: [M4()] }), player(1, { field: [rival] }));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M4(), side: 'enemy', fieldUid: 'rival' });

    expect(s.players[1].field[0]!.magic).toBeNull();
    expect(s.players[0].hand.some((c) => c.id === 'm4')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(lastLog(s)).toContain('PROPIO');
    expect(lastLog(s)).not.toContain('ATQ colocada');
  });

  it('M9 sobre un Monstruo RIVAL no se resuelve', () => {
    const rival = fm(monster('rival'), { uid: 'rival' });
    let s = makeState(player(0, { hand: [M9()] }), player(1, { field: [rival] }));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M9(), side: 'enemy', fieldUid: 'rival' });

    expect(s.players[1].field[0]!.diceProtection).toBe(false);
    expect(s.players[1].field[0]!.magic).toBeNull();
    expect(s.players[0].hand.some((c) => c.id === 'm9')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
  });

  it('M8 sobre un Monstruo PROPIO no se resuelve', () => {
    const propio = fm(monster('mio'), { uid: 'mio' });
    let s = makeState(player(0, { hand: [M8()], field: [propio] }), player(1, {}));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M8(), side: 'self', fieldUid: 'mio' });

    expect(s.players[0].field[0]!.magic).toBeNull();
    expect(s.players[0].field[0]!.tempDefModifier).toBe(0);
    expect(s.players[0].hand.some((c) => c.id === 'm8')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(lastLog(s)).toContain('RIVAL');
    expect(lastLog(s)).not.toContain('DEF colocada');
  });

  it('un targetUid inexistente no se consume ni registra éxito', () => {
    const propio = fm(monster('mio'), { uid: 'mio' });
    let s = makeState(player(0, { hand: [M4()], field: [propio] }), player(1, {}));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M4(), side: 'self', fieldUid: 'fantasma' });

    expect(s.players[0].field[0]!.magic).toBeNull();
    expect(s.players[0].hand.some((c) => c.id === 'm4')).toBe(true);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(lastLog(s)).not.toContain('ATQ colocada');
    expect(lastLog(s)).toContain('ya no está en el campo');
  });

  it('un Monstruo que ya tiene Mágica no admite una segunda', () => {
    const conM4 = fm(monster('ya'), { uid: 'ya', magic: M4(), tempAtkModifier: 2 });
    let s = makeState(player(0, { hand: [M9()], field: [conM4] }), player(1, {}));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M9(), side: 'self', fieldUid: 'ya' });

    expect(s.players[0].field[0]!.magic?.id).toBe('m4');
    expect(s.players[0].hand.some((c) => c.id === 'm9')).toBe(true);
    expect(lastLog(s)).toContain('ya tiene una Mágica');
  });
});

// ==========================================================================
// Casos válidos: la Mágica SÍ se coloca y SÍ se consume
// ==========================================================================

describe('Regla 5 — colocación correcta', () => {
  it('M4 sobre Monstruo PROPIO: +2 ATQ y se consume', () => {
    const propio = fm(monster('mio', 6), { uid: 'mio' });
    let s = makeState(player(0, { hand: [M4()], field: [propio] }), player(1, {}));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M4(), side: 'self', fieldUid: 'mio' });

    expect(s.players[0].field[0]!.magic?.id).toBe('m4');
    expect(s.players[0].field[0]!.tempAtkModifier).toBe(2);
    expect(s.players[0].hand.some((c) => c.id === 'm4')).toBe(false);
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
    expect(lastLog(s)).toContain('+2 ATQ colocada');
  });

  it('M9 sobre Monstruo PROPIO: protección por dado y se consume', () => {
    const propio = fm(monster('mio'), { uid: 'mio' });
    let s = makeState(player(0, { hand: [M9()], field: [propio] }), player(1, {}));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M9(), side: 'self', fieldUid: 'mio' });

    expect(s.players[0].field[0]!.diceProtection).toBe(true);
    expect(s.players[0].hand.some((c) => c.id === 'm9')).toBe(false);
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it('M8 sobre Monstruo RIVAL: -2 DEF y se consume', () => {
    const rival = fm(monster('rival'), { uid: 'rival' });
    let s = makeState(player(0, { hand: [M8()] }), player(1, { field: [rival] }));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M8(), side: 'enemy', fieldUid: 'rival' });

    expect(s.players[1].field[0]!.magic?.id).toBe('m8');
    expect(s.players[1].field[0]!.tempDefModifier).toBe(-2);
    expect(s.players[0].hand.some((c) => c.id === 'm8')).toBe(false);
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
    expect(lastLog(s)).toContain('-2 DEF colocada');
  });

  it('el lado se deduce del propio uid, no del argumento `side`', () => {
    // Aunque la acción mienta sobre el lado, el Monstruo manda (Regla 5).
    const rival = fm(monster('rival'), { uid: 'rival' });
    let s = makeState(player(0, { hand: [M4()] }), player(1, { field: [rival] }));
    s = run(s, { type: 'PLACE_MAGIC_ON_MONSTER', card: M4(), side: 'self', fieldUid: 'rival' });
    expect(s.players[1].field[0]!.magic).toBeNull();
    expect(s.players[0].hand.some((c) => c.id === 'm4')).toBe(true);
  });
});

// ==========================================================================
// La Mágica no puede dejar la partida en un estado pendiente imposible
// ==========================================================================

describe('Regla 5 — sin estado pendiente imposible', () => {
  it('tras un rechazo la partida sigue en juego y sin selección', () => {
    let s = makeState(player(0, { hand: [M4()] }), player(1, {}));
    s = run(s, { type: 'SELECT_MAGIC', card: M4() });
    expect(s.selection.kind).toBe('none');
    expect(s.phase).toBe('playing');

    // Y se puede seguir jugando con normalidad.
    const draw = byId('m10');
    s = { ...s, players: [{ ...s.players[0], hand: [draw] }, s.players[1]] as [PlayerState, PlayerState] };
    s = run(s, { type: 'SELECT_MAGIC', card: draw });
    expect(s.selection.kind).toBe('none');
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
  });
});