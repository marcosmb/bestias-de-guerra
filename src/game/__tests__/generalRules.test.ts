import { describe, it, expect } from 'vitest';
import {
  createPlayer,
  drawCards,
  shuffleDeck,
  hasEmptySlot,
  getFirstEmptySlot,
} from '../types';
import { buildDeck } from '../cardData';

describe('Reglas generales', () => {
  describe('Preparación de partida', () => {
    it('100 LP iniciales', () => {
      const player = createPlayer(0, 'Test', []);
      expect(player.lp).toBe(100);
    });

    it('7 cartas iniciales', () => {
      const deck = shuffleDeck(buildDeck());
      const player = createPlayer(0, 'Test', deck);
      const playerWithHand = drawCards(player, 7);
      expect(playerWithHand.hand.length).toBe(7);
    });

    it('drawCards no aplica un límite general al tamaño de la mano', () => {
      const deck = shuffleDeck(buildDeck());
      const player = createPlayer(0, 'Test', deck);
      const playerWithHand = drawCards(player, 10);
      expect(playerWithHand.hand.length).toBe(10);
    });
  });

  describe('Campo de monstruos', () => {
    it('máximo 6 espacios de monstruos', () => {
      const player = createPlayer(0, 'Test', []);
      expect(player.field.length).toBe(6);
    });

    it('todos los espacios vacíos al inicio', () => {
      const player = createPlayer(0, 'Test', []);
      expect(hasEmptySlot(player)).toBe(true);
      expect(getFirstEmptySlot(player)).toBe(0);
    });
  });

  describe('Mazo', () => {
    it('48 cartas en el mazo', () => {
      const deck = buildDeck();
      expect(deck.length).toBe(48);
    });

    it('12 monstruos de espadas', () => {
      const deck = buildDeck();
      const espadas = deck.filter((c: { suit: string }) => c.suit === 'espadas');
      expect(espadas.length).toBe(12);
    });

    it('12 monstruos de bastos', () => {
      const deck = buildDeck();
      const bastos = deck.filter((c: { suit: string }) => c.suit === 'bastos');
      expect(bastos.length).toBe(12);
    });

    it('12 trampas de copas', () => {
      const deck = buildDeck();
      const copas = deck.filter((c: { suit: string }) => c.suit === 'copas');
      expect(copas.length).toBe(12);
    });

    it('12 mágicas de oros', () => {
      const deck = buildDeck();
      const oros = deck.filter((c: { suit: string }) => c.suit === 'oros');
      expect(oros.length).toBe(12);
    });
  });
});
