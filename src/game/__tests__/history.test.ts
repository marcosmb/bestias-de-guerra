import { describe, it, expect, beforeEach } from 'vitest';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  clearStoredHistory,
  emptyHistory,
  exportFileName,
  getDefaultStorage,
  historyToText,
  loadHistoryFrom,
  makeHistoryReducer,
  saveHistoryTo,
  serializeHistory,
  serializeHistoryPretty,
  significantKey,
  snapshotState,
  type HistoryBundle,
  type HistoryStorage,
  type MatchHistory,
} from '../history';
import { reducer, initialState } from '../useGame';
import type { Action, FieldMonster, GameState, PlayerState } from '../types';
import { MAX_CARDS_PER_TURN } from '../types';
import { buildDeck, type MagicCard, type MonsterCard, type TrapCard } from '../cardData';

// ---------------------------------------------------------------------------
// Almacenamiento simulado: equivale a localStorage sin necesitar DOM.
// ---------------------------------------------------------------------------
class FakeStorage implements HistoryStorage {
  private data = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  get size(): number {
    return this.data.size;
  }
}

// --- Constructores de prueba -------------------------------------------------
function mon(id: string, atk = 5, def = atk): MonsterCard {
  return { id, type: 'monster', suit: 'espadas', number: atk, name: id, atk, def, image: '' };
}
function trp(effect: TrapCard['effect'], id = 't1', name = 'T1'): TrapCard {
  return { id, type: 'trap', suit: 'copas', number: 1, name, description: '', effect, image: '' };
}
function mag(effect: MagicCard['effect'], id = 'm1', placement: MagicCard['placement'] = 'instant', name = 'M1'): MagicCard {
  return { id, type: 'magic', suit: 'oros', number: 1, name, description: '', effect, placement };
}
function fm(uid: string, card: MonsterCard, o: Partial<FieldMonster> = {}): FieldMonster {
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
    ...o,
  };
}
const CAMPO = [null, null, null, null, null, null] as PlayerState['field'];

/**
 * Estado determinista: sin barajado, sin azar.
 *
 * Por defecto ambos jugadores tienen 1 Monstruo en la mano y el mazo lleno.
 * Eso los mantiene "con acciones legales" y evita que `checkStalemateEnd`
 * dispare un bloqueo espurio en medio de un test que no lo está probando.
 * Los tests de stalemate sobrescriben `hand: []` y `deck: []` explícitamente.
 */
function estado(o: {
  p0?: Partial<PlayerState>;
  p1?: Partial<PlayerState>;
  phase?: GameState['phase'];
  turnCount?: number;
} = {}): GameState {
  const base: PlayerState = {
    index: 0,
    name: 'Jugador 1',
    lp: 100,
    deck: buildDeck(),
    hand: [mon('base', 5)],
    field: [...CAMPO],
    graveyard: [],
    cardsPlayedThisTurn: 0,
  };
  return {
    ...initialState(),
    phase: o.phase ?? 'playing',
    mode: 'cpu',
    turnCount: o.turnCount ?? 1,
    players: [
      { ...base, index: 0, name: 'Jugador 1', ...o.p0 },
      { ...base, index: 1, name: 'CPU', ...o.p1 },
    ] as [PlayerState, PlayerState],
  };
}

/** Estado con las manos y los mazos vacíos: dispara el stalemate real. */
function atascado(lp0 = 100, lp1 = 100): GameState {
  return estado({
    p0: { lp: lp0, deck: [], hand: [] },
    p1: { lp: lp1, deck: [], hand: [] },
  });
}

/** Envoltorio de pruebas sobre el reducer real. */
const hr = makeHistoryReducer(reducer);

function sobre(game: GameState, history: MatchHistory | null = emptyHistory()): HistoryBundle {
  return { game, history };
}
function hist(b: HistoryBundle): MatchHistory {
  if (!b.history) throw new Error('No hay historial');
  return b.history;
}
function st(b: HistoryBundle): GameState {
  return b.game;
}
function run(b: HistoryBundle, ...actions: Action[]): HistoryBundle {
  return actions.reduce((acc, a) => hr(acc, { action: a }), b);
}
function start(): HistoryBundle {
  return hr({ game: initialState(), history: null }, { action: { type: 'START_GAME', mode: 'cpu' } });
}

/** Último elemento. `Array.prototype.at` no está en el `lib` del proyecto. */
function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

