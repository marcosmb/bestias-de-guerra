import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useGame';
import { hasPlayableCard, canPlayCardNow, MAX_CARDS_PER_TURN } from '../types';
import type { Action, GameState, PlayerState } from '../types';
import { createPlayer, drawCards } from '../types';
import { buildDeck, type MagicCard, type MonsterCard, type TrapCard } from '../cardData';

/**
 * REGRESIÓN — Regla 27.2: la cuota de 3 cartas por turno NO es un bloqueo.
 *
 * Contexto: antes, `hasPlayableCard` devolvía false en cuanto un jugador
 * alcanzaba `cardsPlayedThisTurn === 3`. Como el contador se reinicia en
 * END_TURN, dos jugadores que llegaban a 3/3 al mismo tiempo hacían que la
 * partida terminase en empate/victoria falsa con las manos y los mazos llenos.
 */

function freshGame(): GameState {
  let p0 = createPlayer(0, 'Jugador 1', buildDeck());
  p0 = drawCards(p0, 7);
  let p1 = createPlayer(1, 'Jugador 2', buildDeck());
  p1 = drawCards(p1, 7);
  const s = reducer(initialState(), { type: 'START_GAME', mode: 'local' });
  return { ...s, phase: 'playing', currentPlayer: 0, turnCount: 1, players: [p0, p1] };
}

function run(s: GameState, ...a: Action[]): GameState {
  return a.reduce((acc, act) => reducer(acc, act), s);
}

/** Juega una carta legal del jugador indicado (sin importar el tipo). */
function playAnyCard(s: GameState, idx: 0 | 1): GameState {
  const pl = s.players[idx];
  const mon = pl.hand.find((c): c is MonsterCard => c.type === 'monster');
  const hasSpace = pl.field.some((f) => f === null);
  if (mon && hasSpace) {
    return run(s, { type: 'SUMMON_MONSTER', card: mon, position: 'attack' });
  }
  const trp = pl.hand.find((c): c is TrapCard => c.type === 'trap');
  const target = pl.field.find((f) => f !== null && f.trap === null);
  if (trp && target) {
    return run(s, { type: 'PLACE_TRAP_ON_MONSTER', card: trp, fieldUid: target.uid });
  }
  const mag = pl.hand.find((c): c is MagicCard => c.type === 'magic');
  if (mag) {
    const next = run(s, { type: 'SELECT_MAGIC', card: mag });
    if (next.selection.kind === 'revive-choice') {
      return run(next, { type: 'REVIVE_CHOICE', card: mag, choice: 'field' });
    }
    if (next.selection.kind !== 'none') return run(next, { type: 'CANCEL_SELECTION' });
    return next;
  }
  return s;
}

/** Juega cartas hasta agotar la cuota de 3 del turno. */
function fillTurnQuota(s: GameState, idx: 0 | 1): GameState {
  let cur = s;
  for (let i = 0; i < MAX_CARDS_PER_TURN; i++) {
    if (cur.players[idx].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) break;
    const before = cur.players[idx].hand.length;
    cur = playAnyCard(cur, idx);
    if (cur.players[idx].hand.length === before) break;
  }
  return cur;
}

