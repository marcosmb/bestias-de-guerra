import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import {
  createPlayer,
  drawCards,
  instanceIdOf,
  cardInstanceKey,
  indexOfCardInstance,
  hasDuplicateIds,
  newInstanceId,
  ownerOf,
} from '../types';
import type { Action, GameState, PlayerState } from '../types';
import { buildDeck } from '../cardData';
import type { Card, MagicCard, MonsterCard } from '../cardData';

/**
 * IDENTIDAD DE INSTANCIA DE LAS CARTAS
 * ============================================================================
 *
 * Hay DOS identificadores distintos y no deben confundirse:
 *
 *   `card.id`         → identidad del TIPO de carta (Kraken, Araña, Mágica 8).
 *                       Es el mismo valor en las dos copias de la partida: una
 *                       por cada mazo.
 *
 *   `card.instanceId` → identidad de ESA copia física. Única e inmutable:
 *                       viaja con la carta de la mano al campo, al cementerio
 *                       o a la mano del rival sin cambiar jamás.
 *
 * Y un invariante que la Mágica 2 puede romper sin que sea un error:
 *
 *   · dos cartas con el MISMO `id` SÍ pueden coexistir en una mano (la copia
 *     propia y la que se ha robado al rival);
 *   · dos cartas con el MISMO `id` NUNCA pueden estar en un mismo mazo;
 *   · por eso la clave de React tiene que ser `instanceId`, no `id`, y por eso
 *     jugar una de las dos copias debe retirar solo esa copia.
 */

// ---------- Helpers ----------

const ARAÑA_ID = 'm-bastos-3';
const M2_ID = 'm2';

function game(): GameState {
  return { ...initialState(), phase: 'playing', mode: 'local', turnCount: 3 };
}

function run(s: GameState, ...actions: Action[]): GameState {
  return actions.reduce((acc, a) => reducer(acc, a), s);
}

/** Carta de un mazo REAL: ya viene con `owner` e `instanceId` sellados. */
function fromDeck(index: 0 | 1, cardId: string): Card {
  const p = createPlayer(index, `Jugador ${index + 1}`, buildDeck());
  const c = p.deck.find((x) => x.id === cardId);
  if (!c) throw new Error(`El mazo no contiene ${cardId}`);
  return c;
}

function withHands(p0: Card[], p1: Card[]): GameState {
  const base = game();
  const players: [PlayerState, PlayerState] = [
    { ...createPlayer(0, 'Jugador 1', []), hand: p0 },
    { ...createPlayer(1, 'Jugador 2', []), hand: p1 },
  ];
  return { ...base, players, currentPlayer: 0 };
}

interface Duplicado {
  state: GameState;
  /** Mi copia propia de la Araña (Jugador 1). */
  mia: MonsterCard;
  /** La copia del Jugador 2, ahora en mi mano tras la Mágica 2. */
  robada: MonsterCard;
  m2: MagicCard;
}

/**
 * Estado tras usar la Mágica 2 con un duplicado GARANTIZADO: el Jugador 2 solo
 * tiene una carta en la mano y es del mismo tipo que una del Jugador 1, así que
 * el robo (que elige al azar entre las del rival) solo puede tomar esa.
 */
function trasRobarDuplicado(): Duplicado {
  const mia = fromDeck(0, ARAÑA_ID) as MonsterCard;
  const m2 = fromDeck(0, M2_ID) as MagicCard;
  const robada = fromDeck(1, ARAÑA_ID) as MonsterCard;

  const antes = withHands([mia, m2], [robada]);
  const state = run(antes, { type: 'SELECT_MAGIC', card: m2 });
  return { state, mia, robada, m2 };
}

// ==========================================================================
// 1. Deducción explícita del modelo
// ==========================================================================

