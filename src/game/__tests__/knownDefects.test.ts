import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../useGame';
import { nextCpuAction } from '../cpu';
import { legalActions } from '../legalActions';
import { changedTheGame } from './support/simulation';
import type { Action, FieldMonster, GameState, PlayerState, Position } from '../types';
import { MAX_CARDS_PER_TURN, createPlayer, indexOfCardInstance } from '../types';
import type { Card, MagicCard, MonsterCard, TrapCard } from '../cardData';
import { MAGICS, TRAPS, buildDeck } from '../cardData';

// ============================================================================
// F0 â€” DEFECTOS PREEXISTENTES QUE LA RED DE SEGURIDAD HA DETECTADO
// ============================================================================
//
// Ninguno de estos test Â«fallaÂ»: PASSAN. Lo que hacen es FIJAR el comportamiento
// actual de cada defecto, de forma aislada y legible, para que:
//   Â· quede documentado sin depender de leer el informe del torneo;
//   Â· no se pueda arreglar ni olvidar en silencio: en cuanto cambie el
//     comportamiento, la prueba falla y hay que actualizar la nota al pie;
//   Â· cada arreglo futuro pueda comprobar que el defecto era Ã‰SE y no otro.
//
// Ninguno se corrige en F0 ni en F1. Se delegan a fases posteriores y se anotan
// aquÃ­ con la fase a la que corresponde.
//
// REGLA: al corregir un defecto, se BORRA su test y se anota el cambio. Si el
// arreglo fuera otra cosa, este test fallarÃ­a y lo delatarÃ­a.

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

function playerWith(index: 0 | 1, field: (FieldMonster | null)[], hand: Card[] = [], extra: Partial<PlayerState> = {}): PlayerState {
  return {
    ...createPlayer(index, `Jugador ${index + 1}`, buildDeck()),
    field,
    hand,
    ...extra,
  };
}

function blankField(): (FieldMonster | null)[] {
  return [null, null, null, null, null, null];
}

/**
 * Estado base: turno del Jugador 0 en fase 'playing', con la cuota reiniciada.
 * Construido a mano para que cada test sea determinista y legible.
 */
function scene(options: {
  me?: Partial<PlayerState>;
  opp?: Partial<PlayerState>;
  /** Mano del Jugador 1, para no tener que repetir `me` cuando `currentPlayer` es 1. */
  me2Hand?: Card[];
  currentPlayer?: 0 | 1;
  turnCount?: number;
  phase?: GameState['phase'];
  selection?: GameState['selection'];
  pendingTrap?: GameState['pendingTrap'];
  pendingDice?: GameState['pendingDice'];
}): GameState {
  const base = initialState();
  return {
    ...base,
    phase: options.phase ?? 'playing',
    currentPlayer: options.currentPlayer ?? 0,
    turnCount: options.turnCount ?? 3,
    players: [
      playerWith(0, blankField(), [], options.me),
      playerWith(1, blankField(), options.me2Hand ?? [], options.opp),
    ],
    selection: options.selection ?? { kind: 'none' },
    pendingTrap: options.pendingTrap ?? null,
    pendingDice: options.pendingDice ?? null,
  };
}

const trap = (n: number): TrapCard => TRAPS[n - 1];
const magic = (n: number): MagicCard => MAGICS[n - 1];

// ============================================================================

