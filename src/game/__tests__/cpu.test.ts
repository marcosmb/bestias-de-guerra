import { describe, it, expect } from 'vitest';
import { nextCpuAction } from '../cpu';
import { legalTargets, canDirectAttack } from '../legalActions';
import type { GameState, FieldMonster, PlayerState, Action } from '../types';
import { createPlayer, shuffleDeck } from '../types';
import { buildDeck } from '../cardData';
import type { Card, MonsterCard } from '../cardData';

// ---------- Helpers de construcción de estado ----------

function monster(overrides: Partial<MonsterCard> = {}): MonsterCard {
  return {
    id: `m-espadas-${overrides.atk ?? 5}`,
    type: 'monster',
    suit: 'espadas',
    number: overrides.atk ?? 5,
    name: `Monstruo ${overrides.atk ?? 5}`,
    atk: 5,
    def: 5,
    image: '',
    ...overrides,
  };
}

function fieldMonster(
  card: MonsterCard,
  overrides: Partial<FieldMonster> = {},
): FieldMonster {
  return {
    uid: `uid-${card.id}`,
    card,
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

function playerWith(
  index: 0 | 1,
  field: (FieldMonster | null)[],
  hand: Card[] = [],
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    ...createPlayer(index, `Jugador ${index + 1}`, shuffleDeck(buildDeck())),
    field,
    hand,
    ...overrides,
  };
}

function makeState(
  cpuField: (FieldMonster | null)[],
  humanField: (FieldMonster | null)[],
  options: {
    cpuHand?: Card[];
    humanHand?: Card[];
    difficulty?: GameState['difficulty'];
    selection?: GameState['selection'];
    turnCount?: number;
    cpuPlayed?: number;
    cpuDeckCount?: number;
    cpuGraveyard?: Card[];
  } = {},
): GameState {
  return {
    phase: 'playing',
    mode: 'cpu',
    difficulty: options.difficulty ?? 'normal',
    currentPlayer: 1,
    turnCount: options.turnCount ?? 1,
    stateVersion: 0,
    players: [
      playerWith(0, humanField, options.humanHand ?? []),
      playerWith(1, cpuField, options.cpuHand ?? [], {
        cardsPlayedThisTurn: options.cpuPlayed ?? 0,
        deck: new Array(options.cpuDeckCount ?? 20).fill(buildDeck()[0]),
        graveyard: options.cpuGraveyard ?? [],
      }),
    ],
    selection: options.selection ?? { kind: 'none' },
    log: [],
    winner: null,
    isDraw: false,
    pendingTrap: null,
    pendingDice: null,
    lastCombat: null,
    passTarget: 1,
    diceResult: null,
  };
}

const emptyField = (): (FieldMonster | null)[] => [null, null, null, null, null, null];

// ---------- Tests ----------

describe('CPU — objetivos legales (Regla 22)', () => {
  it('con monstruos en Defensa siguen siendo legales todos los Monstruos rivales como objetivo', () => {
    const inAttack = fieldMonster(monster({ atk: 8 }), { uid: 'a' });
    const inDefense = fieldMonster(monster({ atk: 2, def: 2 }), {
      uid: 'd',
      position: 'defense',
      faceDown: true,
    });

    const targets = legalTargets([inAttack, inDefense]);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.uid).sort()).toEqual(['a', 'd']);
  });

  it('sin monstruos en Defensa, son legales los de Ataque', () => {
    const a = fieldMonster(monster({ atk: 8 }), { uid: 'a' });
    const b = fieldMonster(monster({ atk: 4 }), { uid: 'b' });

    expect(legalTargets([a, b])).toHaveLength(2);
  });

  it('ataque directo NO es legal si hay monstruos en Defensa', () => {
    const d = fieldMonster(monster(), { uid: 'd', position: 'defense' });
    expect(canDirectAttack([d])).toBe(false);
  });

  it('ataque directo SÍ es legal si no hay monstruos en Defensa', () => {
    const a = fieldMonster(monster(), { uid: 'a' });
    expect(canDirectAttack([a])).toBe(true);
    expect(canDirectAttack([])).toBe(true);
  });
});

