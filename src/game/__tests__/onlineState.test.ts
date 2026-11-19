import { describe, expect, it } from 'vitest';
import { buildDeck, MAGICS, TRAPS, type Card } from '../cardData';
import { initialState } from '../useGame';
import { createPlayer, type FieldMonster, type GameState } from '../types';
import { filterOnlineState } from '../onlineState';

function stateWithPlayers(): GameState {
  const player0 = createPlayer(0, 'Jugador 1', buildDeck());
  const player1 = createPlayer(1, 'Jugador 2', buildDeck());
  player0.hand = player0.deck.slice(0, 2);
  player0.deck = player0.deck.slice(2);
  player1.hand = player1.deck.slice(0, 3);
  player1.deck = player1.deck.slice(3);
  return { ...initialState(), phase: 'playing', players: [player0, player1] };
}

function fieldMonster(card: Card, overrides: Partial<FieldMonster> = {}): FieldMonster {
  if (card.type !== 'monster') throw new Error('Expected a monster card');
  return {
    uid: 'field-monster-1',
    card,
    position: 'defense',
    faceDown: true,
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

describe('filterOnlineState', () => {
  it('preserves the viewer hand and deck while masking opponent hand and deck contents', () => {
    const state = stateWithPlayers();
    const opponentCards = [...state.players[1].hand, ...state.players[1].deck];
    const filtered = filterOnlineState(state, 0);
    const filteredOpponentCards = [...filtered.players[1].hand, ...filtered.players[1].deck];

    expect(filtered.players[0].hand).toBe(state.players[0].hand);
    expect(filtered.players[0].deck).toBe(state.players[0].deck);
    expect(filtered.players[1].hand).toHaveLength(state.players[1].hand.length);
    expect(filtered.players[1].deck).toHaveLength(state.players[1].deck.length);
    const serializedOpponentCards = JSON.stringify(filteredOpponentCards);
    for (const card of opponentCards) {
      expect(serializedOpponentCards).not.toContain(card.id);
      expect(serializedOpponentCards).not.toContain(card.name);
      if (card.instanceId) expect(serializedOpponentCards).not.toContain(card.instanceId);
    }
    expect(filteredOpponentCards.every((card) => card.name === 'Carta oculta')).toBe(true);

    const filteredForPlayer2 = filterOnlineState(state, 1);
    expect(filteredForPlayer2.players[1].hand).toBe(state.players[1].hand);
    expect(filteredForPlayer2.players[1].deck).toBe(state.players[1].deck);
    expect(JSON.stringify(filteredForPlayer2.players[0].hand)).not.toContain(state.players[0].hand[0].name);
  });

  it('hides face-down opponent monsters and unrevealed traps and magic', () => {
    const state = stateWithPlayers();
    const originalMonster = state.players[1].deck.find((card) => card.type === 'monster');
    if (!originalMonster || originalMonster.type !== 'monster') throw new Error('Expected a monster in deck');
    const trap = { ...TRAPS[4], instanceId: 'trap-instance-secret', owner: 1 as const };
    const magic = { ...MAGICS[4], instanceId: 'magic-instance-secret', owner: 1 as const };
    const opponent = state.players[1];
    opponent.field[0] = fieldMonster(originalMonster, { trap, magic });

    const filteredMonster = filterOnlineState(state, 0).players[1].field[0];
    if (!filteredMonster) throw new Error('Expected a field monster');

    expect(filteredMonster.card.name).toBe('Carta oculta');
    expect(filteredMonster.card.id).not.toBe(originalMonster.id);
    expect(filteredMonster.trap?.name).toBe('Carta oculta');
    expect(filteredMonster.trap?.instanceId).not.toBe(trap.instanceId);
    expect(filteredMonster.magic?.name).toBe('Carta oculta');
    expect(filteredMonster.magic?.instanceId).not.toBe(magic.instanceId);
  });

  it('masks unplaced opponent trap and magic selections but preserves the owner view', () => {
    const state = stateWithPlayers();
    const selectedTrap = { ...TRAPS[4], instanceId: 'selected-trap-secret', owner: 1 as const };
    const selectedMagic = { ...MAGICS[4], instanceId: 'selected-magic-secret', owner: 1 as const };
    state.currentPlayer = 1;
    state.selection = { kind: 'place-trap', card: selectedTrap };

    const opponentView = filterOnlineState(state, 0);
    const ownerView = filterOnlineState(state, 1);
    expect(opponentView.selection.kind).toBe('place-trap');
    if (opponentView.selection.kind !== 'place-trap') throw new Error('Expected a trap placement selection');
    expect(opponentView.selection.card.name).toBe('Carta oculta');
    expect(opponentView.selection.card.instanceId).not.toBe(selectedTrap.instanceId);
    expect(ownerView.selection).toEqual(state.selection);

    state.selection = { kind: 'place-magic', card: selectedMagic };
    const hiddenMagicSelection = filterOnlineState(state, 0).selection;
    expect(hiddenMagicSelection.kind).toBe('place-magic');
    if (hiddenMagicSelection.kind !== 'place-magic') throw new Error('Expected a magic placement selection');
    expect(hiddenMagicSelection.card.name).toBe('Carta oculta');
    expect(hiddenMagicSelection.card.instanceId).not.toBe(selectedMagic.instanceId);
  });

  it('retains revealed information but does not disclose the underlying owner or instance id for hidden cards', () => {
    const state = stateWithPlayers();
    const opponent = state.players[1];
    const visibleMonster = opponent.deck.find((card) => card.type === 'monster');
    if (!visibleMonster || visibleMonster.type !== 'monster') throw new Error('Expected a monster in deck');
    const trap = { ...TRAPS[4], instanceId: 'revealed-trap-instance', owner: 1 as const };
    opponent.field[0] = fieldMonster(visibleMonster, {
      faceDown: false,
      trap,
      trapRevealed: true,
    });

    const filteredMonster = filterOnlineState(state, 0).players[1].field[0];
    if (!filteredMonster) throw new Error('Expected a field monster');

    expect(filteredMonster.card.name).toBe(visibleMonster.name);
    expect(filteredMonster.trap?.name).toBe(trap.name);
    expect(filteredMonster.trap?.instanceId).toBe(trap.instanceId);
  });
});