describe('ARREGLO Â· la cuota de 3 cartas por turno ya no se puede saltar (Regla 16)', () => {
  // ANTES: el reducer comprobaba `cardsPlayedThisTurn` al entrar por la acciÃ³n de
  // SELECCIÃ“N (`SELECT_TRAP_PLACE` / `SELECT_MAGIC`) pero no al ejecutar la
  // acciÃ³n de colocaciÃ³n. Las acciones de un solo paso (`PLACE_TRAP_ON_MONSTER`,
  // `PLACE_MAGIC_ON_MONSTER`, `MAGIC_TARGET_MONSTER`, `MAGIC_INSTANT`) aplicaban
  // la carta sin mirar la cuota, asÃ­ que se podÃ­an jugar mÃ¡s de 3 cartas.
  //
  // AHORA: la cuota se comprueba en el punto en el que una carta sale de la mano.
  // Estos tests son la regresiÃ³n que impide que el hueco vuelva a abrirse.
  //
  // Historia: detectado por la red de seguridad de F0 y escrito como
  // `DEFECTO 1` antes de corregirlo.

  it('colocar una Trampa por la ruta directa respeta la cuota', () => {
    const t = trap(1);
    const conCuota = scene({
      me: { field: [fieldMonster(monster(3)), ...blankField().slice(1)], hand: [t] },
    });
    // Con cuota disponible se aplica con normalidad (no se rompe nada).
    const aplicada = reducer(conCuota, {
      type: 'PLACE_TRAP_ON_MONSTER',
      card: t,
      fieldUid: conCuota.players[0].field[0]!.uid,
    });
    expect(changedTheGame(conCuota, aplicada)).toBe(true);
    expect(aplicada.players[0].cardsPlayedThisTurn).toBe(1);

    // Con la cuota agotada, ni la ruta de la interfaz ni la directa.
    const agotada = scene({
      me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, field: [fieldMonster(monster(3)), ...blankField().slice(1)], hand: [t] },
    });
    expect(reducer(agotada, { type: 'SELECT_TRAP_PLACE', card: t })).toBe(agotada);
    expect(reducer(agotada, { type: 'PLACE_TRAP_ON_MONSTER', card: t, fieldUid: 'uid-m-espadas-3' })).toBe(agotada);
    expect(agotada.players[0].field[0]!.trap).toBeNull();
  });

  it('ninguna MÃ¡gica por la ruta directa respeta la cuota', () => {
    // Las cuatro entradas de un solo paso.
    const m4 = magic(4);
    const m10 = magic(10);
    const agotada = scene({
      me: {
        cardsPlayedThisTurn: MAX_CARDS_PER_TURN,
        hand: [m4, m10],
        field: [fieldMonster(monster(3)), fieldMonster(monster(4), { uid: 'otro' }), ...blankField().slice(2)],
      },
    });
    expect(reducer(agotada, { type: 'SELECT_MAGIC', card: m4 })).toBe(agotada);
    expect(reducer(agotada, { type: 'MAGIC_INSTANT', card: m10 })).toBe(agotada);
    expect(reducer(agotada, { type: 'PLACE_MAGIC_ON_MONSTER', card: m4, side: 'self', fieldUid: 'uid-m-espadas-3' })).toBe(agotada);
    expect(reducer(agotada, { type: 'MAGIC_TARGET_MONSTER', card: m4, side: 'self', fieldUid: 'otro' })).toBe(agotada);
  });

  it('con cuota disponible la MÃ¡gica se sigue aplicando por la ruta directa', () => {
    const m = magic(10);
    const conCuota = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(conCuota, { type: 'MAGIC_INSTANT', card: m });
    expect(changedTheGame(conCuota, after)).toBe(true);
    expect(after.players[0].cardsPlayedThisTurn).toBe(1);
  });
});

describe('REGRESIÃ“N â€” Trampa 5: el atacante elige y destruye una carta asociada del defensor', () => {
  it('activaciÃ³n automÃ¡tica, negaciÃ³n y elecciÃ³n del atacante', () => {
    const negadora = trap(5);
    const asociada = magic(1);
    const atacante = fieldMonster(monster(6));
    const defensor = fieldMonster(monster(4), { uid: 'defensor', trap: negadora, magic: asociada });
    const estado = scene({
      me: { field: [atacante, ...blankField().slice(1)] },
      opp: { field: [defensor, ...blankField().slice(1)] },
    });

    const trasAtacar = reducer(estado, {
      type: 'DECLARE_ATTACK',
      attackerUid: atacante.uid,
      defenderUid: 'defensor',
    });
    // La Trampa 5 se activa automÃ¡ticamente al declarar el ataque.
    const respuesta = trasAtacar;
    expect(respuesta.phase).toBe('playing');
    expect(respuesta.currentPlayer).toBe(0); // el atacante elige
    expect(respuesta.selection.kind).toBe('choose-destroy-associated-card');
    if (respuesta.selection.kind !== 'choose-destroy-associated-card') throw new Error('SelecciÃ³n de Trampa 5 no abierta');
    expect(respuesta.selection.player).toBe(0); // el atacante es quien elige
    expect(respuesta.selection.returnPlayer).toBe(1); // campo objetivo del defensor
    expect(respuesta.pendingTrap).toBeNull();
    expect(respuesta.players[1].graveyard.map((c) => c.id)).toContain('t5'); // trampa consumida

    const resuelto = reducer(respuesta, {
      type: 'DESTROY_ASSOCIATED_CARD',
      fieldUid: 'defensor',
      cardType: 'magic',
    });
    expect(resuelto.selection.kind).toBe('none');
    expect(resuelto.currentPlayer).toBe(0); // vuelve el turno al atacante
    expect(resuelto.players[1].field[0]?.magic).toBeNull();
    expect(resuelto.players[1].graveyard.map((c) => c.id)).toContain(magic(1).id);
    expect(resuelto.players[1].graveyard.map((c) => c.id)).toContain('t5');
  });
});

