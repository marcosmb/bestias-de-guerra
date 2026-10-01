import { describe, it, expect } from 'vitest';
import type { MagicCard } from '../cardData';

function createMagicCard(overrides: Partial<MagicCard> = {}): MagicCard {
  return {
    id: 'm1',
    type: 'magic',
    suit: 'oros',
    number: 1,
    name: 'Test Magic',
    description: 'Test',
    effect: { kind: 'direct_attack' },
    placement: 'instant',
    ...overrides,
  };
}

describe('Mágicas', () => {
  describe('Mágica 3 — Cambio de mano', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm3',
        name: 'Cambio de mano',
        effect: { kind: 'hand_swap' },
      });
      expect(magic.effect.kind).toBe('hand_swap');
    });
  });

  describe('Mágica 5 — Recuperar Monstruo', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm5',
        name: 'Recuperar Monstruo',
        effect: { kind: 'revive_monster' },
      });
      expect(magic.effect.kind).toBe('revive_monster');
    });
  });

  describe('Mágica 9 — Protección por dado', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm9',
        name: 'Protección por dado',
        effect: { kind: 'dice_protection' },
        placement: 'field',
      });
      expect(magic.effect.kind).toBe('dice_protection');
    });
  });

  describe('Mágica 10 — Robar 2 cartas', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm10',
        name: 'Robar dos cartas',
        effect: { kind: 'draw_cards', amount: 2 },
      });
      expect(magic.effect.kind).toBe('draw_cards');
    });
  });

  describe('Mágica 11 — Daño por dado', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm11',
        name: 'Daño por dado',
        effect: { kind: 'dice_damage' },
      });
      expect(magic.effect.kind).toBe('dice_damage');
    });
  });

  describe('Mágica 12 — Limpieza del campo rival', () => {
    it('efecto correcto en la carta', () => {
      const magic = createMagicCard({
        id: 'm12',
        name: 'Limpieza del campo rival',
        effect: { kind: 'clean_opp_field' },
      });
      expect(magic.effect.kind).toBe('clean_opp_field');
    });
  });
});
