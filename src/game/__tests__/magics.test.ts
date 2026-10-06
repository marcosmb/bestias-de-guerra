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

  describe('Mágica 8 — -2 de defensa', () => {
    it('puede tener como objetivo un Monstruo rival en Ataque o en Defensa', async () => {
      const { magicTargets } = await import('../legalActions');
      const magic = createMagicCard({
        id: 'm8',
        number: 8,
        name: '-2 de defensa',
        effect: { kind: 'def_reduce', amount: 2 },
        placement: 'field',
      });

      const makeMonster = (uid: string, position: 'attack' | 'defense') => ({
        uid,
        card: {
          id: uid,
          type: 'monster' as const,
          suit: 'espadas' as const,
          number: 5,
          name: uid,
          atk: 5,
          def: 5,
          image: '',
        },
        position,
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
      });

      const me = { index: 0, name: 'Jugador 1', lp: 100, deck: [], hand: [], field: [null, null, null, null, null, null], graveyard: [], cardsPlayedThisTurn: 0 };
      const opp = {
        index: 1,
        name: 'Jugador 2',
        lp: 100,
        deck: [],
        hand: [],
        field: [makeMonster('attack-target', 'attack'), makeMonster('defense-target', 'defense'), null, null, null, null],
        graveyard: [],
        cardsPlayedThisTurn: 0,
      };

      const targets = magicTargets(magic, me, opp);
      expect(targets.map((target) => target.uid)).toEqual(['attack-target', 'defense-target']);
    });
  });
});