describe('ARREGLO Â· las Trampas 3 y 6 ya no dejan el dado colgado', () => {
  // ANTES: `applyTrapEffect` pedÃ­a el dado devolviendo `phase: 'dice-roll'` con
  // su `pendingDice`, pero `RESOLVE_TRAP` entraba despuÃ©s en el bloque
  // `negateAttack`, que rehacÃ­a la fase a 'playing' sin limpiar `pendingDice`.
  // Quedaba un dado pendiente en una fase normal: `ROLL_DICE` rechazaba la
  // acciÃ³n y la partida se congelaba para siempre con esa Trampa puesta.
  //
  // AHORA: la fase de dados tiene prioridad y se sale de `RESOLVE_TRAP` antes de
  // tocar nada mÃ¡s, conservando `pendingTrap` (que `ROLL_DICE` necesita).
  //
  // Historia: detectado por la red de seguridad de F0 (`DICE_ORPHANED`) y
  // escrito como `DEFECTO 3` antes de corregirlo.

  function atacarConTrampa(trampaDelDefensor: TrapCard): GameState {
    const estado = scene({
      me: { field: [fieldMonster(monster(6), { uid: 'atacante' }), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(monster(4), { uid: 'defensor', trap: trampaDelDefensor }), ...blankField().slice(1)] },
    });
    const atacando = reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'atacante', defenderUid: 'defensor' });
    return atacando;
  }

  it('la Trampa 3 pide el dado y el juego puede continuar', () => {
    const resuelto = atacarConTrampa(trap(3));
    expect(resuelto.phase).toBe('dice-roll');
    expect(resuelto.pendingDice).not.toBeNull();

    // El dado se puede lanzar y la partida sigue.
    const lanzado = reducer(resuelto, { type: 'ROLL_DICE', roll: 2 });
    expect(changedTheGame(resuelto, lanzado)).toBe(true);
    expect(lanzado.pendingDice).toBeNull();
    expect(lanzado.pendingTrap).toBeNull();
    expect(lanzado.phase).toBe('playing');
  });

  it('la Trampa 6 pide el dado y el juego puede continuar', () => {
    const resuelto = atacarConTrampa(trap(6));
    expect(resuelto.phase).toBe('dice-roll');
    expect(resuelto.pendingDice).not.toBeNull();

    const lanzado = reducer(resuelto, { type: 'ROLL_DICE', roll: 5 });
    expect(changedTheGame(resuelto, lanzado)).toBe(true);
    expect(lanzado.pendingDice).toBeNull();
    expect(lanzado.pendingTrap).toBeNull();
    expect(lanzado.phase).toBe('playing');
  });

  it('la Trampa se retira del monstruo cuando se resuelve el dado', () => {
    const resuelto = atacarConTrampa(trap(3));
    const lanzado = reducer(resuelto, { type: 'ROLL_DICE', roll: 2 });
    expect(lanzado.players[1].field[0]?.trap).toBeNull();
  });

  it('no queda ningÃºn estado con un dado pendiente fuera de la fase de dados', () => {
    // Barrido: ninguna combinaciÃ³n de Trampa 3 o 6 puede dejar el juego colgado.
    for (const trampa of [trap(3), trap(6)]) {
      for (const cara of [1, 2, 3, 4, 5, 6]) {
        const resuelto = atacarConTrampa(trampa);
        const lanzado = reducer(resuelto, { type: 'ROLL_DICE', roll: cara });
        expect(lanzado.pendingDice).toBeNull();
        expect(lanzado.pendingTrap).toBeNull();
      }
    }
  });

  it('la CPU responde al dado pendiente en vez de quedarse esperando', () => {
    // Problema DERIVADO de la correcciÃ³n: al arreglar el dado colgante, las
    // Trampas 3 y 6 entran de verdad en la fase de dados, y la CPU no sabÃ­a
    // salir de ella (proponÃ­a END_TURN, el reducer lo rechazaba por la fase y la
    // partida esperaba un dado que nadie tiraba). Ahora responde.
    const m = monster(3);
    // Es turno de la CPU (asiento 1), y la Trampa 3 la tiene el DEFENSOR.
    const escena = scene({
      currentPlayer: 1,
      me: { field: [fieldMonster(m, { uid: 'defensor', trap: trap(3) }), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(m, { uid: 'atacante' }), ...blankField().slice(1)] },
    });
    const atacando = reducer(escena, { type: 'DECLARE_ATTACK', attackerUid: 'atacante', defenderUid: 'defensor' });
    const conDado = atacando;
    expect(conDado.phase).toBe('dice-roll');

    const accion = nextCpuAction(conDado);
    expect(accion.type).toBe('ROLL_DICE');
    if (accion.type !== 'ROLL_DICE') throw new Error('la CPU no proposed un dado');
    expect(accion.roll).toBeGreaterThanOrEqual(1);
    expect(accion.roll).toBeLessThanOrEqual(6);

    const lanzado = reducer(conDado, accion);
    expect(changedTheGame(conDado, lanzado)).toBe(true);
    expect(lanzado.pendingDice).toBeNull();
    expect(lanzado.phase).toBe('playing');
  });
});