describe('CPU — legalidad de las acciones', () => {
  it('elige entre objetivos de Ataque o Defensa según la estrategia vigente', () => {
    const attacker = fieldMonster(monster({ atk: 10, def: 10 }), { uid: 'atk' });
    const humanAttack = fieldMonster(monster({ atk: 1 }), { uid: 'human-atk' });
    const humanDefense = fieldMonster(monster({ atk: 12, def: 12 }), {
      uid: 'human-def',
      position: 'defense',
      faceDown: true,
    });

    const state = makeState([attacker], [humanAttack, humanDefense]);
    const action = nextCpuAction(state);

    expect(action.type).toBe('DECLARE_ATTACK');
    if (action.type === 'DECLARE_ATTACK') {
      expect(['human-atk', 'human-def']).toContain(action.defenderUid);
    }
  });

  it('no ataca con un monstruo en Defensa', () => {
    const cpuDef = fieldMonster(monster({ atk: 8 }), {
      uid: 'cpu-def',
      position: 'defense',
      faceDown: true,
    });
    const humanAtk = fieldMonster(monster({ atk: 1 }), { uid: 'h' });

    const action = nextCpuAction(makeState([cpuDef], [humanAtk]));

    expect(action.type).not.toBe('DECLARE_ATTACK');
    expect(action.type).not.toBe('DIRECT_ATTACK');
  });

  it('no vuelve a atacar con un monstruo que ya atacó', () => {
    const used = fieldMonster(monster({ atk: 10 }), { uid: 'used', hasAttacked: true });
    const humanAtk = fieldMonster(monster({ atk: 1 }), { uid: 'h' });

    const action = nextCpuAction(makeState([used], [humanAtk]));

    expect(action.type).not.toBe('DECLARE_ATTACK');
    expect(action.type).not.toBe('DIRECT_ATTACK');
  });

  it('el primer turno del jugador 1 bloquea el ataque (canAttack)', () => {
    const attacker = fieldMonster(monster({ atk: 10 }), { uid: 'a' });
    const state = makeState([attacker], [fieldMonster(monster({ atk: 1 }), { uid: 'h' })], {
      turnCount: 0,
    });
    state.currentPlayer = 0; // canAttack() devuelve false en turno 0 con jugador 0

    const action = nextCpuAction(state);
    expect(action.type).not.toBe('DECLARE_ATTACK');
  });

  it('no supera el límite de 3 cartas por turno', () => {
    const state = makeState(emptyField(), emptyField(), {
      cpuHand: [monster({ atk: 5 }), monster({ atk: 6 }), monster({ atk: 7 }), monster({ atk: 8 })],
      cpuPlayed: 3,
    });

    const action = nextCpuAction(state);
    expect(action.type).not.toBe('SUMMON_MONSTER');
    expect(action.type).not.toBe('SELECT_TRAP_PLACE');
    expect(action.type).not.toBe('SELECT_MAGIC');
  });

  it('no invoca si el campo está lleno', () => {
    const fullField = Array.from({ length: 6 }, (_, i) =>
      fieldMonster(monster({ atk: 5, number: i + 1 }), { uid: `f${i}` }),
    );
    const state = makeState(fullField, emptyField(), {
      cpuHand: [monster({ atk: 9 })],
      cpuPlayed: 0,
    });

    const action = nextCpuAction(state);
    expect(action.type).not.toBe('SUMMON_MONSTER');
  });

  it('no coloca Trampa si todos los monstruos tienen ya Trampa', () => {
    const trapCard = {
      id: 't1', type: 'trap' as const, suit: 'copas' as const, number: 1,
      name: 'Trampa', description: '',
      effect: { kind: 'heal_per_turn' as const, amount: 5 }, image: '',
    };
    const withTrap = fieldMonster(monster({ atk: 5 }), { uid: 't', trap: trapCard });

    const action = nextCpuAction(makeState([withTrap], emptyField(), {
      cpuHand: [{ ...trapCard, id: 't2' }],
    }));

    expect(action.type).not.toBe('SELECT_TRAP_PLACE');
  });
});

