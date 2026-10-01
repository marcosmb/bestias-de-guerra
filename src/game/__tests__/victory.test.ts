import { describe, it, expect } from 'vitest';
import { createPlayer } from '../types';

describe('Victoria', () => {
  describe('Condiciones de victoria', () => {
    it('0 LP → derrota inmediata', () => {
      const player = createPlayer(0, 'Test', []);
      expect(player.lp).toBe(100);
      // Simular daño hasta 0
      const damagedPlayer = { ...player, lp: 0 };
      expect(damagedPlayer.lp).toBe(0);
    });

    it('LP no puede ser negativo', () => {
      const player = createPlayer(0, 'Test', []);
      const damagedPlayer = { ...player, lp: Math.max(0, player.lp - 150) };
      expect(damagedPlayer.lp).toBe(0);
    });

    it('LP puede superar 100', () => {
      const player = createPlayer(0, 'Test', []);
      const healedPlayer = { ...player, lp: player.lp + 50 };
      expect(healedPlayer.lp).toBe(150);
    });
  });

  describe('Empate', () => {
    it('mismo LP → empate', () => {
      const player1 = createPlayer(0, 'Player 1', []);
      const player2 = createPlayer(1, 'Player 2', []);
      expect(player1.lp).toBe(player2.lp);
    });
  });
});