describe('MODELO DE CARTAS · qué es legal', () => {
  it('¿Puede haber dos cartas con el mismo id en una mano? → SÍ (Mágica 2)', () => {
    const { state } = trasRobarDuplicado();
    const arañas = state.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(arañas).toHaveLength(2);
    expect(hasDuplicateIds(state.players[0].hand)).toBe(true);
  });

  it('las dos copias tienen propietarios DISTINTOS', () => {
    const { state } = trasRobarDuplicado();
    const arañas = state.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(arañas.map(ownerOf).sort()).toEqual([0, 1]);
  });

  it('¿Puede haber dos cartas con el mismo id dentro de un mismo mazo? → NO', () => {
    for (const index of [0, 1] as const) {
      const mazo = createPlayer(index, `Jugador ${index + 1}`, buildDeck());
      expect(hasDuplicateIds(mazo.deck)).toBe(false);
      expect(new Set(mazo.deck.map((c) => c.id)).size).toBe(mazo.deck.length);
    }
  });

  it('los dos mazos tienen exactamente el mismo catálogo de tipos de carta', () => {
    // Por eso al robar la copia del rival el `id` coincide: es el mismo tipo.
    const a = createPlayer(0, 'J1', buildDeck()).deck.map((c) => c.id).sort();
    const b = createPlayer(1, 'J2', buildDeck()).deck.map((c) => c.id).sort();
    expect(a).toEqual(b);
  });

  it('¿Cada copia física tiene una identidad de instancia distinta? → SÍ', () => {
    const todas: Card[] = [];
    for (const index of [0, 1] as const) {
      const p = createPlayer(index, `Jugador ${index + 1}`, buildDeck());
      todas.push(...p.deck);
    }
    expect(todas.every((c) => instanceIdOf(c) !== null)).toBe(true);
    const ids = todas.map((c) => instanceIdOf(c));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('createPlayer genera instancias nuevas aunque se reutilice el mismo mazo', () => {
    const mazo = buildDeck();
    const a = createPlayer(0, 'J1', mazo);
    const b = createPlayer(1, 'J2', mazo);
    const porId = (p: PlayerState) =>
      p.deck.filter((c) => c.id === ARAÑA_ID).map((c) => instanceIdOf(c));
    // Son dos copias físicas distintas del mismo tipo: no pueden coincidir.
    expect(porId(a)[0]).not.toBe(porId(b)[0]);
  });

  it('newInstanceId nunca repite dentro de la sesión', () => {
    const generados = Array.from({ length: 5000 }, () => newInstanceId());
    expect(new Set(generados).size).toBe(generados.length);
  });
});

// ==========================================================================
// 2. La identidad viaja con la carta
// ==========================================================================

describe('IDENTIDAD DE INSTANCIA · viaja con la carta', () => {
  it('al robar, la copia conserva SU instanceId y NO cambia de propietario', () => {
    const { state, robada } = trasRobarDuplicado();
    const enMiMano = state.players[0].hand.find((c) => c.instanceId === robada.instanceId);

    expect(enMiMano).toBeDefined();
    expect(instanceIdOf(enMiMano!)).toBe(robada.instanceId);
    expect(ownerOf(enMiMano!)).toBe(1); // sigue siendo del Jugador 2
  });

  it('el id de tipo NO cambia: sigue siendo el mismo para las dos copias', () => {
    const { state } = trasRobarDuplicado();
    const arañas = state.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(arañas).toHaveLength(2);
    expect(arañas.every((c) => c.id === ARAÑA_ID)).toBe(true);
  });

  it('`owner` no se reescribe aunque la carta cambie de zona', () => {
    const { state, robada } = trasRobarDuplicado();
    const enMiMano = state.players[0].hand.find((c) => c.instanceId === robada.instanceId)!;
    expect(ownerOf(enMiMano)).toBe(1);
  });
});

// ==========================================================================
// 3. Compatibilidad con React
// ==========================================================================

describe('REACT · clave por instancia', () => {
  it('las dos Arañas producen claves DISTINTAS para el `key=`', () => {
    const { state } = trasRobarDuplicado();
    const claves = state.players[0].hand.map(cardInstanceKey);
    // Esto es exactamente lo que React necesita: una clave única por nodo.
    expect(new Set(claves).size).toBe(state.players[0].hand.length);
    const arañas = state.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(cardInstanceKey(arañas[0])).not.toBe(cardInstanceKey(arañas[1]));
  });

  it('la clave de una carta no depende de su posición en la mano', () => {
    const { state } = trasRobarDuplicado();
    const antes = state.players[0].hand.map(cardInstanceKey);
    // Se reordena la mano al revés: las claves siguen siendo las mismas.
    const reordenada = [...state.players[0].hand].reverse();
    const despues = reordenada.map(cardInstanceKey);
    expect([...despues].sort()).toEqual([...antes].sort());
  });

  it('la clave no cambia aunque la mano cambie de jugador', () => {
    const { state, robada } = trasRobarDuplicado();
    const enLaMiaDelRival = state.players[0].hand.find(
      (c) => c.instanceId === robada.instanceId,
    )!;
    expect(cardInstanceKey(enLaMiaDelRival)).toBe(cardInstanceKey(robada));
  });

  it('todas las cartas de la partida tienen clave única', () => {
    let s = game();
    s = run(s, { type: 'START_GAME', mode: 'local' });
    const todas: Card[] = [];
    for (const p of s.players) todas.push(...p.deck, ...p.hand, ...p.graveyard);
    const claves = todas.map(cardInstanceKey);
    expect(new Set(claves).size).toBe(todas.length);
  });
});

// ==========================================================================
// 4-5. Jugar una copia retira SOLO esa copia
// ==========================================================================

describe('JUGAR UNA COPIA · solo se retira la seleccionada', () => {
  it('invocar la copia ROBADA deja mi copia propia en la mano', () => {
    const { state, robada } = trasRobarDuplicado();
    expect(robada.type).toBe('monster');

    const s = run(state, { type: 'SUMMON_MONSTER', card: robada, position: 'attack' });

    const arañasRestantes = s.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(arañasRestantes).toHaveLength(1);
    expect(ownerOf(arañasRestantes[0])).toBe(0); // la MÍA sigue en la mano
    expect(arañasRestantes[0].instanceId).toBe(state.players[0].hand.find(
      (c) => c.id === ARAÑA_ID && ownerOf(c) === 0,
    )!.instanceId);
  });

  it('invocar mi copia PROPIA deja la copia robada en la mano', () => {
    const { state, mia } = trasRobarDuplicado();
    const s = run(state, { type: 'SUMMON_MONSTER', card: mia, position: 'attack' });

    const arañasRestantes = s.players[0].hand.filter((c) => c.id === ARAÑA_ID);
    expect(arañasRestantes).toHaveLength(1);
    expect(ownerOf(arañasRestantes[0])).toBe(1); // la ROBADA sigue en la mano
  });

  it('jugar dos veces la misma instancia la segunda no hace nada', () => {
    const { state, robada } = trasRobarDuplicado();

    let s = run(state, { type: 'SUMMON_MONSTER', card: robada, position: 'attack' });
    const manoTrasPrimero = s.players[0].hand.length;
    const cuota = s.players[0].cardsPlayedThisTurn;

    // La segunda invocación con la MISMA instancia ya no está en la mano.
    s = run(s, { type: 'SUMMON_MONSTER', card: robada, position: 'attack' });

    expect(s.players[0].hand.length).toBe(manoTrasPrimero);
    expect(s.players[0].cardsPlayedThisTurn).toBe(cuota);
    expect(s.players[0].field.filter(Boolean)).toHaveLength(1);
  });

  it('indexOfCardInstance localiza la copia exacta dentro de una zona con duplicados', () => {
    const { state } = trasRobarDuplicado();
    const mano = state.players[0].hand;
    const arañas = mano.filter((c) => c.id === ARAÑA_ID);

    expect(indexOfCardInstance(mano, arañas[0])).toBe(mano.indexOf(arañas[0]));
    expect(indexOfCardInstance(mano, arañas[1])).toBe(mano.indexOf(arañas[1]));
    expect(indexOfCardInstance(mano, arañas[0])).not.toBe(
      indexOfCardInstance(mano, arañas[1]),
    );
  });
});

// ==========================================================================
// 6. La carta robada conserva su propietario original
// ==========================================================================

describe('PROPIEDAD · la copia robada conserva su dueño', () => {
  it('al invocar la copia robada y destruirla, va al cementerio del RIVAL', () => {
    const { state, robada } = trasRobarDuplicado();
    let s = run(state, { type: 'SUMMON_MONSTER', card: robada, position: 'attack' });

    // Destrucción total (Mágica 6): barre el campo y manda cada carta al
    // cementerio de SU propietario.
    const m6 = fromDeck(0, 'm6') as MagicCard;
    s = {
      ...s,
      players: [{ ...s.players[0], hand: [m6] }, s.players[1]] as [PlayerState, PlayerState],
    };
    s = run(s, { type: 'SELECT_MAGIC', card: m6 });

    const enCemRival = s.players[1].graveyard.filter((c) => c.id === ARAÑA_ID);
    const enCemMio = s.players[0].graveyard.filter((c) => c.id === ARAÑA_ID);
    expect(enCemRival).toHaveLength(1);
    expect(enCemRival[0].instanceId).toBe(robada.instanceId);
    expect(ownerOf(enCemRival[0])).toBe(1);
    expect(enCemMio).toHaveLength(0);
  });

  it('mi copia propia sigue viva y conserva su instanceId', () => {
    const { state, mia } = trasRobarDuplicado();
    const s = run(state, { type: 'SUMMON_MONSTER', card: mia, position: 'attack' });

    expect(s.players[0].hand.some((c) => c.id === ARAÑA_ID && ownerOf(c) === 0)).toBe(false);
    expect(s.players[0].field.filter((f) => f?.card.id === ARAÑA_ID)).toHaveLength(1);
    expect(
      s.players[0].field.find((f) => f?.card.id === ARAÑA_ID)!.card.instanceId,
    ).toBe(mia.instanceId);
  });
});

// ==========================================================================
// El turno completo de la Mágica 2 con duplicado
// ==========================================================================

describe('MÁGICA 2 · turno completo con duplicado', () => {
  it('la copia robada mantiene su instancia durante todo el turno', () => {
    const { state, robada } = trasRobarDuplicado();
    let s = state;

    // Se juega otra carta: el duplicado debe sobrevivir en la mano.
    const otra = s.players[0].hand.find((c) => c.id !== ARAÑA_ID && c.type === 'monster')
      ?? s.players[0].hand.find((c) => c.id !== ARAÑA_ID);
    if (otra && otra.type === 'monster') {
      const antes = s.players[0].hand.length;
      s = run(s, { type: 'SUMMON_MONSTER', card: otra as MonsterCard, position: 'defense' });
      expect(s.players[0].hand.length).toBe(antes - 1);
    }
    expect(s.players[0].hand.some((c) => c.instanceId === robada.instanceId)).toBe(true);
  });

  it('las dos copias siguen siendo distinguibles tras un intercambio de mano (Mágica 3)', () => {
    const { state, mia, robada } = trasRobarDuplicado();
    const m3 = fromDeck(0, 'm3') as MagicCard;

    let s = {
      ...state,
      players: [{ ...state.players[0], hand: [...state.players[0].hand, m3] }, state.players[1]] as [
        PlayerState,
        PlayerState,
      ],
    };
    s = run(s, { type: 'SELECT_MAGIC', card: m3 });

    // La Mágica 3 descarta ambas manos: cada copia va al cementerio de SU
    // propietario y conserva su propia identidad de instancia.
    const miaCem = s.players[0].graveyard.find((c) => c.id === ARAÑA_ID);
    const robadaCem = s.players[1].graveyard.find((c) => c.id === ARAÑA_ID);
    expect(miaCem).toBeDefined();
    expect(robadaCem).toBeDefined();
    expect(miaCem!.instanceId).toBe(mia.instanceId);
    expect(robadaCem!.instanceId).toBe(robada.instanceId);
    expect(miaCem!.instanceId).not.toBe(robadaCem!.instanceId);
  });
});

describe('SANIDAD · instancias en partida real', () => {
  it('tras 30 turnos automatizados no hay dos cartas con la misma identidad', () => {
    let s = run(game(), { type: 'START_GAME', mode: 'local' });
    s = { ...s, phase: 'playing' };

    for (let i = 0; i < 30; i++) {
      const p = s.players[s.currentPlayer];
      if (s.phase === 'game-over') break;
      const mon = p.hand.find((c): c is MonsterCard => c.type === 'monster');
      if (mon && p.field.some((f) => f === null) && p.cardsPlayedThisTurn < 3) {
        s = run(s, { type: 'SUMMON_MONSTER', card: mon, position: 'attack' });
      }
      s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });

      const todas: Card[] = [];
      for (const pl of s.players) todas.push(...pl.deck, ...pl.hand, ...pl.graveyard);
      const ids = todas.map((c) => c.instanceId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
    }
    // Invariante de mazos: nunca dos cartas del mismo tipo en un mazo.
    for (const pl of s.players) expect(hasDuplicateIds(pl.deck)).toBe(false);
  });

  it('drawCards NO crea instancias nuevas al robar del mazo', () => {
    let p = createPlayer(0, 'J1', buildDeck());
    const antes = p.deck.map((c) => c.instanceId);
    p = drawCards(p, 5);
    expect(p.hand.map((c) => c.instanceId)).toEqual(antes.slice(0, 5));
    expect(p.deck.map((c) => c.instanceId)).toEqual(antes.slice(5));
  });
});