describe('ARREGLO Â· una MÃ¡gica que deja al rival a 0 PV termina la partida (Regla 27.1)', () => {
  // ANTES: `applyMagicEffect` calculaba el ganador pero devolvÃ­a el estado con la
  // fase intacta, asÃ­ que podÃ­a quedar un jugador con 0 PV y la partida
  // continuando. La Regla 27.1 dice que ese jugador Â«pierde inmediatamenteÂ».
  //
  // AHORA: `applyMagicEffect` aplica el final de partida igual que el resto de
  // acciones del motor.
  //
  // Historia: detectado por la red de seguridad de F0 (`WIN_NOT_APPLIED`) y
  // escrito como `DEFECTO 4` antes de corregirlo.

  it('la MÃ¡gica 1 permite el ataque directo y este termina la partida al llegar a 0 PV', () => {
    const m = magic(1);
    const attacker = fieldMonster(monster(9));
    const estado = scene({
      me: { field: [attacker, ...blankField().slice(1)], hand: [m] },
      opp: { lp: 4 },
    });
    const selected = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(selected.selection.kind).toBe('place-magic');
    expect(selected.players[1].lp).toBe(4);

    const equipped = reducer(selected, {
      type: 'PLACE_MAGIC_ON_MONSTER',
      card: m,
      side: 'self',
      fieldUid: attacker.uid,
    });
    expect(equipped.players[0].field[0]?.magic?.id).toBe(m.id);
    const after = reducer(equipped, { type: 'DIRECT_ATTACK', attackerUid: attacker.uid });
    expect(after.players[1].lp).toBe(0);
    expect(after.winner).toBe(0);
    expect(after.phase).toBe('game-over');
  });

  it('si la MÃ¡gica deja PV intactos, la partida sigue', () => {
    const m = magic(10); // Robar 2 cartas: no hace daÃ±o.
    const estado = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(changedTheGame(estado, after)).toBe(true);
    expect(after.phase).toBe('playing');
    expect(after.winner).toBeNull();
  });

  it('el empate a 0 PV tambiÃ©n termina la partida al comprobar el inicio del turno', () => {
    const estado = scene({
      me: { lp: 0 },
      opp: { lp: 0 },
    });
    const after = reducer(estado, { type: 'END_TURN' });
    expect(after.phase).toBe('game-over');
    expect(after.isDraw).toBe(true);
    expect(after.winner).toBeNull();
  });
});

describe('DEFECTO 2 Â· una MÃ¡gica utilizada desaparece del juego', () => {
  // Al resolverse, `playCardFromHand` retira la MÃ¡gica de la mano y no la envÃ­a a
  // ninguna zona. El reglamento NO define el destino de una MÃ¡gica utilizada
  // (Â§26 habla de cartas Â«retiradas del campoÂ»), asÃ­ que esto es un PUNTO ABIERTO
  // del reglamento ademÃ¡s de un hecho observable del motor.
  //
  // CORRESPONDE A: decisiÃ³n del creador sobre el destino de las cartas usadas.
  // NO se inventa ninguna regla aquÃ­.

  it('la MÃ¡gica desaparece: sale de la mano y no aparece en el cementerio', () => {
    const m = magic(10);
    const estado = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(indexOfCardInstance(after.players[0].hand, m)).toBe(-1);
    expect(after.players[0].graveyard.map((c) => c.id)).not.toContain(m.id);
    expect(after.players[1].graveyard.map((c) => c.id)).not.toContain(m.id);
  });
});

describe('REGRESIÃ“N Â· la CPU usa MÃ¡gica 2 aunque pueda robar un duplicado', () => {
  it('selecciona MÃ¡gica 2 si el rival tiene cartas, aunque todas sean copias que la CPU ya posee', () => {
    const m2 = magic(2);
    const duplicada = monster(3);
    const estado = scene({
      currentPlayer: 1,
      me: { hand: [duplicada] },
      opp: { hand: [m2, duplicada] },
    });

    const accion = nextCpuAction(estado);
    expect(accion.type).toBe('SELECT_MAGIC');
    if (accion.type !== 'SELECT_MAGIC') throw new Error('la CPU no seleccionÃ³ MÃ¡gica 2');
    expect(accion.card).toBe(m2);
  });

  it('no selecciona MÃ¡gica 2 si el rival tiene la mano vacÃ­a', () => {
    const m2 = magic(2);
    const estado = scene({
      currentPlayer: 1,
      me: { hand: [] },
      opp: { hand: [m2] },
    });

    expect(nextCpuAction(estado).type).not.toBe('SELECT_MAGIC');
  });
});

