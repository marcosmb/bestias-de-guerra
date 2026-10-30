import { describe, expect, it } from 'vitest';
import { buildDeck } from '../cardData';
import { initialState, reducer } from '../useGame';
import { createPlayer, drawCards } from '../types';

describe('Reglas de robo', () => {
  it.each([
    [7, 2, 9],
    [8, 1, 9],
    [9, 0, 9],
    [10, 0, 10],
  ])('robo automático: con %i cartas roba %i y termina con %i', (initialHand, expectedDraw, expectedHand) => {
    let nextPlayer = createPlayer(1, 'Jugador 2', buildDeck());
    nextPlayer = drawCards(nextPlayer, initialHand);

    const state = {
      ...initialState(),
      phase: 'playing' as const,
      currentPlayer: 0 as const,
      players: [createPlayer(0, 'Jugador 1', buildDeck()), nextPlayer] as [typeof nextPlayer, typeof nextPlayer],
    };

    const result = reducer(state, { type: 'END_TURN' });
    expect(result.players[1].hand).toHaveLength(expectedHand);
    expect(result.players[1].deck).toHaveLength(nextPlayer.deck.length - expectedDraw);
  });

  it('Mágica 10 roba 2 aunque la mano tenga 9 cartas antes de jugarla', () => {
    let player = createPlayer(0, 'Jugador 1', buildDeck());
    const magic = player.deck.find((card) => card.id === 'm10');
    expect(magic).toBeDefined();
    if (!magic) throw new Error('No se encontró Mágica 10');

    const fillers = player.deck.filter((card) => card.instanceId !== magic.instanceId).slice(0, 8);
    const handInstances = new Set([...fillers, magic].map((card) => card.instanceId));
    player = {
      ...player,
      hand: [...fillers, magic],
      deck: player.deck.filter((card) => !handInstances.has(card.instanceId)),
    };

    const opponent = createPlayer(1, 'Jugador 2', buildDeck());
    const state = {
      ...initialState(),
      phase: 'playing' as const,
      currentPlayer: 0 as const,
      players: [player, opponent] as [typeof player, typeof opponent],
    };

    const result = reducer(state, { type: 'SELECT_MAGIC', card: magic });
    expect(result.players[0].hand).toHaveLength(10);
    expect(result.players[0].hand.some((card) => card.instanceId === magic.instanceId)).toBe(false);
    expect(result.players[0].deck).toHaveLength(player.deck.length - 2);
  });
});
