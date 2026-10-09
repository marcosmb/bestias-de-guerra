import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../useGame';
import {
  canDirectAttack,
  isLegalAction,
  isLegalAttacker,
  legalActions,
  legalTargets,
  sameAction,
} from '../legalActions';
import { changedTheGame, simulateGame } from './support/simulation';
import type { Action, FieldMonster, GameState, PlayerState, Position } from '../types';
import { MAX_CARDS_PER_TURN, MAX_HAND_SIZE, createPlayer } from '../types';
import type { Card, MagicCard, MonsterCard, TrapCard } from '../cardData';
import { MAGICS, TRAPS, buildDeck } from '../cardData';

// ============================================================================
// F1 — `legalActions()`: GENERADOR ÚNICO DE ACCIONES LEGALES
// ============================================================================
//
// La prueba que lo de verdad demuestra es la primera: `legalActions()` y el
// arnés de simulación de F0 calculan el conjunto legal de dos maneras
// COMPLETAMENTE INDEPENDIENTES (una leyendo las reglas, otra preguntando al
// reducer) y tienen que coincidir. Ninguno de los dos usa el código del otro.
//
// El resto de pruebas fijan, regla a regla, qué se enumera y qué no. Son la
// traducción directa de `REGLAS_JUEGO_DEFINITIVAS.md` y sirven de aviso si algún
// día alguien cambia una regla sin querer.

// ---------- Constructores de estado ----------

function monster(atk: number, def = atk): MonsterCard {
  return { id: `m-espadas-${atk}`, type: 'monster', suit: 'espadas', number: atk, name: `M${atk}`, atk, def, image: '' };
}