describe('ARREGLO F1 Â· la CPU se atascaba con la MÃ¡gica 5 (recuperar del cementerio)', () => {
  // ANTES DE F1 (comportamiento documentado, ya retirado):
  //   La MÃ¡gica 5 puede pedir al jugador que elija destino (mano o campo). Esa
  //   elecciÃ³n solo la sabÃ­a completar la interfaz: `nextCpuAction` la ignoraba,
  //   volvÃ­a a proponer la misma MÃ¡gica, el reducer le devolvÃ­a el mismo estado
  //   y la partida se quedaba congelada. En la aplicaciÃ³n real solo la rescataba
  //   la red de seguridad de 60 acciones, que ademÃ¡s no puede cerrar el turno si
  //   la fase no es 'playing'.
  //
  // AHORA: `nextCpuAction` consulta `legalActions()`, que con una elecciÃ³n
  // abierta devuelve exactamente las jugadas que la terminan. La CPU elige
  // recuperar al campo. Este test es la REGRESIÃ“N que impide que vuelva a
  // colarse.
  //
  // Historia: detectado por la red de seguridad de F0 (clase `CPU_REJECTED`) y
  // escrito como `DEFECTO 6` antes de arreglarlo.

  it('la CPU completa la elecciÃ³n de destino de la MÃ¡gica 5 en lugar de repetirla', () => {
    const m = magic(5);
    const difunto = monster(3);
    // El asiento 1 es el que juega la CPU de producto.
    const estado = scene({
      currentPlayer: 1,
      opp: { hand: [m], graveyard: [difunto] },
    });

    // La MÃ¡gica abre la elecciÃ³n de destino: mano o campo.
    const abierta = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(abierta.selection.kind).toBe('revive-choice');

    // Antes se repetÃ­a eternamente; ahora avanza.
    const accion = nextCpuAction(abierta);
    expect(accion.type).toBe('REVIVE_CHOICE');
    const despues = reducer(abierta, accion);
    expect(changedTheGame(abierta, despues)).toBe(true);
    expect(despues.selection.kind).toBe('none');
    expect(despues.players[1].field.filter(Boolean)).toHaveLength(1);
  });

  it('la CPU no vuelve a proponer la MÃ¡gica 5 con la elecciÃ³n ya abierta', () => {
    const m = magic(5);
    const difunto = monster(3);
    const abierta = reducer(
      scene({ currentPlayer: 1, opp: { hand: [m], graveyard: [difunto] } }),
      { type: 'SELECT_MAGIC', card: m },
    );
    for (let i = 0; i < 5; i++) {
      expect(nextCpuAction(abierta).type).not.toBe('SELECT_MAGIC');
    }
  });
});

describe('REGRESIÃ“N Â· Trampa 9 permite elegir cualquier Monstruo del campo', () => {
  it('puede destruir su propio Monstruo portador y consumir la Trampa 9', () => {
    const trampa9 = trap(9);
    const conSeleccion = scene({
      selection: { kind: 'choose-destroy-target', trapUid: 'mio', trapPlayer: 0 },
      me: {
        field: [fieldMonster(monster(2), { uid: 'mio', trap: trampa9, pendingTurns: 0 }), null, null, null, null, null],
      },
      opp: { field: [fieldMonster(monster(12), { uid: 'rival' }), null, null, null, null, null] },
    });

    const resuelto = reducer(conSeleccion, { type: 'DESTROY_MONSTER', fieldUid: 'mio' });
    expect(resuelto).not.toBe(conSeleccion);
    expect(resuelto.players[0].field[0]).toBeNull();
    expect(resuelto.players[0].graveyard.map((c) => c.id)).toContain('t9');
    expect(resuelto.selection.kind).toBe('none');
  });
});

describe('REGRESIÃ“N Â· el reducer rechaza ataques ilegales', () => {
  it('rechaza atacar con un Monstruo en Defensa o que ya atacÃ³', () => {
    const estado = scene({
      me: { field: [fieldMonster(monster(8), { uid: 'a', hasAttacked: true, position: 'defense', faceDown: false }), null, null, null, null, null] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), null, null, null, null, null] },
    });
    expect(reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' })).toBe(estado);
  });

  it('rechaza atacar durante el primer turno', () => {
    const estado = scene({
      currentPlayer: 0,
      turnCount: 0,
      me: { field: [fieldMonster(monster(8), { uid: 'a' }), null, null, null, null, null] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), null, null, null, null, null] },
    });
    expect(reducer(estado, { type: 'START_ATTACK', attackerUid: 'a' })).toBe(estado);
    expect(reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' })).toBe(estado);
  });
});

describe('REGRESIÃ“N Â· el dado solo admite resultados entre 1 y 6', () => {
  it('rechaza un resultado fuera del rango y no altera la partida', () => {
    const estado = scene({
      phase: 'dice-roll',
      pendingDice: { reason: 'DaÃ±o por dado', onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) as Action },
    });
    expect(reducer(estado, { type: 'ROLL_DICE', roll: 999 })).toBe(estado);
    expect(reducer(estado, { type: 'ROLL_DICE', roll: 0 })).toBe(estado);
    expect(reducer(estado, { type: 'ROLL_DICE', roll: 4 })).not.toBe(estado);
  });
});