describe('CPU — ataque directo', () => {
  it('hace ataque directo si el rival no tiene monstruos (Regla 22.3)', () => {
    const attacker = fieldMonster(monster({ atk: 7 }), { uid: 'a' });
    const action = nextCpuAction(makeState([attacker], emptyField()));

    expect(action.type).toBe('DIRECT_ATTACK');
  });

  it('no hace ataque directo si hay monstruos en Defensa (Regla 22.1)', () => {
    const attacker = fieldMonster(monster({ atk: 7 }), { uid: 'a' });
    const humanDefense = fieldMonster(monster({ atk: 1 }), {
      uid: 'd', position: 'defense', faceDown: true,
    });

    const action = nextCpuAction(makeState([attacker], [humanDefense]));

    expect(action.type).not.toBe('DIRECT_ATTACK');
  });

  it('puede hacer ataque directo si el rival solo tiene monstruos en Ataque (Regla 22.2)', () => {
    const attacker = fieldMonster(monster({ atk: 7 }), { uid: 'a' });
    const humanAttack = fieldMonster(monster({ atk: 12, def: 12 }), { uid: 'h' });

    const action = nextCpuAction(makeState([attacker], [humanAttack], { difficulty: 'hard' }));

    // Con un monstruo 12 en Ataque no es letal atacarlo, así que opta por directo.
    expect(action.type).toBe('DIRECT_ATTACK');
  });
});

describe('CPU — uso de las 3 cartas por turno', () => {
  it('puede jugar varias cartas en el mismo turno (ya no solo 1)', () => {
    const state = makeState(emptyField(), emptyField(), {
      cpuHand: [monster({ atk: 5 }), monster({ atk: 6 }), monster({ atk: 7 })],
      cpuPlayed: 1, // ya jogó 1, debe poder jugar más
    });

    const action = nextCpuAction(state);
    expect(['SUMMON_MONSTER', 'SELECT_TRAP_PLACE', 'SELECT_MAGIC']).toContain(action.type);
  });

  it('con 0 cartas jugadas propone jugar una carta', () => {
    const state = makeState(emptyField(), emptyField(), {
      cpuHand: [monster({ atk: 5 })],
      cpuPlayed: 0,
    });

    expect(nextCpuAction(state).type).toBe('SUMMON_MONSTER');
  });
});

describe('CPU — completando selecciones pendientes', () => {
  it('completa la colocación de una Trampa sobre un monstruo propio', () => {
    const trapCard = {
      id: 't1', type: 'trap' as const, suit: 'copas' as const, number: 1,
      name: 'Trampa', description: '',
      effect: { kind: 'heal_per_turn' as const, amount: 5 }, image: '',
    };
    const own = fieldMonster(monster({ atk: 5 }), { uid: 'own' });

    const state = makeState([own], emptyField(), {
      cpuHand: [trapCard],
      selection: { kind: 'place-trap', card: trapCard },
    });

    const action = nextCpuAction(state);
    expect(action.type).toBe('PLACE_TRAP_ON_MONSTER');
    if (action.type === 'PLACE_TRAP_ON_MONSTER') {
      expect(action.fieldUid).toBe('own');
    }
  });

  it('cancela la Trampa si ya no hay monstruos donde colocarla', () => {
    const trapCard = {
      id: 't1', type: 'trap' as const, suit: 'copas' as const, number: 1,
      name: 'Trampa', description: '',
      effect: { kind: 'heal_per_turn' as const, amount: 5 }, image: '',
    };

    const state = makeState(emptyField(), emptyField(), {
      cpuHand: [trapCard],
      selection: { kind: 'place-trap', card: trapCard },
    });

    expect(nextCpuAction(state).type).toBe('CANCEL_SELECTION');
  });

  it('completa la Mágica 8 sobre un monstruo RIVAL (Regla 20)', () => {
    const magic = {
      id: 'm8', type: 'magic' as const, suit: 'oros' as const, number: 8,
      name: '-2 DEF', description: '',
      effect: { kind: 'def_reduce' as const, amount: 2 },
      placement: 'field' as const,
    };
    const enemy = fieldMonster(monster({ atk: 6 }), { uid: 'enemy' });

    const state = makeState(emptyField(), [enemy], {
      cpuHand: [magic],
      selection: { kind: 'place-magic', card: magic },
    });

    const action = nextCpuAction(state);
    expect(action.type).toBe('PLACE_MAGIC_ON_MONSTER');
    if (action.type === 'PLACE_MAGIC_ON_MONSTER') {
      expect(action.side).toBe('enemy');
      expect(action.fieldUid).toBe('enemy');
    }
  });
});

