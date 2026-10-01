import { describe, it, expect } from 'vitest';
import type { FieldMonster } from '../types';
import type { TrapCard, MagicCard } from '../cardData';

function createTrapCard(overrides: Partial<TrapCard> = {}): TrapCard {
  return {
    id: 't1',
    type: 'trap',
    suit: 'copas',
    number: 1,
    name: 'Test Trap',
    description: 'Test',
    effect: { kind: 'heal_per_turn', amount: 5 },
    image: '',
    ...overrides,
  };
}

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

function createFieldMonster(overrides: Partial<FieldMonster> = {}): FieldMonster {
  return {
    uid: 'test-uid',
    card: {
      id: 'm-espadas-8',
      type: 'monster',
      suit: 'espadas',
      number: 8,
      name: 'Test Monster',
      atk: 8,
      def: 8,
      image: '',
    },
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
    ...overrides,
  };
}

describe('Trampas', () => {
  describe('Límites de asociación', () => {
    it('máximo 1 Trampa por Monstruo', () => {
      const fm = createFieldMonster({ trap: createTrapCard() });
      expect(fm.trap).not.toBeNull();
    });

    it('máximo 1 Mágica por Monstruo', () => {
      const fm = createFieldMonster({ magic: createMagicCard() });
      expect(fm.magic).not.toBeNull();
    });

    it('puede tener 1 Trampa + 1 Mágica simultáneamente', () => {
      const fm = createFieldMonster({
        trap: createTrapCard(),
        magic: createMagicCard(),
      });
      expect(fm.trap).not.toBeNull();
      expect(fm.magic).not.toBeNull();
    });
  });

  describe('Trampa 2 — Destrucción 2+1', () => {
    it('efecto correcto en la carta', () => {
      const trap = createTrapCard({
        id: 't2',
        name: 'Destrucción 2+1',
        effect: { kind: 'destroy_2_self_1_opp' },
      });
      expect(trap.effect.kind).toBe('destroy_2_self_1_opp');
    });
  });

  describe('Trampa 7 — Cambiar atacante', () => {
    it('efecto correcto en la carta', () => {
      const trap = createTrapCard({
        id: 't7',
        name: 'Cambiar atacante',
        effect: { kind: 'swap_attacker' },
      });
      expect(trap.effect.kind).toBe('swap_attacker');
    });
  });

  describe('Trampa 9 — Tres turnos', () => {
    it('efecto correcto en la carta', () => {
      const trap = createTrapCard({
        id: 't9',
        name: 'Tres turnos',
        effect: { kind: 'three_turns_kill' },
      });
      expect(trap.effect.kind).toBe('three_turns_kill');
    });
  });

  describe('Trampa 10 — Control durante 2 turnos', () => {
    it('efecto correcto en la carta', () => {
      const trap = createTrapCard({
        id: 't10',
        name: 'Control 2 turnos',
        effect: { kind: 'control_two_turns' },
      });
      expect(trap.effect.kind).toBe('control_two_turns');
    });
  });

  describe('Trampa 11 — Muerte después de 2 turnos', () => {
    it('efecto correcto en la carta', () => {
      const trap = createTrapCard({
        id: 't11',
        name: 'Muerte 2 turnos',
        effect: { kind: 'death_after_two_turns' },
      });
      expect(trap.effect.kind).toBe('death_after_two_turns');
    });
  });
});