describe('ARREGLO Â· una acciÃ³n normal ya no cancela una selecciÃ³n pendiente', () => {
  // ANTES: con una elecciÃ³n abierta (colocar una Trampa, colocar una MÃ¡gica,
  // elegir objetivo, elegir destino con la MÃ¡gica 5), el reducer seguÃ­a
  // admitiendo jugadas de fondo: invocar, cerrar el turno, cambiar de posiciÃ³n,
  // abrir otra selecciÃ³n. Las que tocaban la selecciÃ³n la borraban sin
  // resolverla, asÃ­ que la carta elegida se quedaba en la mano y el jugador
  // perdÃ­a su turno de decidir.
  //
  // AHORA: con una elecciÃ³n abierta, lo Ãºnico que el motor acepta son las
  // jugadas que la terminan o la cancelan.
  //
  // Historia: detectado por la red de seguridad de F0 y escrito como
  // `DEFECTO 10` antes de corregirlo.

  it('no deja cerrar el turno con una Trampa pendiente de colocar', () => {
    const t = trap(1);
    const estado = scene({
      selection: { kind: 'place-trap', card: t },
      me: { hand: [t], field: [fieldMonster(monster(3)), ...blankField().slice(1)] },
    });
    expect(reducer(estado, { type: 'END_TURN' })).toBe(estado);
    // La salida sigue existiendo: completar o cancelar.
    expect(changedTheGame(estado, reducer(estado, { type: 'PLACE_TRAP_ON_MONSTER', card: t, fieldUid: 'uid-m-espadas-3' }))).toBe(true);
    expect(changedTheGame(estado, reducer(estado, { type: 'CANCEL_SELECTION' }))).toBe(true);
  });

  it('no deja invocar un Monstruo cancelando la Trampa pendiente', () => {
    const t = trap(1);
    const m = monster(4);
    const estado = scene({
      selection: { kind: 'place-trap', card: t },
      me: { hand: [t, m], field: [fieldMonster(monster(3)), ...blankField().slice(1)] },
    });
    expect(reducer(estado, { type: 'SUMMON_MONSTER', card: m, position: 'attack' })).toBe(estado);
  });

  it('bloquea las demÃ¡s jugadas de fondo con una elecciÃ³n abierta', () => {
    const t = trap(1);
    const estado = scene({
      selection: { kind: 'place-trap', card: t },
      me: { hand: [t, monster(4), magic(10)], field: [fieldMonster(monster(3)), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(monster(2), { uid: 'd' }), ...blankField().slice(1)] },
    });
    const bloqueadas: Action[] = [
      { type: 'END_TURN' },
      { type: 'CHANGE_POSITION', fieldUid: 'uid-m-espadas-3' },
      { type: 'SUMMON_MONSTER', card: monster(4), position: 'attack' },
      { type: 'SELECT_TRAP_PLACE', card: t },
      { type: 'SELECT_MAGIC', card: magic(10) },
      { type: 'START_ATTACK', attackerUid: 'uid-m-espadas-3' },
      { type: 'DIRECT_ATTACK', attackerUid: 'uid-m-espadas-3' },
    ];
    for (const accion of bloqueadas) {
      expect(reducer(estado, accion), `${accion.type} no deberÃ­a admitirse`).toBe(estado);
    }
  });

  it('la elecciÃ³n sigue siendo resoluble en cada uno de sus tipos', () => {
    // Ninguna elecciÃ³n puede quedarse sin salida: completarla o cancelarla.
    const casos: GameState[] = [
      scene({ selection: { kind: 'place-trap', card: trap(1) }, me: { hand: [trap(1)], field: [fieldMonster(monster(3)), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'place-magic', card: magic(4) }, me: { hand: [magic(4)], field: [fieldMonster(monster(3)), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'attack', attackerUid: 'a' }, me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blankField().slice(1)] }, opp: { field: [fieldMonster(monster(2), { uid: 'd', position: 'defense', faceDown: true }), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'choose-destroy-target', trapUid: 'a', trapPlayer: 0 }, me: { field: [fieldMonster(monster(2), { uid: 'a' }), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'revive-choice', card: magic(5) }, me: { hand: [magic(5)], graveyard: [monster(3)] } }),
    ];
    for (const estado of casos) {
      expect(estado.selection.kind).not.toBe('none');
      expect(changedTheGame(estado, reducer(estado, { type: 'CANCEL_SELECTION' }))).toBe(true);
    }
  });

  it('las fases de Trampa y de dados siguen funcionando con una selecciÃ³n abierta', () => {
    // La guarda no debe tocar las fases en las que decide otro jugador.
    const conSeleccion = scene({
      phase: 'playing',
      currentPlayer: 0,
      selection: { kind: 'attack', attackerUid: 'a' },
      me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(monster(2), { uid: 'd', trap: trap(1) }), ...blankField().slice(1)] },
      pendingTrap: {
        attackerUid: 'a',
        defenderUid: 'd',
        trap: trap(1),
        defenderPlayer: 1,
        attackerPlayer: 0,
        attackerCard: monster(8),
        defenderCard: monster(2),
        defenderPosition: 'attack',
      },
    });
    // La confirmaciÃ³n manual de activaciÃ³n ya no forma parte del flujo normal.
    expect(reducer(conSeleccion, { type: 'RESOLVE_TRAP', activate: false })).toBe(conSeleccion);
  });
});

describe('REGRESIÃ“N Â· MÃ¡gica 5 valida la carta que abriÃ³ la elecciÃ³n', () => {
  it('rechaza resolver MÃ¡gica 5 gastando otra MÃ¡gica', () => {
    const m5 = magic(5);
    const otra = magic(10);
    const difunto = monster(3);
    const estado = scene({
      selection: { kind: 'revive-choice', card: m5 },
      me: { hand: [m5, otra], graveyard: [difunto] },
    });

    const after = reducer(estado, { type: 'REVIVE_CHOICE', card: otra, choice: 'hand' });
    expect(after).toBe(estado);
    expect(after.players[0].hand.map((c) => c.id)).toContain('m5');
    expect(after.players[0].hand.map((c) => c.id)).toContain('m10');
    expect(after.players[0].graveyard.map((c) => c.id)).toContain(difunto.id);
    expect(after.players[0].cardsPlayedThisTurn).toBe(0);
  });
});


