import { describe, it, expect } from 'vitest';
import { createPlayer, drawCards, shuffleDeck } from '../types';
import { buildDeck } from '../cardData';

describe('Mazo y cementerio', () => {
  describe('Mazo', () => {
    it('48 cartas en el mazo', () => {
      const deck = buildDeck();
      expect(deck.length).toBe(48);
    });

    it('mazo barajado tiene 48 cartas', () => {
      const deck = shuffleDeck(buildDeck());
      expect(deck.length).toBe(48);
    });

    it('robo reduce el mazo', () => {
      const deck = shuffleDeck(buildDeck());
      const player = createPlayer(0, 'Test', deck);
      const playerWithHand = drawCards(player, 7);
      expect(playerWithHand.deck.length).toBe(41);
    });

    it('mazo vacío no se puede robar', () => {
      const player = createPlayer(0, 'Test', []);
      const playerWithHand = drawCards(player, 5);
      expect(playerWithHand.hand.length).toBe(0);
    });
  });

  describe('Cementerio', () => {
    it('cementerio vacío al inicio', () => {
      const player = createPlayer(0, 'Test', []);
      expect(player.graveyard.length).toBe(0);
    });

    it('cementerio puede contener cartas', () => {
      const player = createPlayer(0, 'Test', []);
      const playerWithGraveyard = {
        ...player,
        graveyard: [...player.graveyard, buildDeck()[0]],
      };
      expect(playerWithGraveyard.graveyard.length).toBe(1);
    });
  });
});