describe('REGRESIÓN · Regla 27.2 y la cuota de 3 cartas por turno', () => {
  it('hasPlayableCard ignora cardsPlayedThisTurn', () => {
    let s = freshGame();
    s = fillTurnQuota(s, 0);

    expect(s.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);
    // Aun así tiene cartas disponibles: la partida puede continuar.
    expect(hasPlayableCard(s.players[0], s)).toBe(true);
    // Y la cuota del turno sí impide jugar una cuarta carta ahora mismo.
    expect(canPlayCardNow(s.players[0], s)).toBe(false);
  });

  it('ambos jugadores en 3/3 no terminan la partida (el bug original)', () => {
    let s = freshGame();

    // J1 agota su cuota y pasa turno.
    s = fillTurnQuota(s, 0);
    expect(s.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);
    expect(s.phase).toBe('playing');

    s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    expect(s.currentPlayer).toBe(1);

    // J2 agota su cuota. Este era el momento exacto del fallo.
    s = fillTurnQuota(s, 1);
    expect(s.players[1].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);

    // La partida debe continuar: ambos tienen cartas en mano y mazo.
    expect(s.phase).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.isDraw).toBe(false);
    expect(s.players[0].hand.length).toBeGreaterThan(0);
    expect(s.players[1].hand.length).toBeGreaterThan(0);
  });

  it('el escenario numérico reportado: 100/100 LP, manos y mazos llenos', () => {
    let s = freshGame();
    // Nos fijamos en el caso que se observó en partida real.
    expect(s.players[0].lp).toBe(100);
    expect(s.players[1].lp).toBe(100);

    s = fillTurnQuota(s, 0);
    s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    s = fillTurnQuota(s, 1);

    expect(s.players[0].lp).toBe(100);
    expect(s.players[1].lp).toBe(100);
    expect(s.players[0].deck.length).toBeGreaterThan(0);
    expect(s.players[1].deck.length).toBeGreaterThan(0);
    expect(s.phase).toBe('playing');
    expect(s.isDraw).toBe(false);
  });

  it('el límite de 3 cartas sigue bloqueando la cuarta carta del mismo turno', () => {
    let s = freshGame();
    s = fillTurnQuota(s, 0);
    expect(s.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);

    // Aunque quedan huecos en el campo y cartas en mano, el reducer rechaza
    // cualquier carta adicional en ESTE turno.
    const mon = s.players[0].hand.find((c): c is MonsterCard => c.type === 'monster');
    expect(mon).toBeDefined();
    const fieldBefore = s.players[0].field.filter(Boolean).length;
    s = run(s, { type: 'SUMMON_MONSTER', card: mon!, position: 'attack' });
    expect(s.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);
    expect(s.players[0].field.filter(Boolean).length).toBe(fieldBefore);
  });

  it('tras END_TURN la cuota se reinicia y el jugador vuelve a poder jugar', () => {
    let s = freshGame();
    s = fillTurnQuota(s, 0);
    expect(s.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);
    expect(canPlayCardNow(s.players[0], s)).toBe(false);

    s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    // END_TURN reinicia la cuota del jugador que ENTRA en turno.
    expect(s.currentPlayer).toBe(1);
    expect(s.players[1].cardsPlayedThisTurn).toBe(0);

    // J2 cede el turno: ahora sí vuelve a ser el turno de J1 con cuota a cero.
    s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
    expect(s.currentPlayer).toBe(0);
    expect(s.players[0].cardsPlayedThisTurn).toBe(0);
    expect(canPlayCardNow(s.players[0], s)).toBe(true);

    const mon = s.players[0].hand.find((c): c is MonsterCard => c.type === 'monster');
    const before = s.players[0].field.filter(Boolean).length;
    s = run(s, { type: 'SUMMON_MONSTER', card: mon!, position: 'attack' });
    expect(s.players[0].field.filter(Boolean).length).toBe(before + 1);
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it('el bloqueo real sigue funcionando: sin cartas jugables termina la partida', () => {
    const s: GameState = {
      ...initialState(),
      phase: 'playing',
      mode: 'local',
      turnCount: 2,
      players: [
        { ...createPlayer(0, 'Jugador 1', []), hand: [], field: [null, null, null, null, null, null] },
        { ...createPlayer(1, 'Jugador 2', []), hand: [], field: [null, null, null, null, null, null], lp: 60 },
      ] as [PlayerState, PlayerState],
    };
    const p1: PlayerState = { ...s.players[0], lp: 80 };

    // J1 sin cartas jugables y con 0/3 (no está gastando cuota).
    expect(hasPlayableCard(p1, s)).toBe(false);
    expect(hasPlayableCard(s.players[1], s)).toBe(false);

    const next = run(s, { type: 'END_TURN' });
    expect(next.phase).toBe('game-over');
    expect(next.winner).toBe(0);
    expect(next.isDraw).toBe(false);
  });

  it('una partida completa de 6 turnos no termina de forma prematura', () => {
    let s = freshGame();
    for (let t = 0; t < 3; t++) {
      s = fillTurnQuota(s, 0);
      s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
      expect(s.phase).toBe('playing');
      s = fillTurnQuota(s, 1);
      s = run(s, { type: 'END_TURN' }, { type: 'CONFIRM_PASS' });
      expect(s.phase).toBe('playing');
    }
    expect(s.players[0].lp).toBe(100);
    expect(s.players[1].lp).toBe(100);
  });
});