describe('REGRESIÃ“N Â· MÃ¡gica 5 sigue las reglas confirmadas por el creador', () => {
  it('sin Monstruos propios en el cementerio no consume la MÃ¡gica ni la cuota', () => {
    const m = magic(5);
    const estado = scene({ me: { hand: [m], graveyard: [] } });
    const despues = reducer(estado, { type: 'SELECT_MAGIC', card: m });

    expect(despues.players[0].hand).toContain(m);
    expect(despues.players[0].cardsPlayedThisTurn).toBe(0);
    expect(despues.selection.kind).toBe('none');
    expect(despues.log.join(' ')).toContain('No hay Monstruos en el cementerio');
  });

  it('al recuperar al campo selecciona automÃ¡ticamente el Monstruo de mayor ATQ', () => {
    const m = magic(5);
    const bajo = monster(3);
    const alto = monster(12);
    const estado = scene({ me: { hand: [m], graveyard: [bajo, alto] } });
    const abierta = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(abierta.selection.kind).toBe('revive-choice');

    const despues = reducer(abierta, { type: 'REVIVE_CHOICE', card: m, choice: 'field', position: 'attack' });
    expect(despues.players[0].field[0]?.card.atk).toBe(12);
    expect(despues.players[0].graveyard).toContain(bajo);
    expect(despues.players[0].graveyard).not.toContain(alto);
    expect(despues.players[0].hand).not.toContain(m);
  });

  it('durante el primer turno la recuperaciÃ³n al campo queda obligatoriamente en Defensa', () => {
    const m = magic(5);
    const difunto = monster(9);
    const estado = scene({ turnCount: 0, me: { hand: [m], graveyard: [difunto] } });
    const abierta = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(abierta.selection.kind).toBe('revive-choice');

    const ataque = reducer(abierta, { type: 'REVIVE_CHOICE', card: m, choice: 'field', position: 'attack' });
    expect(ataque).toBe(abierta);

    const defensa = reducer(abierta, { type: 'REVIVE_CHOICE', card: m, choice: 'field', position: 'defense' });
    expect(defensa.players[0].field[0]?.position).toBe('defense');
    expect(defensa.players[0].field[0]?.faceDown).toBe(true);
  });
});


describe('REGRESIÃ“N Â· MÃ¡gica 5 respeta su mÃ¡ximo especÃ­fico de 9 cartas', () => {
  it('recupera a la mano con 9 cartas y mantiene la misma cantidad', () => {
    const m = magic(5);
    const difunto = monster(12);
    const hand = [m, ...Array.from({ length: 8 }, (_, index) => monster(index + 1))];
    const estado = scene({ me: { hand, graveyard: [difunto] } });
    const abierta = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(abierta.selection.kind).toBe('revive-choice');
    const despues = reducer(abierta, { type: 'REVIVE_CHOICE', card: m, choice: 'hand' });
    expect(despues.players[0].hand).toHaveLength(9);
    expect(despues.players[0].hand).not.toContain(m);
    expect(despues.players[0].hand).toContain(difunto);
    expect(despues.players[0].graveyard).not.toContain(difunto);
    expect(despues.players[0].cardsPlayedThisTurn).toBe(1);
    expect(despues.selection.kind).toBe('none');
  });

  it('recupera a la mano aunque la mano supere las 9 cartas', () => {
    const m = magic(5);
    const difunto = monster(12);
    const hand = [m, ...Array.from({ length: 9 }, (_, index) => monster(index + 1))];
    const field = Array.from({ length: 6 }, (_, index) => fieldMonster(monster(index + 1), { uid: `full-${index}` }));
    const estado = scene({ me: { hand, graveyard: [difunto], field } });
    const despues = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(despues.players[0].hand.map((c) => c.id)).toContain(difunto.id);
    expect(despues.players[0].hand.map((c) => c.id)).not.toContain(m.id);
    expect(despues.players[0].graveyard.map((c) => c.id)).not.toContain(difunto.id);
    expect(despues.players[0].cardsPlayedThisTurn).toBe(1);
  });
});