describe('CPU — información oculta (punto 12)', () => {
  it('la elección no cambia por el valor real de una carta boca abajo', () => {
    const actionAgainstHidden = (realValue: number) => {
      const attacker = fieldMonster(monster({ atk: 8 }), { uid: 'atk' });
      const hidden = fieldMonster(monster({ atk: realValue, def: realValue }), {
        uid: 'hidden',
        position: 'defense',
        faceDown: true,
      });
      const visibleAttack = fieldMonster(monster({ atk: 12 }), { uid: 'human-atk' });
      return nextCpuAction(makeState([attacker], [visibleAttack, hidden], {
        difficulty: 'hard',
      }));
    };

    const weakCardAction = actionAgainstHidden(1);
    const strongCardAction = actionAgainstHidden(12);
    expect(weakCardAction.type).toBe('DECLARE_ATTACK');
    expect(strongCardAction.type).toBe('DECLARE_ATTACK');
    expect(weakCardAction).toEqual(strongCardAction);
  });
});

describe('CPU — terminación de turno y ausencia de bucles', () => {
  it('finaliza el turno cuando no tiene nada legal que hacer', () => {
    const state = makeState(emptyField(), emptyField(), { cpuHand: [] });
    expect(nextCpuAction(state)).toEqual({ type: 'END_TURN' });
  });

  it('nunca devuelve una acción indefinida (siempre una Action válida)', () => {
    const scenarios: GameState[] = [
      makeState(emptyField(), emptyField()),
      makeState(emptyField(), emptyField(), { cpuHand: [monster({ atk: 5 })] }),
      makeState([fieldMonster(monster({ atk: 5 }))], emptyField()),
      makeState([fieldMonster(monster({ atk: 5 }))], [fieldMonster(monster({ atk: 5 }))]),
    ];

    for (const state of scenarios) {
      const action: Action = nextCpuAction(state);
      expect(action).toBeDefined();
      expect(typeof action.type).toBe('string');
    }
  });

  it('con 3 cartas jugadas y sin ataque posible, termina el turno', () => {
    const state = makeState([fieldMonster(monster({ atk: 3 }), { uid: 'a' })], [], {
      cpuHand: [monster({ atk: 9 })],
      cpuPlayed: 3,
    });

    // No puede jugar más cartas; solo atacar o terminar.
    const action = nextCpuAction(state);
    expect(['DIRECT_ATTACK', 'DECLARE_ATTACK', 'END_TURN']).toContain(action.type);
  });
});

describe('CPU — dificultades', () => {
  it('easy sigue siendo legal: nunca ataca monstruos en Defensa sin ventaja', () => {
    const attacker = fieldMonster(monster({ atk: 3 }), { uid: 'a' });
    const humanDefense = fieldMonster(monster({ atk: 12, def: 12 }), {
      uid: 'd', position: 'defense', faceDown: true,
    });

    const action = nextCpuAction(makeState([attacker], [humanDefense], { difficulty: 'easy' }));
    expect(action.type).not.toBe('DECLARE_ATTACK');
  });

  it('hard usa cambios de posición legales', () => {
    const attacker = fieldMonster(monster({ atk: 8 }), { uid: 'a', hasAttacked: true });
    const action = nextCpuAction(makeState([attacker], emptyField(), { difficulty: 'hard' }));

    expect(action.type).toBe('CHANGE_POSITION');
  });

  it('no cambia la posición de un monstruo que ya la cambió este turno', () => {
    const fm = fieldMonster(monster({ atk: 8 }), {
      uid: 'a', hasAttacked: true, hasChangedPosition: true,
    });
    const action = nextCpuAction(makeState([fm], emptyField(), { difficulty: 'hard' }));

    expect(action.type).not.toBe('CHANGE_POSITION');
  });
});

describe('CPU — sin ventajas artificiales', () => {
  it('el CPU tiene los mismos LP y mano que el jugador', () => {
    const state = makeState(emptyField(), emptyField());
    expect(state.players[1].lp).toBe(100);
    expect(state.players[1].hand.length).toBe(0);
    expect(state.players[1].deck.length).toBe(20);
  });

  it('cpuDelay devuelve tiempos positivos y razonables', async () => {
    const { cpuDelay } = await import('../cpu');
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(cpuDelay(d)).toBeGreaterThan(0);
      expect(cpuDelay(d)).toBeLessThanOrEqual(1000);
    }
  });
});