import { describe, it, expect } from 'vitest';
import { resolveCombat, getEffectiveAtk, getEffectiveDef } from '../types';
import type { FieldMonster } from '../types';

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

describe('Combate', () => {
  describe('ATQ contra ATQ', () => {
    it('ATQ > ATQ: defensor destruido, daño = diferencia', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 8, def: 8 } });
      const defender = createFieldMonster({ card: { ...createFieldMonster().card, atk: 5, def: 5 } });
      const result = resolveCombat(attacker, defender);
      expect(result.defenderDestroyed).toBe(true);
      expect(result.attackerDestroyed).toBe(false);
      expect(result.defenderDamage).toBe(3); // 8 - 5 = 3
    });

    it('ATQ < ATQ: atacante destruido, daño = diferencia', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 5, def: 5 } });
      const defender = createFieldMonster({ card: { ...createFieldMonster().card, atk: 8, def: 8 } });
      const result = resolveCombat(attacker, defender);
      expect(result.attackerDestroyed).toBe(true);
      expect(result.defenderDestroyed).toBe(false);
      expect(result.attackerDamage).toBe(3); // 8 - 5 = 3
    });

    it('ATQ = ATQ: ambos destruidos, 0 daño', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 8, def: 8 } });
      const defender = createFieldMonster({ card: { ...createFieldMonster().card, atk: 8, def: 8 } });
      const result = resolveCombat(attacker, defender);
      expect(result.attackerDestroyed).toBe(true);
      expect(result.defenderDestroyed).toBe(true);
      expect(result.attackerDamage).toBe(0);
      expect(result.defenderDamage).toBe(0);
    });
  });

  describe('ATQ contra DEF', () => {
    it('ATQ > DEF: defensor destruido, 0 daño', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 9, def: 9 } });
      const defender = createFieldMonster({ position: 'defense', card: { ...createFieldMonster().card, atk: 6, def: 6 } });
      const result = resolveCombat(attacker, defender);
      expect(result.defenderDestroyed).toBe(true);
      expect(result.attackerDestroyed).toBe(false);
      expect(result.defenderDamage).toBe(0);
    });

    it('ATQ < DEF: atacante sobrevive, daño = DEF - ATQ', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 6, def: 6 } });
      const defender = createFieldMonster({ position: 'defense', card: { ...createFieldMonster().card, atk: 9, def: 9 } });
      const result = resolveCombat(attacker, defender);
      expect(result.attackerDestroyed).toBe(false);
      expect(result.defenderDestroyed).toBe(false);
      expect(result.attackerDamage).toBe(3); // 9 - 6 = 3
    });

    it('ATQ = DEF: ninguno destruido, 0 daño', () => {
      const attacker = createFieldMonster({ card: { ...createFieldMonster().card, atk: 7, def: 7 } });
      const defender = createFieldMonster({ position: 'defense', card: { ...createFieldMonster().card, atk: 7, def: 7 } });
      const result = resolveCombat(attacker, defender);
      expect(result.attackerDestroyed).toBe(false);
      expect(result.defenderDestroyed).toBe(false);
      expect(result.attackerDamage).toBe(0);
      expect(result.defenderDamage).toBe(0);
    });
  });

  describe('Modificadores temporales', () => {
    it('getEffectiveAtk incluye tempAtkModifier', () => {
      const fm = createFieldMonster({ tempAtkModifier: 2 });
      expect(getEffectiveAtk(fm)).toBe(10);
    });

    it('getEffectiveDef incluye tempDefModifier', () => {
      const fm = createFieldMonster({ tempDefModifier: -2 });
      expect(getEffectiveDef(fm)).toBe(6);
    });

    it('ATQ no puede ser negativo', () => {
      const fm = createFieldMonster({ tempAtkModifier: -15 });
      expect(getEffectiveAtk(fm)).toBe(0);
    });

    it('DEF no puede ser negativo', () => {
      const fm = createFieldMonster({ tempDefModifier: -15 });
      expect(getEffectiveDef(fm)).toBe(0);
    });
  });
});