describe('HISTORIAL DE LA ÚLTIMA PARTIDA', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  // =========================================================================
  // 1 · Una partida nueva crea historial
  // =========================================================================
  describe('1 · Creación', () => {
    it('START_GAME crea un historial con la entrada de inicio', () => {
      const b = start();
      expect(b.history).not.toBeNull();
      expect(b.history!.entries).toHaveLength(1);
      const e = b.history!.entries[0];
      expect(e.actionType).toBe('START_GAME');
      expect(e.actionLabel).toBe('Inicio de partida');
      expect(e.index).toBe(0);
      expect(e.accepted).toBe(true);
    });

    it('el historial nace con la versión y el modo correctos', () => {
      const b = start();
      expect(b.history!.version).toBe(HISTORY_VERSION);
      expect(b.history!.mode).toBe('cpu');
      expect(b.history!.finished).toBe(false);
      expect(b.history!.end).toBeNull();
    });

    it('la entrada de inicio refleja la preparación (7 cartas, 41 en mazo, 100 LP)', () => {
      const e = start().history!.entries[0];
      expect(e.after.players[0].handCount).toBe(7);
      expect(e.after.players[1].handCount).toBe(7);
      expect(e.after.players[0].deckCount).toBe(41);
      expect(e.after.players[1].deckCount).toBe(41);
      expect(e.after.players[0].lp).toBe(100);
      expect(e.after.players[1].lp).toBe(100);
    });

    it('sin partida no hay historial', () => {
      expect(sobre(initialState(), null).history).toBeNull();
    });
  });

  // =========================================================================
  // 2 · Cada acción relevante genera una entrada
  // =========================================================================
  describe('2 · Acciones relevantes', () => {
    it('invocación de Monstruo genera entrada con carta, turno y estado', () => {
      const g = estado({ p0: { hand: [mon('Kraken', 10), mon('Troll', 7)] } });
      const kraken = g.players[0].hand[0] as MonsterCard;
      const b = run(sobre(g), { type: 'SUMMON_MONSTER', card: kraken, position: 'attack' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('SUMMON_MONSTER');
      expect(e.cardName).toBe('Kraken');
      expect(e.cardId).toBe('Kraken');
      expect(e.accepted).toBe(true);
      expect(e.actorName).toBe('Jugador 1');
      expect(e.events.some((ev) => ev.type === 'invocación')).toBe(true);
      expect(e.after.players[0].field[0].cardName).toBe('Kraken');
    });

    it('ataque directo genera entrada con el daño en el rival', () => {
      const g = estado({ p0: { field: [fm('u1', mon('Kraken', 9)), ...CAMPO.slice(1)] } });
      const b = run(sobre(g), { type: 'DIRECT_ATTACK', attackerUid: 'u1' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('DIRECT_ATTACK');
      expect(e.before.players[1].lp).toBe(100);
      expect(e.after.players[1].lp).toBe(91);
      expect(e.events.some((ev) => ev.type === 'daño')).toBe(true);
    });

    it('ataque a monstruo registra el combate y la destrucción', () => {
      const atacante = fm('a', mon('Kraken', 10));
      const defensor = fm('d', mon('Sapo', 1));
      const g = estado({
        p0: { field: [atacante, ...CAMPO.slice(1)] },
        p1: { field: [defensor, ...CAMPO.slice(1)] },
      });
      const b = run(sobre(g), { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('DECLARE_ATTACK');
      expect(e.targetName).toBe('Sapo');
      // ATQ 10 contra ATQ 1: el defensor se destruye y el rival pierde 9 LP.
      expect(e.after.players[1].field[0].cardId).toBeNull();
      expect(e.after.players[1].lp).toBe(91);
      expect(e.events.some((ev) => ev.type === 'daño')).toBe(true);
      expect(e.events.some((ev) => ev.type === 'cementerio')).toBe(true);
    });

    it('colocación de Trampa genera entrada con el objetivo', () => {
      const t = trp({ kind: 'damage_per_turn', amount: 5 }, 't12', 'Menos 5 PV');
      const g = estado({ p0: { field: [fm('u1', mon('Orco', 5)), ...CAMPO.slice(1)], hand: [t] } });
      const b = run(sobre(g), { type: 'SELECT_TRAP_PLACE', card: t }, { type: 'PLACE_TRAP_ON_MONSTER', card: t, fieldUid: 'u1' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('PLACE_TRAP_ON_MONSTER');
      expect(e.cardName).toBe('Menos 5 PV');
      expect(e.targetName).toBe('Orco');
      expect(e.after.players[0].field[0].trapId).toBe('t12');
    });

    it('activación de Trampa genera entrada', () => {
      const atacante = fm('a', mon('Kraken', 10), { position: 'attack' });
      const defensor = fm('d', mon('Sapo', 1));
      const trampa = trp({ kind: 'destroy_attacker' }, 't8', 'Eliminar atacante');
      const g = estado({
        p0: { field: [atacante, ...CAMPO.slice(1)] },
        p1: { field: [fm('d2', defensor.card, { trap: trampa }), ...CAMPO.slice(1)] },
        phase: 'trap-response',
      });
      const conPendiente: GameState = {
        ...g,
        pendingTrap: {
          attackerUid: 'a',
          defenderUid: 'd2',
          trap: trampa,
          defenderPlayer: 1,
          attackerPlayer: 0,
          attackerCard: atacante.card,
          defenderCard: defensor.card,
          defenderPosition: 'attack',
        },
      };
      const b = run(sobre(conPendiente), { type: 'RESOLVE_TRAP', activate: true });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('RESOLVE_TRAP');
      expect(e.cardName).toBe('Eliminar atacante');
      expect(e.actionLabel).toContain('Activa');
      expect(e.accepted).toBe(true);
    });

    it('cambio de posición genera entrada', () => {
      const g = estado({ p0: { field: [fm('u1', mon('Orco', 5)), ...CAMPO.slice(1)] } });
      const b = run(sobre(g), { type: 'CHANGE_POSITION', fieldUid: 'u1' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('CHANGE_POSITION');
      expect(e.before.players[0].field[0].position).toBe('attack');
      expect(e.after.players[0].field[0].position).toBe('defense');
      expect(e.events.some((ev) => ev.type === 'cambio-posicion')).toBe(true);
    });

    it('activación de Mágica genera entrada', () => {
      const m10 = mag({ kind: 'draw_cards', amount: 2 }, 'm10', 'instant', 'Robar dos cartas');
      const g = estado({ p0: { hand: [m10], deck: buildDeck().slice(0, 10) } });
      const b = run(sobre(g), { type: 'SELECT_MAGIC', card: m10 });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('SELECT_MAGIC');
      expect(e.cardName).toBe('Robar dos cartas');
      // Mano: 1 (la Mágica) - 1 (se consume) + 2 (robo) = 2
      expect(e.after.players[0].handCount).toBe(2);
      expect(e.after.players[0].handIds).not.toContain('m10');
      expect(e.events.some((ev) => ev.type === 'robo')).toBe(true);
    });

    it('tirada de dado registra el número', () => {
      const g = estado({ phase: 'dice-roll' });
      const conDado: GameState = { ...g, pendingDice: { reason: 'Mágica 11', onRoll: () => ({ type: 'END_TURN' }) } };
      const b = run(sobre(conDado), { type: 'ROLL_DICE', roll: 4 });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('ROLL_DICE');
      expect(e.dice).toBe(4);
      expect(e.actionLabel).toContain('4');
    });

    it('fin de turno registra cambio de turno y robo', () => {
      // El robo de Regla 9.3 corresponde al jugador que ENTRA en turno (CPU).
      const g = estado({ p1: { deck: buildDeck().slice(0, 10), hand: [] } });
      const b = run(sobre(g), { type: 'END_TURN' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('END_TURN');
      expect(e.events.some((ev) => ev.type === 'turno')).toBe(true);
      expect(e.events.some((ev) => ev.type === 'robo')).toBe(true);
      expect(e.before.players[1].handCount).toBe(0);
      expect(e.after.players[1].handCount).toBe(2);
      expect(e.after.currentPlayer).toBe(1);
    });

    it('una acción rechazada se registra con accepted=false', () => {
      // 4 Monstruos en mano, cuota 3/3: la cuarta invocación se rechaza.
      const mano = [mon('a', 3), mon('b', 4), mon('c', 5), mon('d', 6)];
      const g = estado({ p0: { hand: mano, cardsPlayedThisTurn: MAX_CARDS_PER_TURN } });
      const b = run(sobre(g), { type: 'SUMMON_MONSTER', card: mano[0], position: 'attack' });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('SUMMON_MONSTER');
      expect(e.accepted).toBe(false);
      expect(e.events.some((ev) => ev.type === 'rechazo')).toBe(true);
      expect(e.result).toContain('RECHAZADA');
      expect(e.after.players[0].handCount).toBe(4);
    });

    it('una acción imposible por falta de hueco también se marca como rechazada', () => {
      const lleno = [1, 2, 3, 4, 5, 6].map((n) => fm(`f${n}`, mon(`m${n}`, n)));
      const g = estado({ p0: { field: lleno, hand: [mon('nueva', 9)] } });
      const b = run(sobre(g), { type: 'SUMMON_MONSTER', card: g.players[0].hand[0] as MonsterCard, position: 'attack' });
      expect(last(hist(b).entries).accepted).toBe(false);
    });
  });

  // =========================================================================
  // 3 · Orden temporal
  // =========================================================================
  describe('3 · Orden temporal', () => {
    it('los índices son correlativos y respetan el orden de ejecución', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 5) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      const uid = st(b).players[0].field[0]!.uid;
      b = run(b, { type: 'CHANGE_POSITION', fieldUid: uid });
      b = run(b, { type: 'END_TURN' });
      const types = hist(b).entries.map((e) => e.actionType);
      expect(types).toEqual(['SUMMON_MONSTER', 'CHANGE_POSITION', 'END_TURN']);
      expect(hist(b).entries.map((e) => e.index)).toEqual([0, 1, 2]);
    });

    it('el turno nunca retrocede a lo largo del historial', () => {
      let b = sobre(estado());
      for (let i = 0; i < 6; i++) b = run(b, { type: 'END_TURN' });
      expect(hist(b).entries).toHaveLength(6);
      const turnos = hist(b).entries.map((e) => e.turn);
      for (let i = 1; i < turnos.length; i++) {
        expect(turnos[i]).toBeGreaterThanOrEqual(turnos[i - 1]);
      }
      expect(last(turnos)).toBe(7);
    });

    it('cada entrada encadena: after de una = before de la siguiente', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [m], deck: buildDeck().slice(0, 8) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      b = run(b, { type: 'END_TURN' });
      b = run(b, { type: 'END_TURN' });
      const e = hist(b).entries;
      for (let i = 1; i < e.length; i++) {
        expect(significantKey(e[i].before)).toBe(significantKey(e[i - 1].after));
      }
    });

    it('START_GAME queda como movimiento 0', () => {
      const b = start();
      expect(hist(b).entries[0].index).toBe(0);
      expect(hist(b).entries[0].actionType).toBe('START_GAME');
    });
  });

  // =========================================================================
  // 4 · Estado anterior y posterior
  // =========================================================================
  describe('4 · Estado antes/después', () => {
    it('guarda LP, mano, mazo, campo y cuota antes y después', () => {
      const m = mon('Kraken', 10);
      const g = estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 5) } });
      const b = run(sobre(g), { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      const e = last(hist(b).entries);
      expect(e.before.players[0].handCount).toBe(2);
      expect(e.after.players[0].handCount).toBe(1);
      expect(e.before.players[0].deckCount).toBe(5);
      expect(e.after.players[0].deckCount).toBe(5);
      expect(e.before.players[0].cardsPlayedThisTurn).toBe(0);
      expect(e.after.players[0].cardsPlayedThisTurn).toBe(1);
      expect(e.before.players[0].field.filter((f) => f.cardId).length).toBe(0);
      expect(e.after.players[0].field.filter((f) => f.cardId).length).toBe(1);
      expect(e.before.phase).toBe('playing');
      expect(e.after.phase).toBe('playing');
      expect(e.before.currentPlayer).toBe(0);
    });

    it('el snapshot tiene los 6 espacios con posición, ATQ/DEF, trampa y mágica', () => {
      const m = fm('u1', mon('Orco', 7), {
        trap: trp({ kind: 'heal_per_turn', amount: 5 }, 't1', 'Más 5 PV'),
        magic: mag({ kind: 'atk_boost', amount: 2 }, 'm4', 'field', 'Más 2 ATQ'),
        tempAtkModifier: 2,
        diceProtection: true,
      });
      const g = estado({ p0: { field: [m, ...CAMPO.slice(1)] } });
      const b = run(sobre(g), { type: 'CHANGE_POSITION', fieldUid: 'u1' });
      const slot = last(hist(b).entries).after.players[0].field[0];
      expect(last(hist(b).entries).after.players[0].field).toHaveLength(6);
      expect(slot.cardName).toBe('Orco');
      expect(slot.position).toBe('defense');
      expect(slot.baseAtk).toBe(7);
      expect(slot.effAtk).toBe(9); // 7 + 2 de la Mágica 4
      expect(slot.effDef).toBe(7);
      expect(slot.trapName).toBe('Más 5 PV');
      expect(slot.magicName).toBe('Más 2 ATQ');
      expect(slot.diceProtection).toBe(true);
      expect(slot.uid).toBe('u1');
      expect(slot.controlledBy).toBeNull();
    });

    it('registra los espacios vacíos como null', () => {
      const b = run(sobre(estado()), { type: 'END_TURN' });
      const campo = last(hist(b).entries).after.players[0].field;
      expect(campo).toHaveLength(6);
      expect(campo.every((f) => f.cardId === null)).toBe(true);
    });

    it('el turno activo y la fase quedan registrados', () => {
      const b = run(sobre(estado({ p0: { deck: buildDeck().slice(0, 6) } })), { type: 'END_TURN' });
      const e = last(hist(b).entries);
      expect(e.before.currentPlayerName).toBe('Jugador 1');
      expect(e.after.currentPlayerName).toBe('CPU');
      expect(e.after.turnCount).toBe(e.before.turnCount + 1);
    });

    it('registra el cambio de controlador de un Monstruo', () => {
      const robado = fm('x', mon('Kraken', 10), { controlledBy: null });
      const g = estado({
        p0: { field: [...CAMPO] },
        p1: { field: [robado, ...CAMPO.slice(1)] },
      });
      const controlado: GameState = {
        ...g,
        players: [
          g.players[0],
          { ...g.players[1], field: [fm('x', mon('Kraken', 10), { controlledBy: 0 }), ...CAMPO.slice(1)] as PlayerState['field'] },
        ],
      };
      const b = run(sobre(controlado), { type: 'END_TURN' });
      const e = last(hist(b).entries);
      expect(e.before.players[1].field[0].controlledBy).toBe(0);
      expect(e.events.some((ev) => ev.type === 'turno')).toBe(true);
    });

    it('registra el movimiento al cementerio', () => {
      const atacante = fm('a', mon('Kraken', 10));
      const defensor = fm('d', mon('Sapo', 1));
      const g = estado({
        p0: { field: [atacante, ...CAMPO.slice(1)] },
        p1: { field: [defensor, ...CAMPO.slice(1)] },
      });
      const b = run(sobre(g), { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' });
      const e = last(hist(b).entries);
      expect(e.after.players[1].graveyardCount).toBe(1);
      expect(e.events.some((ev) => ev.type === 'cementerio')).toBe(true);
    });
  });

  // =========================================================================
  // 5 · Supervivencia a recarga (localStorage)
  // =========================================================================
  describe('5 · Persistencia', () => {
    it('saveHistoryTo / loadHistoryFrom sobreviven a una recarga simulada', () => {
      const m = mon('Kraken', 10);
      const b = run(sobre(estado({ p0: { hand: [m] } })), { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      expect(saveHistoryTo(storage, hist(b))).toBe(true);
      expect(storage.size).toBe(1);

      // "Recarga": se pierde la memoria, solo queda el almacenamiento.
      const recuperado = loadHistoryFrom(storage);
      expect(recuperado).not.toBeNull();
      expect(recuperado!.entries).toHaveLength(hist(b).entries.length);
      expect(last(recuperado!.entries).actionType).toBe('SUMMON_MONSTER');
      expect(last(recuperado!.entries).after.players[0].field[0].cardName).toBe('Kraken');
    });

    it('el historial se guarda progresivamente durante la partida', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 10) } }));

      saveHistoryTo(storage, hist(b));
      expect(storage.writes).toBe(1);
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(0);

      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      saveHistoryTo(storage, hist(b));
      expect(storage.writes).toBe(2);
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(1);

      b = run(b, { type: 'END_TURN' });
      saveHistoryTo(storage, hist(b));
      expect(storage.writes).toBe(3);
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(2);
      expect(loadHistoryFrom(storage)!.finished).toBe(false);
    });

    it('devuelve null si no hay nada guardado', () => {
      expect(loadHistoryFrom(storage)).toBeNull();
      expect(loadHistoryFrom(null)).toBeNull();
    });

    it('devuelve null si el contenido está corrupto', () => {
      storage.setItem(HISTORY_STORAGE_KEY, '{no es json');
      expect(loadHistoryFrom(storage)).toBeNull();
      storage.setItem(HISTORY_STORAGE_KEY, '"una cadena"');
      expect(loadHistoryFrom(storage)).toBeNull();
      storage.setItem(HISTORY_STORAGE_KEY, '{"version":1}');
      expect(loadHistoryFrom(storage)).toBeNull();
    });

    it('saveHistoryTo no lanza si el almacenamiento falla', () => {
      const roto: HistoryStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('cuota excedida');
        },
        removeItem: () => {},
      };
      expect(saveHistoryTo(roto, emptyHistory())).toBe(false);
      expect(saveHistoryTo(null, emptyHistory())).toBe(false);
    });

    it('clearStoredHistory borra el historial sin lanzar', () => {
      saveHistoryTo(storage, emptyHistory());
      expect(loadHistoryFrom(storage)).not.toBeNull();
      clearStoredHistory(storage);
      expect(loadHistoryFrom(storage)).toBeNull();
      expect(() => clearStoredHistory(null)).not.toThrow();
    });

    it('getDefaultStorage devuelve null en un entorno sin DOM', () => {
      // vitest corre con environment: 'node', así que no hay localStorage.
      expect(getDefaultStorage()).toBeNull();
    });

    it('si no hay almacenamiento el historial sigue funcionando en memoria', () => {
      const m = mon('Kraken', 10);
      const b = run(sobre(estado({ p0: { hand: [m] } })), { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      expect(saveHistoryTo(null, hist(b))).toBe(false);
      expect(hist(b).entries).toHaveLength(1);
      expect(historyToText(hist(b))).toContain('Invoca');
    });
  });

  // =========================================================================
  // 6 · Una nueva partida reemplaza la anterior
  // =========================================================================
  describe('6 · Reemplazo al empezar otra partida', () => {
    it('la segunda partida borra los movimientos de la primera', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 10) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      b = run(b, { type: 'END_TURN' });
      b = run(b, { type: 'END_TURN' });
      expect(hist(b).entries.length).toBe(3);

      b = run(b, { type: 'START_GAME', mode: 'cpu' });
      expect(hist(b).entries).toHaveLength(1);
      expect(hist(b).entries[0].actionType).toBe('START_GAME');
      expect(hist(b).end).toBeNull();
      expect(hist(b).finished).toBe(false);
    });

    it('no mezcla movimientos de dos partidas', () => {
      const m1 = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m1], deck: buildDeck().slice(0, 10) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m1, position: 'attack' });
      b = run(b, { type: 'END_TURN' });
      b = run(b, { type: 'START_GAME', mode: 'cpu' });

      // Tras el nuevo START_GAME solo debe quedar su entrada de inicio.
      const types = hist(b).entries.map((e) => e.actionType);
      expect(types).toEqual(['START_GAME']);
      // Y el estado que dejó la primera partida ya no aparece en el snapshot.
      expect(hist(b).entries[0].after.players[0].handCount).toBe(7);
    });

    it('el historial anterior se conserva hasta que la nueva partida empieza', () => {
      const m = mon('Kraken', 10);
      const b = run(sobre(estado({ p0: { hand: [m] } })), { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      // Sin START_GAME nuevo, el historial sigue intacto en memoria.
      expect(hist(b).entries).toHaveLength(1);
      const antes = serializeHistory(hist(b));
      expect(serializeHistory(hist(b))).toBe(antes);
      saveHistoryTo(storage, hist(b));
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(1);
    });

    it('el guardado tras la nueva partida solo contiene la nueva', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 10) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      saveHistoryTo(storage, hist(b));
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(1);

      b = run(b, { type: 'START_GAME', mode: 'cpu' });
      saveHistoryTo(storage, hist(b));
      expect(loadHistoryFrom(storage)!.entries).toHaveLength(1);
      expect(loadHistoryFrom(storage)!.entries[0].actionType).toBe('START_GAME');
    });

    it('RESTART no borra el historial (sigue consultable desde el menú)', () => {
      const m = mon('Kraken', 10);
      let b = run(sobre(estado({ p0: { hand: [mon('base', 5), m] } })), { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      b = run(b, { type: 'RESTART' });
      expect(hist(b).entries.length).toBeGreaterThanOrEqual(2);
      expect(hist(b).entries[0].actionType).toBe('SUMMON_MONSTER');
    });

    it('REGRESIÓN · RESTART tras el final no deshace "finished"', () => {
      // Volver al menú con RESTART no puede hacer creer que la partida
      // registrada sigue en curso: el final ocurrió y así se guarda.
      let b = run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      expect(hist(b).finished).toBe(true);
      expect(hist(b).end).not.toBeNull();
      b = run(b, { type: 'RESTART' });
      expect(last(hist(b).entries).actionType).toBe('RESTART');
      expect(hist(b).finished).toBe(true);
      expect(hist(b).end!.reason).toBe('victoria-0-lp');
      expect(historyToText(hist(b))).toContain('Estado: FINALIZADA');
    });

    it('una partida nueva sí pone finished=false y borra el final', () => {
      let b = run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      expect(hist(b).finished).toBe(true);
      b = run(b, { type: 'START_GAME', mode: 'cpu' });
      expect(hist(b).finished).toBe(false);
      expect(hist(b).end).toBeNull();
      expect(historyToText(hist(b))).toContain('Estado: EN CURSO');
    });
  });

  // =========================================================================
  // 7-10 · Finales de partida
  // =========================================================================
  describe('7-10 · Finales de partida', () => {
    it('7 · victoria por 0 LP se registra con winner correcto', () => {
      // J2 a 0 LP y sin cartas jugables: gana J1 por la Regla 27.1.
      const b = run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(end).not.toBeNull();
      expect(end.reason).toBe('victoria-0-lp');
      expect(end.rule).toBe('Regla 27.1');
      expect(end.isDraw).toBe(false);
      expect(end.winner).toBe(0);
      expect(end.condition).toContain('0 LP');
      expect(hist(b).finished).toBe(true);
    });

    it('7b · la derrota del jugador 0 también se registra', () => {
      const b = run(sobre(estado({ p0: { lp: 0, deck: [], hand: [] }, p1: { deck: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(end.reason).toBe('victoria-0-lp');
      expect(end.winner).toBe(1);
      expect(end.isDraw).toBe(false);
    });

    it('8 · empate por 0/0 LP se registra', () => {
      const b = run(sobre(estado({ p0: { lp: 0, deck: [], hand: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(end.reason).toBe('empate-0-0');
      expect(end.rule).toBe('Regla 27.3');
      expect(end.isDraw).toBe(true);
      expect(end.winner).toBeNull();
      expect(end.reasonLabel).toContain('EMPATE');
    });

    it('9a · empate por stalemate se registra', () => {
      const b = run(sobre(estado({ p0: { lp: 33, deck: [], hand: [] }, p1: { lp: 33, deck: [], hand: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(end.reason).toBe('empate-stalemate');
      expect(end.rule).toBe('Regla 27.2');
      expect(end.isDraw).toBe(true);
      expect(end.winner).toBeNull();
      expect(end.condition).toContain('acciones legales');
      expect(end.reasonLabel).toContain('STALEMATE');
    });

    it('9b · victoria por stalemate se registra', () => {
      const b = run(sobre(estado({ p0: { lp: 80, deck: [], hand: [] }, p1: { lp: 50, deck: [], hand: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(end.reason).toBe('victoria-stalemate');
      expect(end.rule).toBe('Regla 27.2');
      expect(end.isDraw).toBe(false);
      expect(end.winner).toBe(0);
      expect(end.reasonLabel).toContain('VICTORIA');
    });

    it('10 · winner e isDraw del historial coinciden con el GameState', () => {
      const casos: [number, number][] = [
        [100, 0],
        [0, 100],
        [0, 0],
        [80, 50],
        [60, 60],
      ];
      for (const [lp0, lp1] of casos) {
        const b = run(sobre(estado({ p0: { lp: lp0, deck: [], hand: [] }, p1: { lp: lp1, deck: [], hand: [] } })), { type: 'END_TURN' });
        const end = hist(b).end!;
        const g = st(b);
        expect(end.winner).toBe(g.winner);
        expect(end.isDraw).toBe(g.isDraw);
        expect(end.phase).toBe(g.phase);
        expect(end.lp).toEqual([g.players[0].lp, g.players[1].lp]);
      }
    });

    it('la entrada especial apunta al movimiento que provocó el final', () => {
      const b = run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      const end = hist(b).end!;
      expect(hist(b).entries[end.triggerIndex].actionType).toBe('END_TURN');
      expect(end.triggerAction.actionType).toBe('END_TURN');
      expect(end.triggerAction.actionLabel).toContain('Fin de turno');
    });

    it('distingue la última acción ejecutada de la que provocó el final', () => {
      const m = mon('Kraken', 12);
      // El ataque directo contra un rival a pocos LP termina la partida.
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: [] }, p1: { lp: 5, deck: [], hand: [] } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' }); // NO termina
      expect(st(b).phase).toBe('playing');
      expect(hist(b).end).toBeNull();

      const uid = st(b).players[0].field[0]!.uid;
      b = run(b, { type: 'DIRECT_ATTACK', attackerUid: uid }); // esta sí
      const end = hist(b).end!;
      expect(st(b).phase).toBe('game-over');
      expect(end.triggerAction.actionType).toBe('DIRECT_ATTACK');
      expect(end.lastAction).not.toBeNull();
      expect(end.lastAction!.actionType).toBe('SUMMON_MONSTER');
      expect(end.reason).toBe('victoria-0-lp');
    });

    it('registra los restos: mazos, manos y campos en el momento del final', () => {
      const b = run(
        sobre(estado({
          p0: { lp: 100, hand: [mon('x')], deck: buildDeck().slice(0, 12) },
          p1: { lp: 0, deck: buildDeck().slice(0, 30), hand: [] },
        })),
        { type: 'END_TURN' },
      );
      const end = hist(b).end!;
      // J1 entra en turno y roba 2: 30 → 28.
      expect(end.decksLeft[0]).toBe(12);
      expect(end.decksLeft[1]).toBe(28);
      expect(end.handsLeft[0]).toBe(1);
      expect(end.handsLeft[1]).toBe(2);
      expect(end.fieldsCount).toEqual([0, 0]);
      expect(end.turn).toBe(2);
      expect(end.snapshot.players[0].field).toHaveLength(6);
    });

    it('no registra final si la partida no termina', () => {
      const b = run(sobre(estado()), { type: 'END_TURN' });
      expect(st(b).phase).not.toBe('game-over');
      expect(hist(b).end).toBeNull();
      expect(hist(b).finished).toBe(false);
    });

    it('clasifica el stalemate real (mazos vacíos) y NO cuando el robo salva la partida', () => {
      // Con mazo lleno, END_TURN roba 2 cartas a quien entra y la partida sigue.
      const conMazo = run(
        sobre(estado({ p0: { lp: 50, hand: [] }, p1: { lp: 50, hand: [] } })),
        { type: 'END_TURN' },
      );
      expect(st(conMazo).phase).toBe('playing');
      expect(hist(conMazo).end).toBeNull();
      expect(last(hist(conMazo).entries).events.some((e) => e.type === 'robo')).toBe(true);

      // Con los mazos vacíos, sí hay bloqueo.
      const sinMazo = run(sobre(atascado(50, 50)), { type: 'END_TURN' });
      expect(st(sinMazo).phase).toBe('game-over');
      expect(hist(sinMazo).end!.reason).toBe('empate-stalemate');
    });

    it('una partida larga simulada produce un historial utilizable', () => {
      let b = start();
      let guard = 0;
      while (st(b).phase !== 'game-over' && guard++ < 400) {
        const g = st(b);
        if (g.phase === 'trap-response') { b = run(b, { type: 'RESOLVE_TRAP', activate: false }); continue; }
        if (g.phase === 'dice-roll') { b = run(b, { type: 'ROLL_DICE', roll: 4 }); continue; }
        if (g.phase === 'pass') { b = run(b, { type: 'CONFIRM_PASS' }); continue; }
        if (g.currentPlayer === 0) {
          const pl = g.players[0];
          const m = pl.hand.find((c) => c.type === 'monster');
          if (m && pl.field.some((f) => f === null) && pl.cardsPlayedThisTurn < MAX_CARDS_PER_TURN) {
            b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
          } else {
            b = run(b, { type: 'END_TURN' });
          }
        } else {
          b = run(b, { type: 'END_TURN' });
        }
      }
      expect(hist(b).entries.length).toBeGreaterThan(3);
      expect(historyToText(hist(b)).length).toBeGreaterThan(300);
      // Si llegó a terminar, el final debe ser coherente con el GameState.
      if (st(b).phase === 'game-over') {
        expect(hist(b).end!.winner).toBe(st(b).winner);
        expect(hist(b).end!.isDraw).toBe(st(b).isDraw);
        expect(hist(b).finished).toBe(true);
      } else {
        expect(hist(b).end).toBeNull();
      }
    });
  });

  // =========================================================================
  // 11-12 · Copiar / Exportar
  // =========================================================================
  describe('11-12 · Copiar y exportar', () => {
    function partidaFinal(): HistoryBundle {
      return run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
    }

    it('11 · el texto para copiar contiene movimientos y estados', () => {
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [m], deck: buildDeck().slice(0, 10) } }));
      b = run(b, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
      b = run(b, { type: 'END_TURN' });
      const texto = historyToText(hist(b));
      expect(texto).toContain('HISTORIAL DE LA ÚLTIMA PARTIDA');
      expect(texto).toContain('MOVIMIENTOS');
      expect(texto).toContain('Invoca Kraken');
      expect(texto).toContain('Fin de turno');
      expect(texto).toContain('LP: J1');
      expect(texto).toContain('Mano: J1');
      expect(texto).toContain('Mazo: J1');
      expect(texto).toContain('Cementerio: J1');
      expect(texto).toContain('Campo: J1');
      expect(texto).toContain('Cuota: J1');
      expect(texto).toContain('Fase:');
      expect(texto).toContain('Resultado:');
      expect(texto).not.toBe('No hay ninguna partida registrada.');
    });

    it('11b · sin historial el texto lo dice claramente', () => {
      expect(historyToText(null)).toBe('No hay ninguna partida registrada.');
      expect(historyToText(emptyHistory())).toBe('No hay ninguna partida registrada.');
    });

    it('11c · el final de partida muestra motivo, condición, LP y última acción', () => {
      const texto = historyToText(hist(partidaFinal()));
      expect(texto).toContain('FIN DE PARTIDA');
      expect(texto).toContain('Resultado: ¡VICTORIA DE Jugador 1!');
      expect(texto).toContain('Motivo:');
      expect(texto).toContain('Regla aplicada: Regla 27.1');
      expect(texto).toContain('Condición detectada:');
      expect(texto).toContain('Última acción registrada:');
      expect(texto).toContain('Acción que provocó el final:');
      expect(texto).toContain('LP:');
      expect(texto).toContain('Cartas en mazo:');
      expect(texto).toContain('Estado final: campo de J1');
      expect(texto).toContain('winner=0 isDraw=false');
    });

    it('11d · un empate se distingue claramente en el texto', () => {
      const b = run(sobre(estado({ p0: { lp: 0, deck: [], hand: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      const texto = historyToText(hist(b));
      expect(texto).toContain('Resultado: ¡EMPATE!');
      expect(texto).toContain('Regla aplicada: Regla 27.3');
      expect(texto).toContain('winner=null isDraw=true');
    });

    it('11e · un stalemate se distingue claramente en el texto', () => {
      const b = run(sobre(estado({ p0: { lp: 33, deck: [], hand: [] }, p1: { lp: 33, deck: [], hand: [] } })), { type: 'END_TURN' });
      const texto = historyToText(hist(b));
      expect(texto).toContain('Regla aplicada: Regla 27.2');
      expect(texto).toContain('STALEMATE');
      expect(texto).toContain('Ningún jugador puede realizar acciones legales');
    });

    it('12 · exportar genera JSON válido y completo', () => {
      const json = serializeHistory(hist(partidaFinal()));
      expect(() => JSON.parse(json)).not.toThrow();
      const obj = JSON.parse(json) as MatchHistory;
      expect(obj.version).toBe(HISTORY_VERSION);
      expect(obj.entries.length).toBeGreaterThan(0);
      expect(obj.end).not.toBeNull();
      expect(obj.end!.reasonLabel).toBeTruthy();
      expect(obj.end!.condition).toBeTruthy();
      expect(obj.end!.snapshot.players[0].field).toHaveLength(6);
      expect(obj.end!.snapshot.players[1].field).toHaveLength(6);
      expect(json).not.toContain('undefined');
    });

    it('12b · el JSON sobrevive a un ciclo de guardado y lectura sin perder datos', () => {
      const b = partidaFinal();
      saveHistoryTo(storage, hist(b));
      const recargado = loadHistoryFrom(storage)!;
      // El ciclo guardar → leer es idempotente.
      expect(serializeHistory(recargado)).toBe(serializeHistory(hist(b)));
      expect(JSON.parse(serializeHistory(recargado)).end.reason).toBe('victoria-0-lp');
      // Los espacios compactados como `null` vuelven a expandirse.
      expect(recargado.entries[0].after.players[0].field).toHaveLength(6);
      expect(recargado.entries[0].after.players[0].field[0].cardId).toBeNull();
      expect(recargado.end!.snapshot.players[1].field).toHaveLength(6);
    });

    it('12d · la serialización compacta no infla el tamaño', () => {
      // Una partida representativa: 12 movimientos con campo ocupado.
      const m = mon('Kraken', 10);
      let b = sobre(estado({ p0: { hand: [m], deck: buildDeck().slice(0, 20) } }));
      for (let i = 0; i < 5; i++) {
        const g = st(b);
        const carta = g.players[0].hand.find((c) => c.type === 'monster') as MonsterCard | undefined;
        if (carta && g.players[0].field.some((f) => f === null)) {
          b = run(b, { type: 'SUMMON_MONSTER', card: carta, position: 'attack' });
        }
        b = run(b, { type: 'END_TURN' });
      }
      const compacto = serializeHistory(hist(b));
      const bonito = serializeHistoryPretty(hist(b));
      // La versión sin sangrado (la que va a localStorage) es más pequeña.
      expect(compacto.length).toBeLessThan(bonito.length);
      // Y los datos son los mismos.
      expect(JSON.parse(compacto).entries).toEqual(JSON.parse(bonito).entries);
      console.log(
        `tamaño con ${hist(b).entries.length} movimientos: compacto=${(compacto.length / 1024).toFixed(1)}kB bonito=${(bonito.length / 1024).toFixed(1)}kB (${(100 - (compacto.length / bonito.length) * 100).toFixed(0)}% menos)`,
      );
    });

    it('12e · los espacios ocupados conservan todos sus datos tras el ciclo', () => {
      const m = mon('Kraken', 10);
      const t = trp({ kind: 'damage_per_turn', amount: 5 }, 't12', 'Menos 5 PV');
      let b = sobre(estado({ p0: { hand: [mon('base', 5), m], deck: [], field: [fm('u1', m, { trap: t, tempAtkModifier: 2, diceProtection: true }), ...CAMPO.slice(1)] } }));
      b = run(b, { type: 'CHANGE_POSITION', fieldUid: 'u1' });
      saveHistoryTo(storage, hist(b));
      const r = loadHistoryFrom(storage)!;
      const slot = last(r.entries).after.players[0].field[0];
      expect(slot.cardName).toBe('Kraken');
      expect(slot.effAtk).toBe(12);
      expect(slot.trapName).toBe('Menos 5 PV');
      expect(slot.diceProtection).toBe(true);
      expect(slot.position).toBe('defense');
      // Los 5 espacios libres vuelven a ser objetos completos.
      for (let i = 1; i < 6; i++) {
        expect(r.entries[r.entries.length - 1].after.players[0].field[i]).toEqual({
          uid: null, cardId: null, cardName: null, position: null, faceDown: false,
          baseAtk: null, baseDef: null, effAtk: null, effDef: null, hasAttacked: false,
          hasChangedPosition: false, summonedThisTurn: false, trapId: null, trapName: null,
          magicId: null, magicName: null, diceProtection: false, controlledBy: null,
        });
      }
    });

    it('12c · el nombre del fichero de exportación es válido', () => {
      const name = exportFileName(hist(partidaFinal()));
      expect(name).toMatch(/^bestias-de-guerra-historial-.+\.json$/);
      expect(name).not.toContain(':');
      expect(exportFileName(null)).toMatch(/\.json$/);
    });
  });

  // =========================================================================
  // Aislamiento: la capa no altera la lógica del juego
  // =========================================================================
  describe('Aislamiento', () => {
    it('el GameState devuelto es exactamente el del reducer, acción a acción', () => {
      // Se usa un reductor de control determinista: `shuffleDeck` es aleatorio y
      // haría imposible comparar dos invocaciones de START_GAME. El reductor de
      // control devuelve SIEMPRE un objeto nuevo, así que comparar por
      // referencia demuestra que la envoltura devuelve esa misma referencia
      // (cero copia, cero mutación).
      let llamadas = 0;
      // Puro respecto de `s`: no depende de cuántas veces se haya llamado, para
      // que la llamada de referencia y la de la envoltura den lo mismo.
      const control = (s: GameState): GameState => {
        llamadas += 1;
        return {
          ...s,
          turnCount: s.turnCount + 1,
          players: [
            { ...s.players[0], lp: s.players[0].lp - 1, hand: s.players[0].hand.slice(0, -1) },
            s.players[1],
          ] as [PlayerState, PlayerState],
          log: [...s.log, 'paso'],
        };
      };
      const envuelto = makeHistoryReducer(control);
      const acciones: Action[] = [
        { type: 'START_GAME', mode: 'cpu' },
        { type: 'END_TURN' },
        { type: 'CONFIRM_PASS' },
        { type: 'CHANGE_POSITION', fieldUid: 'u1' },
      ];

      let b: HistoryBundle = { game: initialState(), history: null };
      for (const a of acciones) {
        const esperado = control(b.game); // llamada de referencia
        const marca = llamadas;
        b = envuelto(b, { action: a });
        // El reductor de control se ha llamado exactamente una vez por acción
        // desde la envoltura: no se duplica trabajo ni se altera el estado.
        expect(llamadas).toBe(marca + 1);
        expect(b.game).toEqual(esperado);
      }
      expect(llamadas).toBe(8); // 4 de referencia + 4 de la envoltura
      expect(hist(b).entries).toHaveLength(4);
    });

    it('con el reducer real, el estado resultante coincide con el esperado', () => {
      // Sin START_GAME: no hay barajado. Se comparan los snapshots sin `uid`,
      // que el reducer genera con Math.random en cada invocación.
      const m = mon('Kraken', 10);
      const partida = estado({ p0: { hand: [mon('base', 5), m], deck: buildDeck().slice(0, 10) } });

      let puro: GameState = partida;
      let envuelto: HistoryBundle = sobre(partida);
      const acciones: Action[] = [
        { type: 'SUMMON_MONSTER', card: m, position: 'attack' },
        { type: 'END_TURN' },
        { type: 'END_TURN' },
      ];
      for (const a of acciones) {
        puro = reducer(puro, a);
        envuelto = run(envuelto, a);
      }
      expect(significantKey(snapshotState(envuelto.game))).toBe(significantKey(snapshotState(puro)));
      expect(envuelto.game.turnCount).toBe(puro.turnCount);
      expect(envuelto.game.currentPlayer).toBe(puro.currentPlayer);
      expect(envuelto.game.phase).toBe(puro.phase);
      expect(envuelto.game.log).toEqual(puro.log);
      expect(envuelto.game.players[0].hand.map((c) => c.id)).toEqual(puro.players[0].hand.map((c) => c.id));
    });

    it('un intento de Mágica que no está en la mano se registra como rechazada', () => {
      const g = estado({ p0: { hand: [mon('a', 3)] } });
      const b = run(sobre(g), { type: 'SELECT_MAGIC', card: mag({ kind: 'draw_cards', amount: 1 }, 'inexistente') });
      const e = last(hist(b).entries);
      expect(e.actionType).toBe('SELECT_MAGIC');
      expect(e.accepted).toBe(false);
      expect(hist(b).entries).toHaveLength(1);
    });

    it('las acciones de navegación sin efecto no ensucian el historial', () => {
      const g = estado();
      const b0 = sobre(g);
      // CANCEL_SELECTION y CONFIRM_PASS sin nada pendiente no cambian nada y
      // no son jugadas deliberadas: no se registran.
      const b1 = run(b0, { type: 'CANCEL_SELECTION' });
      expect(hist(b1).entries).toHaveLength(0);
      const b2 = run(b1, { type: 'CONFIRM_PASS' });
      expect(hist(b2).entries).toHaveLength(0);
      expect(JSON.stringify(st(b2))).toBe(JSON.stringify(g));
    });

    it('snapshotState no muta el estado original', () => {
      const g = estado({ p0: { hand: [mon('a')], deck: buildDeck().slice(0, 3) } });
      const antes = JSON.stringify(g);
      snapshotState(g);
      significantKey(snapshotState(g));
      expect(JSON.stringify(g)).toBe(antes);
    });

    it('historialToText y serializeHistory no mutan el historial', () => {
      const b = run(sobre(estado({ p0: { deck: [] }, p1: { lp: 0, deck: [], hand: [] } })), { type: 'END_TURN' });
      const antes = serializeHistory(hist(b));
      historyToText(hist(b));
      exportFileName(hist(b));
      expect(serializeHistory(hist(b))).toBe(antes);
    });
  });
});