describe('REGRESIÃ“N Â· las Trampas asociadas sobreviven al combate si sobrevive su Monstruo', () => {
  it.each([1, 12])('conserva la Trampa %i tras un empate y no la envÃ­a al cementerio', (trapNumber) => {
    const passiveTrap = trap(trapNumber);
    const attacker = fieldMonster(monster(8), { uid: 'attacker' });
    const defender = fieldMonster(monster(8), {
      uid: 'defender',
      position: 'defense',
      trap: passiveTrap,
    });
    const state = scene({
      me: { field: [attacker, ...blankField().slice(1)] },
      opp: { field: [defender, ...blankField().slice(1)] },
    });

    const selecting = reducer(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    const afterCombat = reducer(selecting, {
      type: 'DECLARE_ATTACK',
      attackerUid: attacker.uid,
      defenderUid: defender.uid,
    });

    expect(afterCombat.phase).toBe('playing');
    expect(afterCombat.players[1].field[0]?.uid).toBe('defender');
    expect(afterCombat.players[1].field[0]?.trap?.id).toBe(passiveTrap.id);
    expect(afterCombat.players[1].graveyard.map((card) => card.id)).not.toContain(passiveTrap.id);
  });

  it('envÃ­a la Trampa al cementerio de su propietario cuando el Monstruo defensor es destruido', () => {
    const passiveTrap = trap(1);
    const attacker = fieldMonster(monster(10), { uid: 'attacker' });
    const defender = fieldMonster(monster(5), {
      uid: 'defender',
      position: 'defense',
      trap: passiveTrap,
    });
    const state = scene({
      me: { field: [attacker, ...blankField().slice(1)] },
      opp: { field: [defender, ...blankField().slice(1)] },
    });

    const selecting = reducer(state, { type: 'START_ATTACK', attackerUid: attacker.uid });
    const afterCombat = reducer(selecting, {
      type: 'DECLARE_ATTACK',
      attackerUid: attacker.uid,
      defenderUid: defender.uid,
    });

    expect(afterCombat.players[1].field[0]).toBeNull();
    expect(afterCombat.players[1].graveyard.map((card) => card.id)).toContain(passiveTrap.id);
  });
});

describe('REGRESION: Magica 5 no limita la recuperacion a una mano de 9 cartas', () => {
  it('ofrece recuperar a la mano con 10 o mas cartas aunque el campo este lleno', () => {
    const m5 = magic(5);
    const recovered = monster(12);
    const hand = [m5, ...Array.from({ length: 10 }, (_, index) => monster(index + 1))];
    const fullField = Array.from({ length: 6 }, (_, index) =>
      fieldMonster(monster(index + 20), { uid: `magic5-full-${index}` }),
    );
    const state = scene({ me: { hand, graveyard: [recovered], field: fullField } });

    expect(legalActions(state, 0).some((action) => action.type === 'SELECT_MAGIC' && action.card === m5)).toBe(true);

    // Con el campo lleno solo existe la opción de recuperar a la mano:
    // el efecto se resuelve automáticamente y la Mágica se sustituye por el monstruo.
    const selecting = reducer(state, { type: 'SELECT_MAGIC', card: m5 });
    expect(selecting.selection.kind).toBe('none');
    expect(selecting.players[0].hand).toHaveLength(hand.length);
    expect(selecting.players[0].hand).toContain(recovered);
    expect(selecting.players[0].hand).not.toContain(m5);
    expect(selecting.players[0].graveyard).not.toContain(recovered);
  });
});

describe('REGRESION: Trampa 7 intercambia monstruos aunque ambos campos esten llenos', () => {
  it('intercambia control y casillas sin destruir monstruos ni exigir huecos libres', () => {
    const attacker = fieldMonster(monster(8), { uid: 'full-field-attacker', position: 'attack' });
    const defender = fieldMonster(monster(3), {
      uid: 'full-field-defender',
      position: 'defense',
      trap: trap(7),
    });
    const attackerField = [
      attacker,
      ...Array.from({ length: 5 }, (_, index) =>
        fieldMonster(monster(index + 30), { uid: `attacker-side-${index}` }),
      ),
    ];
    const defenderField = [
      defender,
      ...Array.from({ length: 5 }, (_, index) =>
        fieldMonster(monster(index + 40), { uid: `defender-side-${index}` }),
      ),
    ];
    const state = scene({ me: { field: attackerField }, opp: { field: defenderField } });

    const after = reducer(state, {
      type: 'DECLARE_ATTACK',
      attackerUid: attacker.uid,
      defenderUid: defender.uid,
    });

    const attackerAfter = after.players[1].field.find((fm) => fm?.uid === attacker.uid);
    const defenderAfter = after.players[0].field.find((fm) => fm?.uid === defender.uid);
    expect(attackerAfter).toBeDefined();
    expect(defenderAfter).toBeDefined();
    expect(attackerAfter?.controlledBy).toBe(1);
    expect(defenderAfter?.controlledBy).toBe(0);
    expect(attackerAfter?.position).toBe('attack');
    expect(defenderAfter?.position).toBe('defense');
    expect(after.players[0].field.filter(Boolean)).toHaveLength(6);
    expect(after.players[1].field.filter(Boolean)).toHaveLength(6);
    expect(defenderAfter?.trap).toBeNull();
    expect(after.players[1].graveyard.some((card) => card.id === trap(7).id)).toBe(true);
    expect(after.players[0].graveyard.some((card) => card.id === attacker.card.id || card.id === defender.card.id)).toBe(false);
    expect(after.players[1].graveyard.some((card) => card.id === attacker.card.id || card.id === defender.card.id)).toBe(false);
  });
});