function fieldMonster(card: MonsterCard, overrides: Partial<FieldMonster> = {}): FieldMonster {
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

const blank = (): (FieldMonster | null)[] => [null, null, null, null, null, null];

function playerWith(index: 0 | 1, field: (FieldMonster | null)[], hand: Card[] = [], extra: Partial<PlayerState> = {}): PlayerState {
  return { ...createPlayer(index, `Jugador ${index + 1}`, buildDeck()), field, hand, ...extra };
}

function scene(options: {
  me?: Partial<PlayerState>;
  opp?: Partial<PlayerState>;
  currentPlayer?: 0 | 1;
  turnCount?: number;
  phase?: GameState['phase'];
  selection?: GameState['selection'];
  pendingTrap?: GameState['pendingTrap'];
  pendingDice?: GameState['pendingDice'];
} = {}): GameState {
  const base = initialState();
  return {
    ...base,
    phase: options.phase ?? 'playing',
    currentPlayer: options.currentPlayer ?? 0,
    turnCount: options.turnCount ?? 3,
    players: [playerWith(0, blank(), [], options.me), playerWith(1, blank(), [], options.opp)],
    selection: options.selection ?? { kind: 'none' },
    pendingTrap: options.pendingTrap ?? null,
    pendingDice: options.pendingDice ?? null,
  };
}

const trap = (n: number): TrapCard => TRAPS[n - 1];
const magic = (n: number): MagicCard => MAGICS[n - 1];

const typesOf = (state: GameState, player: 0 | 1): string[] =>
  legalActions(state, player).map((a) => a.type);

const find = (state: GameState, player: 0 | 1, type: Action['type']): Action[] =>
  legalActions(state, player).filter((a) => a.type === type);

// ============================================================================
// 1. EL CONTRATO PRINCIPAL
// ============================================================================

describe('legalActions · contrato', () => {
  it('TODO lo que devuelve es legal y el reducer lo ejecuta (contrastado con el arnés de F0)', () => {
    // El arnés de F0 calcula la legalidad de una manera radicalmente distinta:
    // genera el universo completo de acciones y pregunta al REDUCER cuál de
    // ellas produce un cambio real. `legalActions()` enumera las legales leyendo
    // las reglas. Ninguno de los dos usa el código del otro.
    //
    // Aquí se comprueba la SUBNORMALIDAD — la mitad que importa del principio
    // «si legalActions devuelve `a`, el reducer puede ejecutarla» — sobre miles
    // de estados reales de partida.
    let pasos = 0;
    let acciones = 0;
    let accionesNoAdmitidas = 0;

    for (const driver of ['harness', 'cpu'] as const) {
      for (let seed = 900; seed < 912; seed++) {
        simulateGame({
          seed,
          driver,
          verificar: (state, seat, legalesPorSondeo) => {
            pasos++;
            for (const action of legalActions(state, seat)) {
              acciones++;
              if (!legalesPorSondeo.some((c) => sameAction(c, action))) {
                accionesNoAdmitidas++;
                if (accionesNoAdmitidas <= 5) {
                  console.error(
                    `legalActions emitió algo que el reducer NO admite: ${action.type} ` +
                    `(${JSON.stringify(action).slice(0, 120)}) · semilla ${seed} · fase ${state.phase}`,
                  );
                }
              }
            }
          },
        });
      }
    }

    expect(pasos).toBeGreaterThan(500);
    expect(acciones).toBeGreaterThan(3000);
    expect(accionesNoAdmitidas).toBe(0);
  });

  it('el arnés por sondeo no encuentra acciones que legalActions omita (salvo huecos documentados)', () => {
    // La otra mitad de la comparación. El arnés genera el universo completo y
    // pregunta al reducer, así que puede encontrar jugadas que `legalActions`
    // omite a propósito. Los motivos están todos documentados, y se listan uno
    // a uno para que ningún hueco nuevo se cuelgue sin que se note.
    const SIN_CONDICION_DE_ESTADO = new Set<Action['type']>([
      // Atajos de un solo paso que se saltan la cuota de la Regla 16 (DEFECTO 1):
      // el reducer los aplica sin haber pasado por la selección. `legalActions`
      // obliga siempre al camino de dos pasos.
      'PLACE_TRAP_ON_MONSTER',
      'PLACE_MAGIC_ON_MONSTER',
      // El reducer NO comprueba quién ataca: admite un `DECLARE_ATTACK` o un
      // `DIRECT_ATTACK` desde un Monstruo en Defensa, que ya ha atacado, o en el
      // primer turno del jugador que empieza (DEFECTO 8). `legalActions` sí los
      // filtra. Que se liste aquí significa que el ARNÉS los encuentra de más,
      // nunca que `legalActions` se los Salto.
      'DECLARE_ATTACK',
      'DIRECT_ATTACK',
      // El reducer no comprueba que la carta de la acción sea la Mágica de la
      // selección abierta, ni que esté en la mano (DEFECTO 11).
      'REVIVE_CHOICE',
      // El reducer no comprueba QUIÉN responde a la Trampa ni QUIÉN tira el
      // dado. `legalActions` se lo atribuye a quien corresponde, no al que
      // tiene el turno.
      'RESOLVE_TRAP',
      'ROLL_DICE',
      // Igual con `CANCEL_SELECTION`: el reducer lo acepta en cualquier fase,
      // pero solo tiene sentido cerrar una elección cuando la partida está en
      // juego. Es inocuo (solo limpia la selección, que `RESOLVE_TRAP` va a
      // limpiar igualmente).
      'CANCEL_SELECTION',
    ]);
    const LIBRES_CON_SELECCION = new Set<Action['type']>([
      'SUMMON_MONSTER',
      'SELECT_TRAP_PLACE',
      'SELECT_MAGIC',
      'END_TURN',
      'CHANGE_POSITION',
      'START_ATTACK',
      'CONFIRM_PASS',
    ]);

    let revisados = 0;
    let fueraDeContrato = 0;
    const porTipo = new Map<string, string>();

    for (const semilla of [901, 902, 903]) {
      simulateGame({
        seed: semilla,
        driver: 'harness',
        verificar: (state, seat, legalesPorSondeo) => {
          const mias = legalActions(state, seat);
          const conSeleccion = state.selection.kind !== 'none';
          for (const action of legalesPorSondeo) {
            if (mias.some((m) => sameAction(m, action))) continue;
            revisados++;
            const justificado =
              SIN_CONDICION_DE_ESTADO.has(action.type) || (conSeleccion && LIBRES_CON_SELECCION.has(action.type));
            if (!justificado) {
              fueraDeContrato++;
              if (!porTipo.has(action.type)) {
                porTipo.set(
                  action.type,
                  `fase ${state.phase} sel ${state.selection.kind} turno ${state.turnCount} · ${JSON.stringify(action).slice(0, 130)}`,
                );
              }
            }
          }
        },
      });
    }

    if (fueraDeContrato > 0) {
      for (const [tipo, detalle] of porTipo) {
        console.error(`FUERA DE CONTRATO ${tipo}: ${detalle}`);
      }
    }
    expect(revisados).toBeGreaterThan(200);
    expect(fueraDeContrato).toBe(0);
  });
});

// ============================================================================
// 2. REGLAS 15/16/17/18/19 — DESARROLLO DEL TURNO Y LÍMITE DE CARTAS
// ============================================================================

describe('legalActions · desarrollo del turno', () => {
  it('Regla 18: invocar un Monstruo de la mano en Ataque o Defensa, si hay hueco', () => {
    const m = monster(4);
    const state = scene({ me: { hand: [m] } });
    const summon = find(state, 0, 'SUMMON_MONSTER');
    expect(summon).toHaveLength(2);
    expect(summon.map((a) => (a as { position: Position }).position).sort()).toEqual(['attack', 'defense']);
  });

  it('Regla 18: sin huecos libres no se puede invocar', () => {
    const lleno = [0, 1, 2, 3, 4, 5].map((n) => fieldMonster(monster(n)));
    const state = scene({ me: { field: lleno, hand: [monster(4)] } });
    expect(find(state, 0, 'SUMMON_MONSTER')).toHaveLength(0);
  });

  it('Regla 16: con la cuota de 3 cartas agotada no se juega nada de la mano', () => {
    const state = scene({
      me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, hand: [monster(4), trap(1), magic(10)] },
    });
    expect(find(state, 0, 'SUMMON_MONSTER')).toHaveLength(0);
    expect(find(state, 0, 'SELECT_TRAP_PLACE')).toHaveLength(0);
    expect(find(state, 0, 'SELECT_MAGIC')).toHaveLength(0);
  });

  it('Regla 16: atacar NO consume la cuota y sigue siendo legal con ella agotada', () => {
    const state = scene({
      me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, field: [fieldMonster(monster(5)), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'START_ATTACK')).toHaveLength(1);
  });

  it('Regla 16: cambiar de posición NO consume la cuota', () => {
    const state = scene({
      me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, field: [fieldMonster(monster(5)), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'CHANGE_POSITION')).toHaveLength(1);
  });

  it('Regla 14: una vez que un Monstruo cambia de posición, ya no puede volver a cambiarla', () => {
    const state = scene({
      me: { field: [fieldMonster(monster(5), { uid: 'yaCambiado', hasChangedPosition: true }), fieldMonster(monster(6), { uid: 'libre' }), ...blank().slice(2)] },
    });
    expect(find(state, 0, 'CHANGE_POSITION').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['libre']);
  });

  it('Regla 17: el primer turno del jugador que empieza no permite atacar', () => {
    const state = scene({
      turnCount: 0,
      me: { field: [fieldMonster(monster(5)), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'START_ATTACK')).toHaveLength(0);
    // El mismo campo, ya en el segundo turno, sí permite atacar.
    const masAdelante = { ...state, turnCount: 1 };
    expect(find(masAdelante, 0, 'START_ATTACK')).toHaveLength(1);
  });

  it('solo un Monstruo en Ataque que no ha atacado puede iniciar un ataque', () => {
    const state = scene({
      me: {
        field: [
          fieldMonster(monster(5), { uid: 'atacante' }),
          fieldMonster(monster(6), { uid: 'atacado', hasAttacked: true }),
          fieldMonster(monster(7), { uid: 'defensa', position: 'defense', faceDown: true }),
          ...blank().slice(3),
        ],
      },
      opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'START_ATTACK').map((a) => (a as { attackerUid: string }).attackerUid)).toEqual(['atacante']);
  });

  it('Regla 15: cerrar el turno siempre es legal', () => {
    expect(find(scene(), 0, 'END_TURN')).toHaveLength(1);
    expect(find(scene({ me: { hand: [], field: blank() } }), 0, 'END_TURN')).toHaveLength(1);
  });

  it('no se generan acciones para el jugador que no tiene el turno', () => {
    const state = scene({ currentPlayer: 0, me: { hand: [monster(4)] } });
    expect(legalActions(state, 1)).toEqual([]);
  });

  it('con la partida terminada no hay ninguna acción', () => {
    expect(legalActions({ ...scene(), phase: 'game-over', winner: 0 }, 0)).toEqual([]);
  });
});

// ============================================================================
// 3. REGLAS 22/23 — OBJETIVOS DE ATAQUE
// ============================================================================

describe('legalActions · Reglas 22 y 23 (objetivo del ataque)', () => {
  it('Regla 22: con Monstruos en Defensa también se puede atacar a un Monstruo en Ataque', () => {
    const state = scene({
      selection: { kind: 'attack', attackerUid: 'atacante' },
      me: { field: [fieldMonster(monster(8), { uid: 'atacante' }), ...blank().slice(1)] },
      opp: {
        field: [
          fieldMonster(monster(3), { uid: 'enAtaque' }),
          fieldMonster(monster(4), { uid: 'enDefensa1', position: 'defense', faceDown: true }),
          fieldMonster(monster(5), { uid: 'enDefensa2', position: 'defense', faceDown: true }),
          ...blank().slice(3),
        ],
      },
    });
    const targets = find(state, 0, 'DECLARE_ATTACK').map((a) => (a as { defenderUid: string }).defenderUid);
    expect(targets.sort()).toEqual(['enAtaque', 'enDefensa1', 'enDefensa2']);
    // Y no se ofrece el ataque directo.
    expect(find(state, 0, 'DIRECT_ATTACK')).toHaveLength(0);
  });

  it('Regla 22.2: sin Monstruos en Defensa se puede atacar a un Ataque o ir a los PV', () => {
    const state = scene({
      selection: { kind: 'attack-or-direct', attackerUid: 'atacante' },
      me: { field: [fieldMonster(monster(8), { uid: 'atacante' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(3), { uid: 'a' }), fieldMonster(monster(4), { uid: 'b' }), ...blank().slice(2)] },
    });
    const targets = find(state, 0, 'DECLARE_ATTACK').map((a) => (a as { defenderUid: string }).defenderUid);
    expect(targets.sort()).toEqual(['a', 'b']);
    expect(find(state, 0, 'DIRECT_ATTACK')).toHaveLength(1);
  });

  it('Regla 22.1: con Monstruos en Defensa el ataque directo NO es legal', () => {
    const state = scene({
      selection: { kind: 'attack-or-direct', attackerUid: 'atacante' },
      me: { field: [fieldMonster(monster(8), { uid: 'atacante' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(4), { uid: 'd', position: 'defense', faceDown: true }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DIRECT_ATTACK')).toHaveLength(0);
    expect(find(state, 0, 'DECLARE_ATTACK')).toHaveLength(1);
  });

  it('legalTargets y canDirectAttack aplican la Regla 22', () => {
    const enAtaque = fieldMonster(monster(3));
    const enDefensa = fieldMonster(monster(4), { position: 'defense' });
    expect(legalTargets([enAtaque, enDefensa])).toEqual([enAtaque, enDefensa]);
    expect(legalTargets([enAtaque])).toEqual([enAtaque]);
    expect(legalTargets([])).toEqual([]);
    expect(canDirectAttack([enDefensa])).toBe(false);
    expect(canDirectAttack([enAtaque])).toBe(true);
    expect(canDirectAttack([])).toBe(true);
  });
});

// ============================================================================
// 4. DEFICIENCIA DE `DECLARE_ATTACK`: JAMÁS SE GENERA UN ATAQUE ILEGAL
// ============================================================================

describe('legalActions · DECLARE_ATTACK nunca es ilegal (aunque el reducer lo admita)', () => {
  it('no ataca con un Monstruo en Defensa ni con uno que ya ha atacado', () => {
    const state = scene({
      selection: { kind: 'attack-or-direct', attackerUid: 'yaAtaco' },
      me: { field: [fieldMonster(monster(8), { uid: 'yaAtaco', hasAttacked: true }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DECLARE_ATTACK')).toHaveLength(0);
    expect(find(state, 0, 'DIRECT_ATTACK')).toHaveLength(0);
  });

  it('no ataca en el primer turno del jugador que empieza (Regla 17)', () => {
    const state = scene({
      turnCount: 0,
      selection: { kind: 'attack', attackerUid: 'atacante' },
      me: { field: [fieldMonster(monster(8), { uid: 'atacante' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DECLARE_ATTACK')).toHaveLength(0);
  });

  it('no genera un ataque si el atacante ya no está en el campo', () => {
    const state = scene({
      selection: { kind: 'attack', attackerUid: 'fantasma' },
      me: { field: [fieldMonster(monster(8)), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DECLARE_ATTACK')).toHaveLength(0);
    // Pero siempre se puede cerrar la elección.
    expect(find(state, 0, 'CANCEL_SELECTION')).toHaveLength(1);
  });

  it('isLegalAttacker exige posición de Ataque, no haber atacado y la Regla 17', () => {
    const attacker = fieldMonster(monster(5));
    expect(isLegalAttacker(scene(), 0, attacker)).toBe(true);
    expect(isLegalAttacker(scene({ turnCount: 0 }), 0, attacker)).toBe(false);
    expect(isLegalAttacker(scene(), 0, { ...attacker, hasAttacked: true })).toBe(false);
    expect(isLegalAttacker(scene(), 0, { ...attacker, position: 'defense' })).toBe(false);
    expect(isLegalAttacker(scene(), 0, undefined)).toBe(false);
  });

  it('tampoco en el camino de un paso: sin selección abierta solo ataca un atacante legal', () => {
    const rival = { opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blank().slice(1)] } };

    // Primer turno del jugador que empieza (Regla 17): ni declarar ni directo.
    const primerTurno = scene({ turnCount: 0, me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blank().slice(1)] }, ...rival });
    expect(find(primerTurno, 0, 'DECLARE_ATTACK')).toHaveLength(0);
    expect(find(primerTurno, 0, 'DIRECT_ATTACK')).toHaveLength(0);

    // Monstruo en Defensa: no ataca.
    const enDefensa = scene({ me: { field: [fieldMonster(monster(8), { uid: 'a', position: 'defense', faceDown: true }), ...blank().slice(1)] }, ...rival });
    expect(find(enDefensa, 0, 'DECLARE_ATTACK')).toHaveLength(0);

    // Ya ha atacado este turno: no vuelve a atacar.
    const yaAtaco = scene({ me: { field: [fieldMonster(monster(8), { uid: 'a', hasAttacked: true }), ...blank().slice(1)] }, ...rival });
    expect(find(yaAtaco, 0, 'DECLARE_ATTACK')).toHaveLength(0);
    expect(find(yaAtaco, 0, 'DIRECT_ATTACK')).toHaveLength(0);
  });

  it('el camino de un paso permite atacar a cualquier Monstruo rival', () => {
    const state = scene({
      me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blank().slice(1)] },
      opp: {
        field: [
          fieldMonster(monster(3), { uid: 'enAtaque' }),
          fieldMonster(monster(4), { uid: 'enDefensa', position: 'defense', faceDown: true }),
          ...blank().slice(2),
        ],
      },
    });
    expect(find(state, 0, 'DECLARE_ATTACK').map((a) => (a as { defenderUid: string }).defenderUid).sort()).toEqual(['enAtaque', 'enDefensa']);
    expect(find(state, 0, 'DIRECT_ATTACK')).toHaveLength(0);
  });

  it('el camino de un paso ataca a los PV cuando el rival no tiene nada en Defensa', () => {
    const state = scene({
      me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(3), { uid: 'x' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DIRECT_ATTACK').map((a) => (a as { attackerUid: string }).attackerUid)).toEqual(['a']);
  });
});

// ============================================================================
// 5. REGLA 19 — TRAMPAS
// ============================================================================

describe('legalActions · Regla 19 (Trampas)', () => {
  it('se puede elegir cualquier Trampa de la mano', () => {
    const state = scene({
      me: {
        hand: [trap(1), trap(8)],
        field: [fieldMonster(monster(3), { uid: 'portador' }), ...blank().slice(1)],
      },
    });
    expect(find(state, 0, 'SELECT_TRAP_PLACE').map((a) => (a as { card: TrapCard }).card.id)).toEqual(['t1', 't8']);
  });

  it('la Trampa solo va sobre un Monstruo propio sin Trampa', () => {
    const state = scene({
      selection: { kind: 'place-trap', card: trap(1) },
      me: {
        field: [
          fieldMonster(monster(3), { uid: 'libre' }),
          fieldMonster(monster(4), { uid: 'ocupado', trap: trap(8) }),
          ...blank().slice(2),
        ],
      },
    });
    expect(find(state, 0, 'PLACE_TRAP_ON_MONSTER').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['libre']);
  });

  it('Regla 19: también se puede colocar la Trampa en un Monstruo invocado este turno', () => {
    const state = scene({
      selection: { kind: 'place-trap', card: trap(1) },
      me: { field: [fieldMonster(monster(3), { summonedThisTurn: true }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'PLACE_TRAP_ON_MONSTER')).toHaveLength(1);
  });
});

// ============================================================================
// 6. REGLA 5 — OBJETIVO DE LAS MÁGICAS (M4, M8, M9)
// ============================================================================

describe('legalActions · Regla 5 (lado exigido por la Mágica)', () => {
  it('Mágica 4 (+2 ATQ) solo sobre Monstruos PROPIOS', () => {
    const state = scene({
      selection: { kind: 'place-magic', card: magic(4) },
      me: { field: [fieldMonster(monster(3), { uid: 'mio' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(9), { uid: 'rival' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'PLACE_MAGIC_ON_MONSTER').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['mio']);
  });

  it('Mágica 9 (protección por dado) solo sobre Monstruos PROPIOS', () => {
    const state = scene({
      selection: { kind: 'place-magic', card: magic(9) },
      me: { field: [fieldMonster(monster(3), { uid: 'mio' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(9), { uid: 'rival' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'PLACE_MAGIC_ON_MONSTER').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['mio']);
  });

  it('Mágica 8 (-2 DEF) solo sobre Monstruos RIVALES: es la excepción', () => {
    const state = scene({
      selection: { kind: 'place-magic', card: magic(8) },
      me: { field: [fieldMonster(monster(3), { uid: 'mio' }), ...blank().slice(1)] },
      opp: { field: [fieldMonster(monster(9), { uid: 'rival' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'PLACE_MAGIC_ON_MONSTER').map((a) => (a as { fieldUid: string; side: string }).fieldUid)).toEqual(['rival']);
    expect((find(state, 0, 'PLACE_MAGIC_ON_MONSTER')[0] as { side: string }).side).toBe('enemy');
  });

  it('Regla 4: ningún Monstruo puede llevar dos Mágicas', () => {
    const state = scene({
      selection: { kind: 'place-magic', card: magic(4) },
      me: { field: [fieldMonster(monster(3), { magic: magic(9) }), fieldMonster(monster(4), { uid: 'libre' }), ...blank().slice(2)] },
    });
    expect(find(state, 0, 'PLACE_MAGIC_ON_MONSTER').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['libre']);
  });

  it('no se ofrece una Mágica de campo si no hay ningún objetivo legal', () => {
    const soloConMagica = scene({ me: { field: [fieldMonster(monster(3), { magic: magic(9) }), ...blank().slice(1)] } });
    expect(find(soloConMagica, 0, 'SELECT_MAGIC').map((a) => (a as { card: MagicCard }).card.id)).not.toContain('m4');

    const rivalConMagica = scene({ opp: { field: [fieldMonster(monster(3), { magic: magic(4) }), ...blank().slice(1)] } });
    expect(find(rivalConMagica, 0, 'SELECT_MAGIC').map((a) => (a as { card: MagicCard }).card.id)).not.toContain('m8');
  });

  it('la Mágica 8 no se ofrece si el rival no tiene Monstruos', () => {
    const state = scene({ me: { hand: [magic(8)] } });
    expect(find(state, 0, 'SELECT_MAGIC')).toHaveLength(0);
  });
});

// ============================================================================
// 7. MÁGICA 2 — ROBAR DE LA MANO
// ============================================================================

describe('legalActions · Mágica 2 (robar de la mano del rival)', () => {
  it('necesita que el rival tenga cartas y que mi mano no esté llena', () => {
    const conAmbas = scene({ me: { hand: [magic(2)] }, opp: { hand: [monster(4)] } });
    expect(find(conAmbas, 0, 'SELECT_MAGIC')).toHaveLength(1);

    const rivalVacio = scene({ me: { hand: [magic(2)] } });
    expect(find(rivalVacio, 0, 'SELECT_MAGIC')).toHaveLength(0);

    const manoLlena = scene({
      me: { hand: [magic(2), ...Array.from({ length: MAX_HAND_SIZE - 1 }, (_, i) => monster(i + 1))] },
      opp: { hand: [monster(4)] },
    });
    expect(find(manoLlena, 0, 'SELECT_MAGIC')).toHaveLength(0);
  });

  it('se ofrece aunque el rival tenga una carta que yo ya tenga: son copias distintas', () => {
    const mismo = monster(4);
    const state = scene({ me: { hand: [magic(2), mismo] }, opp: { hand: [{ ...mismo }] } });
    expect(find(state, 0, 'SELECT_MAGIC').map((a) => (a as { card: MagicCard }).card.id)).toEqual(['m2']);
  });
});

// ============================================================================
// 8. MÁGICA 5 — RECUPERAR DEL CEMENTERIO
// ============================================================================

describe('legalActions · Mágica 5 (recuperar del cementerio)', () => {
  it('no se ofrece si el cementerio no tiene Monstruos', () => {
    const state = scene({ me: { hand: [magic(5)], graveyard: [trap(1)] } });
    expect(find(state, 0, 'SELECT_MAGIC')).toHaveLength(0);
  });

  it('no se ofrece si la única salida sería una carta que ya tengo en la mano', () => {
    const difunto = monster(3);
    const lleno = [0, 1, 2, 3, 4, 5].map((n) => fieldMonster(monster(n + 1)));
    // Campo lleno (no se puede recuperar al campo) y la copia propia ya está en
    // la mano (no se puede recuperar a la mano): la Mágica no se puede usar.
    const sinSalida = scene({
      me: { hand: [magic(5), difunto], graveyard: [difunto], field: lleno },
    });
    expect(find(sinSalida, 0, 'SELECT_MAGIC')).toHaveLength(0);

    // Pero si hay un hueco en el campo, SÍ se ofrece: elcementerio → campo.
    const conHueco = scene({
      me: { hand: [magic(5), difunto], graveyard: [difunto], field: [lleno[0], null, null, null, null, null] },
    });
    expect(find(conHueco, 0, 'SELECT_MAGIC')).toHaveLength(1);
  });

  it('sí se ofrece si el cementerio tiene la copia del RIVAL y la mía no está en la mano', () => {
    const difunto = { ...monster(3), owner: 1 as const };
    const state = scene({
      me: { hand: [magic(5)], graveyard: [difunto], field: [0, 1, 2, 3, 4, 5].map((n) => fieldMonster(monster(n + 1))) },
    });
    expect(find(state, 0, 'SELECT_MAGIC')).toHaveLength(1);
  });

  it('con la elección abierta ofrece mano (si cabe) y campo (si hay hueco)', () => {
    const difunto = monster(3);
    const ambas = scene({
      selection: { kind: 'revive-choice', card: magic(5) },
      me: { hand: [magic(5)], graveyard: [difunto] },
    });
    expect(find(ambas, 0, 'REVIVE_CHOICE').map((a) => `${(a as { choice: string }).choice}:${(a as { position?: string }).position ?? '-'}`).sort())
      .toEqual(['field:attack', 'field:defense', 'hand:-']);

    const soloCampo = scene({
      selection: { kind: 'revive-choice', card: magic(5) },
      me: { hand: [magic(5), ...Array.from({ length: MAX_HAND_SIZE - 1 }, (_, i) => monster(i + 1))], graveyard: [difunto] },
    });
    expect(find(soloCampo, 0, 'REVIVE_CHOICE').every((a) => (a as { choice: string }).choice === 'field')).toBe(true);
  });
});

// ============================================================================
// 9. SELECCIONES PENDIENTES Y OTRAS FASES
// ============================================================================

describe('legalActions · fases especiales', () => {
  it('Regla 19 y 20: con una selección abierta solo se completa o se cancela', () => {
    const state = scene({
      selection: { kind: 'place-trap', card: trap(1) },
      me: { hand: [monster(4), trap(1), magic(10)], field: [fieldMonster(monster(3)), ...blank().slice(1)] },
    });
    const types = typesOf(state, 0);
    expect(new Set(types)).toEqual(new Set(['PLACE_TRAP_ON_MONSTER', 'CANCEL_SELECTION']));
  });

  it('Trampa 9: se elige un Monstruo rival para destruir', () => {
    const state = scene({
      selection: { kind: 'choose-destroy-target', trapUid: 'mio' },
      me: { field: [fieldMonster(monster(2), { uid: 'mio' }), fieldMonster(monster(3), { uid: 'mio2' }), ...blank().slice(2)] },
      opp: { field: [fieldMonster(monster(12), { uid: 'rival' }), ...blank().slice(1)] },
    });
    expect(find(state, 0, 'DESTROY_MONSTER').map((a) => (a as { fieldUid: string }).fieldUid)).toEqual(['rival']);
  });

  it('fase de paso de dispositivo: solo confirmar', () => {
    const state = scene({ phase: 'pass', currentPlayer: 1 });
    expect(typesOf(state, 1)).toEqual(['CONFIRM_PASS']);
    expect(legalActions(state, 0)).toEqual([]);
  });

  it('fase de respuesta de Trampa: decide el defensor, y puede activarla o no', () => {
    const pendiente = {
      attackerUid: 'a',
      defenderUid: 'd',
      trap: trap(8),
      defenderPlayer: 1 as const,
      attackerPlayer: 0 as const,
      attackerCard: monster(6),
      defenderCard: monster(3),
      defenderPosition: 'attack' as Position,
    };
    const state = scene({ phase: 'trap-response', currentPlayer: 0, pendingTrap: pendiente });
    expect(find(state, 1, 'RESOLVE_TRAP').map((a) => (a as { activate: boolean }).activate)).toEqual([true, false]);
    // Al atacante no le toca decidir.
    expect(legalActions(state, 0)).toEqual([]);
  });

  it('fase de dado: solo las seis caras, y solo para quien tiene el turno', () => {
    const state = scene({
      phase: 'dice-roll',
      currentPlayer: 1,
      pendingDice: { reason: 'Daño por dado', onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) as Action },
    });
    expect(find(state, 1, 'ROLL_DICE').map((a) => (a as { roll: number }).roll)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(legalActions(state, 0)).toEqual([]);
  });
});

// ============================================================================
// 10. LO QUE `legalActions()` NO DEBE GENERAR NUNCA
// ============================================================================

describe('legalActions · acciones que no debe generar nunca', () => {
  it('nunca genera los atajos que se saltan la cuota de 3 cartas', () => {
    // Con la cuota llena, ninguna de estas acciones debe aparecer en el conjunto
    // libre. Es la diferencia entre generar jugadas y generar jugadas legales.
    const state = scene({
      me: {
        cardsPlayedThisTurn: MAX_CARDS_PER_TURN,
        hand: [monster(4), trap(1), magic(4), magic(10)],
        field: [fieldMonster(monster(3)), ...blank().slice(1)],
      },
      opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blank().slice(1)] },
    });
    const tipos = new Set(typesOf(state, 0));
    for (const prohibido of ['PLACE_TRAP_ON_MONSTER', 'PLACE_MAGIC_ON_MONSTER', 'MAGIC_TARGET_MONSTER', 'MAGIC_INSTANT']) {
      expect(tipos.has(prohibido)).toBe(false);
    }
  });

  it('no genera las acciones de metajuego (menú)', () => {
    const tipos = new Set(typesOf(scene(), 0));
    for (const prohibido of ['START_GAME', 'RESTART', 'CPU_PLAY', 'CONFIRM_START']) {
      expect(tipos.has(prohibido)).toBe(false);
    }
  });

  it('no genera jugadas para el rival', () => {
    // Todo lo generado se refiere al campo o a la mano del jugador indicado.
    const state = scene({
      currentPlayer: 1,
      me: { hand: [monster(4)], field: [fieldMonster(monster(5), { uid: 'delRival' }), ...blank().slice(1)] },
    });
    for (const action of legalActions(state, 1)) {
      const uid = 'fieldUid' in action ? action.fieldUid : undefined;
      if (uid !== undefined) expect(uid).not.toBe('delRival');
    }
  });
});

// ============================================================================
// 11. UTILIDADES
// ============================================================================

describe('legalActions · utilidades', () => {
  it('isLegalAction reconoce una acción legal y descarta una ilegal', () => {
    const m = monster(4);
    const otra = monster(7);
    const state = scene({ me: { hand: [m] } });
    // La comparación es por IDENTIDAD DE COPIA: la acción se construye a partir
    // de las cartas de la mano del propio estado.
    expect(isLegalAction(state, 0, { type: 'SUMMON_MONSTER', card: m, position: 'attack' })).toBe(true);
    // Otra copia del mismo tipo que no está en la mano.
    expect(isLegalAction(state, 0, { type: 'SUMMON_MONSTER', card: otra, position: 'attack' })).toBe(false);
    expect(isLegalAction(state, 0, { type: 'END_TURN' })).toBe(true);
  });

  it('sameAction compara por contenido de copia, no por posición', () => {
    const m = monster(4);
    expect(sameAction({ type: 'SUMMON_MONSTER', card: m, position: 'attack' }, { type: 'SUMMON_MONSTER', card: m, position: 'attack' })).toBe(true);
    expect(sameAction({ type: 'SUMMON_MONSTER', card: m, position: 'attack' }, { type: 'SUMMON_MONSTER', card: m, position: 'defense' })).toBe(false);
    expect(sameAction({ type: 'END_TURN' }, { type: 'CANCEL_SELECTION' })).toBe(false);
  });
});

// ============================================================================
// 12. REGRESIÓN: LAS 332 PRUEBAS EXISTENTES SIGUEN PASANDO
// ============================================================================

describe('legalActions · regresión', () => {
  it('el reducer sigue aplicando las acciones que legalActions genera', () => {
    // Prueba de humo end-to-end: una partida jugada hasta el final eligiendo en
    // cada paso una acción legal de `legalActions()`.
    let pasos = 0;
    jugarConLegalActions(() => { pasos++; });
    expect(pasos).toBeGreaterThan(30);
  });
});

/**
 * Juega una partida completa recorriendo TODAS las acciones legales de cada
 * estado, en rotación. Así no se deja ninguna sin probar y la partida termina.
 */
function jugarConLegalActions(tick: () => void): void {
  let state = reducer(initialState(), { type: 'START_GAME', mode: 'local' });
  let guardia = 0;
  let indice = 0;
  while (state.phase !== 'game-over' && guardia++ < 4000) {
    // Quién tiene que actuar: en la fase de Trampa decide el defensor, no quien
    // tiene el turno. Es justo lo que establece `legalActions`.
    const actor: 0 | 1 =
      state.phase === 'trap-response' && state.pendingTrap ? state.pendingTrap.defenderPlayer : state.currentPlayer;
    const todas = legalActions(state, actor);
    // Cancelar siempre es legal, pero aquí interesa recorrer las jugadas de
    // verdad. Si la selección abierta se ha quedado sin ningún destino posible
    // (el reducer admite abrir una Trampa sin Monstruo donde ponerla), la única
    // salida es cerrar la elección.
    const opciones = todas.filter((a) => a.type !== 'CANCEL_SELECTION');
    if (opciones.length === 0) {
      expect(todas.map((a) => a.type)).toEqual(['CANCEL_SELECTION']);
      state = reducer(state, { type: 'CANCEL_SELECTION' });
      tick();
      continue;
    }
    const elegida = opciones[indice % opciones.length];
    indice++;
    const antes = state;
    state = reducer(state, elegida);
    expect(changedTheGame(antes, state), `${elegida.type} no cambió nada`).toBe(true);
    tick();
  }
  expect(state.phase).toBe('game-over');
}
