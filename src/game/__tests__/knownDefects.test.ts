import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../useGame';
import { nextCpuAction } from '../cpu';
import { changedTheGame } from './support/simulation';
import type { Action, FieldMonster, GameState, PlayerState, Position } from '../types';
import { MAX_CARDS_PER_TURN, createPlayer, indexOfCardInstance } from '../types';
import type { Card, MagicCard, MonsterCard, TrapCard } from '../cardData';
import { MAGICS, TRAPS, buildDeck } from '../cardData';

// ============================================================================
// F0 — DEFECTOS PREEXISTENTES QUE LA RED DE SEGURIDAD HA DETECTADO
// ============================================================================
//
// Ninguno de estos test «falla»: PASSAN. Lo que hacen es FIJAR el comportamiento
// actual de cada defecto, de forma aislada y legible, para que:
//   · quede documentado sin depender de leer el informe del torneo;
//   · no se pueda arreglar ni olvidar en silencio: en cuanto cambie el
//     comportamiento, la prueba falla y hay que actualizar la nota al pie;
//   · cada arreglo futuro pueda comprobar que el defecto era ÉSE y no otro.
//
// Ninguno se corrige en F0 ni en F1. Se delegan a fases posteriores y se anotan
// aquí con la fase a la que corresponde.
//
// REGLA: al corregir un defecto, se BORRA su test y se anota el cambio. Si el
// arreglo fuera otra cosa, este test fallaría y lo delataría.

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

describe('ARREGLO · la cuota de 3 cartas por turno ya no se puede saltar (Regla 16)', () => {
  // ANTES: el reducer comprobaba `cardsPlayedThisTurn` al entrar por la acción de
  // SELECCIÓN (`SELECT_TRAP_PLACE` / `SELECT_MAGIC`) pero no al ejecutar la
  // acción de colocación. Las acciones de un solo paso (`PLACE_TRAP_ON_MONSTER`,
  // `PLACE_MAGIC_ON_MONSTER`, `MAGIC_TARGET_MONSTER`, `MAGIC_INSTANT`) aplicaban
  // la carta sin mirar la cuota, así que se podían jugar más de 3 cartas.
  //
  // AHORA: la cuota se comprueba en el punto en el que una carta sale de la mano.
  // Estos tests son la regresión que impide que el hueco vuelva a abrirse.
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

  it('ninguna Mágica por la ruta directa respeta la cuota', () => {
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

  it('con cuota disponible la Mágica se sigue aplicando por la ruta directa', () => {
    const m = magic(10);
    const conCuota = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(conCuota, { type: 'MAGIC_INSTANT', card: m });
    expect(changedTheGame(conCuota, after)).toBe(true);
    expect(after.players[0].cardsPlayedThisTurn).toBe(1);
  });
});

describe('DEFECTO 1 · la Trampa 5 borra la Trampa o Mágica rival sin mandarla al cementerio', () => {
  // La Trampa 5 «Niega el ataque y destruye una Trampa o Mágica del adversario»
  // pone `trap: null` / `magic: null` directamente. La carta desaparece del
  // juego: no va a ningún cementerio. El reglamento (§31 y §26) sí establece que
  // «si una carta asociada es destruida, va al cementerio de su propietario
  // original».
  //
  // CORRESPONDE A: decisión del creador (destino de una carta destruida) +
  // arreglo del motor. NO se toca en F0/F1.

  it('la carta asociada desaparece en vez de ir al cementerio de su propietario', () => {
    // La Trampa 5 la tiene el DEFENSOR (se activa al recibir el ataque) y
    // destruye la primera Trampa o Mágica que encuentre en el campo del atacante.
    const victima = trap(1);
    const negadora = trap(5);
    const atacante = fieldMonster(monster(6));
    const estado = scene({
      // El atacante juega la Trampa 1 desde su mano (camino de la interfaz).
      me: { field: [atacante, ...blankField().slice(1)], hand: [victima] },
      opp: { field: [fieldMonster(monster(4), { uid: 'defensor', trap: negadora }), ...blankField().slice(1)] },
    });
    const eligiendo = reducer(estado, { type: 'SELECT_TRAP_PLACE', card: victima });
    const conTrampa = reducer(eligiendo, { type: 'PLACE_TRAP_ON_MONSTER', card: victima, fieldUid: atacante.uid });
    expect(conTrampa.players[0].field[0]!.trap?.id).toBe('t1');

    const trasAtacar = reducer(conTrampa, { type: 'DECLARE_ATTACK', attackerUid: atacante.uid, defenderUid: 'defensor' });
    expect(trasAtacar.phase).toBe('trap-response');

    const resuelto = reducer(trasAtacar, { type: 'RESOLVE_TRAP', activate: true });
    // Comportamiento ACTUAL (el defecto): la Trampa 1 desaparece sin más.
    expect(resuelto.players[0].field[0]?.trap).toBeNull();
    const enCementerio = resuelto.players.flatMap((p) => p.graveyard.map((c) => c.id));
    expect(enCementerio).not.toContain('t1');
  });
});

describe('ARREGLO · las Trampas 3 y 6 ya no dejan el dado colgado', () => {
  // ANTES: `applyTrapEffect` pedía el dado devolviendo `phase: 'dice-roll'` con
  // su `pendingDice`, pero `RESOLVE_TRAP` entraba después en el bloque
  // `negateAttack`, que rehacía la fase a 'playing' sin limpiar `pendingDice`.
  // Quedaba un dado pendiente en una fase normal: `ROLL_DICE` rechazaba la
  // acción y la partida se congelaba para siempre con esa Trampa puesta.
  //
  // AHORA: la fase de dados tiene prioridad y se sale de `RESOLVE_TRAP` antes de
  // tocar nada más, conservando `pendingTrap` (que `ROLL_DICE` necesita).
  //
  // Historia: detectado por la red de seguridad de F0 (`DICE_ORPHANED`) y
  // escrito como `DEFECTO 3` antes de corregirlo.

  function atacarConTrampa(trampaDelDefensor: TrapCard): GameState {
    const estado = scene({
      me: { field: [fieldMonster(monster(6), { uid: 'atacante' }), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(monster(4), { uid: 'defensor', trap: trampaDelDefensor }), ...blankField().slice(1)] },
    });
    const atacando = reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'atacante', defenderUid: 'defensor' });
    expect(atacando.phase).toBe('trap-response');
    return reducer(atacando, { type: 'RESOLVE_TRAP', activate: true });
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

  it('no queda ningún estado con un dado pendiente fuera de la fase de dados', () => {
    // Barrido: ninguna combinación de Trampa 3 o 6 puede dejar el juego colgado.
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
    // Problema DERIVADO de la corrección: al arreglar el dado colgante, las
    // Trampas 3 y 6 entran de verdad en la fase de dados, y la CPU no sabía
    // salir de ella (proponía END_TURN, el reducer lo rechazaba por la fase y la
    // partida esperaba un dado que nadie tiraba). Ahora responde.
    const m = monster(3);
    // Es turno de la CPU (asiento 1), y la Trampa 3 la tiene el DEFENSOR.
    const escena = scene({
      currentPlayer: 1,
      me: { field: [fieldMonster(m, { uid: 'defensor', trap: trap(3) }), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(m, { uid: 'atacante' }), ...blankField().slice(1)] },
    });
    const atacando = reducer(escena, { type: 'DECLARE_ATTACK', attackerUid: 'atacante', defenderUid: 'defensor' });
    const conDado = reducer(atacando, { type: 'RESOLVE_TRAP', activate: true });
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

describe('ARREGLO · una Mágica que deja al rival a 0 PV termina la partida (Regla 27.1)', () => {
  // ANTES: `applyMagicEffect` calculaba el ganador pero devolvía el estado con la
  // fase intacta, así que podía quedar un jugador con 0 PV y la partida
  // continuando. La Regla 27.1 dice que ese jugador «pierde inmediatamente».
  //
  // AHORA: `applyMagicEffect` aplica el final de partida igual que el resto de
  // acciones del motor.
  //
  // Historia: detectado por la red de seguridad de F0 (`WIN_NOT_APPLIED`) y
  // escrito como `DEFECTO 4` antes de corregirlo.

  it('la Mágica 1 termina la partida cuando deja al rival sin PV', () => {
    const m = magic(1);
    const estado = scene({
      me: { field: [fieldMonster(monster(9)), ...blankField().slice(1)], hand: [m] },
      opp: { lp: 4 },
    });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(after.players[1].lp).toBe(0);
    expect(after.winner).toBe(0);
    expect(after.phase).toBe('game-over');
  });

  it('si la Mágica deja PV intactos, la partida sigue', () => {
    const m = magic(10); // Robar 2 cartas: no hace daño.
    const estado = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(changedTheGame(estado, after)).toBe(true);
    expect(after.phase).toBe('playing');
    expect(after.winner).toBeNull();
  });

  it('el empate a 0 PV también termina la partida', () => {
    const m = magic(1);
    const estado = scene({
      me: { field: [fieldMonster(monster(9)), ...blankField().slice(1)], hand: [m], lp: 0 },
      opp: { lp: 0 },
    });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(after.phase).toBe('game-over');
    expect(after.isDraw).toBe(true);
    expect(after.winner).toBeNull();
  });
});

describe('DEFECTO 2 · una Mágica utilizada desaparece del juego', () => {
  // Al resolverse, `playCardFromHand` retira la Mágica de la mano y no la envía a
  // ninguna zona. El reglamento NO define el destino de una Mágica utilizada
  // (§26 habla de cartas «retiradas del campo»), así que esto es un PUNTO ABIERTO
  // del reglamento además de un hecho observable del motor.
  //
  // CORRESPONDE A: decisión del creador sobre el destino de las cartas usadas.
  // NO se inventa ninguna regla aquí.

  it('la Mágica desaparece: sale de la mano y no aparece en el cementerio', () => {
    const m = magic(10);
    const estado = scene({ me: { hand: [m], deck: buildDeck().slice(0, 6) } });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(indexOfCardInstance(after.players[0].hand, m)).toBe(-1);
    expect(after.players[0].graveyard.map((c) => c.id)).not.toContain(m.id);
    expect(after.players[1].graveyard.map((c) => c.id)).not.toContain(m.id);
  });
});

describe('ARREGLO F1 · la CPU se atascaba con la Mágica 5 (recuperar del cementerio)', () => {
  // ANTES DE F1 (comportamiento documentado, ya retirado):
  //   La Mágica 5 puede pedir al jugador que elija destino (mano o campo). Esa
  //   elección solo la sabía completar la interfaz: `nextCpuAction` la ignoraba,
  //   volvía a proponer la misma Mágica, el reducer le devolvía el mismo estado
  //   y la partida se quedaba congelada. En la aplicación real solo la rescataba
  //   la red de seguridad de 60 acciones, que además no puede cerrar el turno si
  //   la fase no es 'playing'.
  //
  // AHORA: `nextCpuAction` consulta `legalActions()`, que con una elección
  // abierta devuelve exactamente las jugadas que la terminan. La CPU elige
  // recuperar al campo. Este test es la REGRESIÓN que impide que vuelva a
  // colarse.
  //
  // Historia: detectado por la red de seguridad de F0 (clase `CPU_REJECTED`) y
  // escrito como `DEFECTO 6` antes de arreglarlo.

  it('la CPU completa la elección de destino de la Mágica 5 en lugar de repetirla', () => {
    const m = magic(5);
    const difunto = monster(3);
    // El asiento 1 es el que juega la CPU de producto.
    const estado = scene({
      currentPlayer: 1,
      opp: { hand: [m], graveyard: [difunto] },
    });

    // La Mágica abre la elección de destino: mano o campo.
    const abierta = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(abierta.selection.kind).toBe('revive-choice');

    // Antes se repetía eternamente; ahora avanza.
    const accion = nextCpuAction(abierta);
    expect(accion.type).toBe('REVIVE_CHOICE');
    const despues = reducer(abierta, accion);
    expect(changedTheGame(abierta, despues)).toBe(true);
    expect(despues.selection.kind).toBe('none');
    expect(despues.players[1].field.filter(Boolean)).toHaveLength(1);
  });

  it('la CPU no vuelve a proponer la Mágica 5 con la elección ya abierta', () => {
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

describe('DEFECTO 3 · la Trampa 9 solo puede destruir Monstruos propios', () => {
  // `DESTROY_MONSTER` solo mira el campo del jugador en turno. La interfaz
  // resalta también los Monstruos rivales como objetivo válido, así que un clic
  // sobre ellos no hace nada y la elección sigue pendiente. La CPU, además,
  // elige el más fuerte entre AMBOS campos: si ese es el rival, su jugada se
  // rechaza y repite.
  //
  // CORRESPONDE A: F1 (interfaz y CPU consultan `legalActions()`, que solo
  // generará objetivos propios).

  it('el objetivo del rival se rechaza y la elección sigue pendiente', () => {
    const conSeleccion = scene({
      selection: { kind: 'choose-destroy-target', trapUid: 'mio' },
      me: { field: [fieldMonster(monster(2), { uid: 'mio' }), null, null, null, null, null] },
      opp: { field: [fieldMonster(monster(12), { uid: 'rival' }), null, null, null, null, null] },
    });
    expect(reducer(conSeleccion, { type: 'DESTROY_MONSTER', fieldUid: 'rival' })).toBe(conSeleccion);
    expect(reducer(conSeleccion, { type: 'DESTROY_MONSTER', fieldUid: 'mio' })).not.toBe(conSeleccion);
  });
});

describe('DEFECTO 4 · `DECLARE_ATTACK` no valida quién ataca', () => {
  // La auditoría lo detectó y F1 lo deja documentado a propósito: cerrar la
  // separación entre validar y ejecutar es trabajo de F3. Lo que F1 garantiza es
  // que `legalActions()` NUNCA genera un ataque ilegal, aunque el reducer lo
  // admita.
  //
  // Comprobaciones que el reducer NO hace:
  //   · que el atacante esté en posición de Ataque;
  //   · que el atacante no haya atacado ya este turno;
  //   · la Regla 17 (el primer turno del Jugador 1 no ataca).
  //
  // CORRESPONDE A: F3.

  it('acepta un ataque de un monstruo que ya ha atacado y en Defensa', () => {
    const estado = scene({
      me: { field: [fieldMonster(monster(8), { uid: 'a', hasAttacked: true, position: 'defense' as Position, faceDown: false }), null, null, null, null, null] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), null, null, null, null, null] },
    });
    const after = reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' });
    expect(changedTheGame(estado, after)).toBe(true);
  });

  it('acepta un ataque en el primer turno del Jugador 1 (Regla 17)', () => {
    const estado = scene({
      currentPlayer: 0,
      turnCount: 0,
      me: { field: [fieldMonster(monster(8), { uid: 'a' }), null, null, null, null, null] },
      opp: { field: [fieldMonster(monster(3), { uid: 'd' }), null, null, null, null, null] },
    });
    // `canAttack` lo prohíbe, y el camino de la interfaz respeta esa prohibición…
    const trasIniciar = reducer(estado, { type: 'START_ATTACK', attackerUid: 'a' });
    expect(trasIniciar).toBe(estado);
    // …pero la acción directa de ataque sí pasa.
    const after = reducer(estado, { type: 'DECLARE_ATTACK', attackerUid: 'a', defenderUid: 'd' });
    expect(changedTheGame(estado, after)).toBe(true);
  });
});

describe('DEFECTO 5 · el resultado de un dado no se valida', () => {
  // `ROLL_DICE` acepta cualquier número: la acción lleva el resultado ya
  // calculado. Un cliente podría enviar `roll: 999`.
  // En la interfaz el dado se genera en el propio cliente (`GameBoard`), así que
  // es un hueco de autoridad, no una regla mal aplicada.
  //
  // CORRESPONDE A: F3 (y a F2/F9 en cuanto el dado pase al servidor).

  it('acepta cualquier valor de dado, no solo del 1 al 6', () => {
    const estado = scene({
      phase: 'dice-roll',
      pendingDice: { reason: 'Daño por dado', onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) as Action },
    });
    expect(reducer(estado, { type: 'ROLL_DICE', roll: 999 })).not.toBe(estado);
  });
});

describe('ARREGLO · una acción normal ya no cancela una selección pendiente', () => {
  // ANTES: con una elección abierta (colocar una Trampa, colocar una Mágica,
  // elegir objetivo, elegir destino con la Mágica 5), el reducer seguía
  // admitiendo jugadas de fondo: invocar, cerrar el turno, cambiar de posición,
  // abrir otra selección. Las que tocaban la selección la borraban sin
  // resolverla, así que la carta elegida se quedaba en la mano y el jugador
  // perdía su turno de decidir.
  //
  // AHORA: con una elección abierta, lo único que el motor acepta son las
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

  it('bloquea las demás jugadas de fondo con una elección abierta', () => {
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
      expect(reducer(estado, accion), `${accion.type} no debería admitirse`).toBe(estado);
    }
  });

  it('la elección sigue siendo resoluble en cada uno de sus tipos', () => {
    // Ninguna elección puede quedarse sin salida: completarla o cancelarla.
    const casos: GameState[] = [
      scene({ selection: { kind: 'place-trap', card: trap(1) }, me: { hand: [trap(1)], field: [fieldMonster(monster(3)), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'place-magic', card: magic(4) }, me: { hand: [magic(4)], field: [fieldMonster(monster(3)), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'attack', attackerUid: 'a' }, me: { field: [fieldMonster(monster(8), { uid: 'a' }), ...blankField().slice(1)] }, opp: { field: [fieldMonster(monster(2), { uid: 'd', position: 'defense', faceDown: true }), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'choose-destroy-target', trapUid: 'a' }, me: { field: [fieldMonster(monster(2), { uid: 'a' }), ...blankField().slice(1)] } }),
      scene({ selection: { kind: 'revive-choice', card: magic(5) }, me: { hand: [magic(5)], graveyard: [monster(3)] } }),
    ];
    for (const estado of casos) {
      expect(estado.selection.kind).not.toBe('none');
      expect(changedTheGame(estado, reducer(estado, { type: 'CANCEL_SELECTION' }))).toBe(true);
    }
  });

  it('las fases de Trampa y de dados siguen funcionando con una selección abierta', () => {
    // La guarda no debe tocar las fases en las que decide otro jugador.
    const conSeleccion = scene({
      phase: 'trap-response',
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
    expect(changedTheGame(conSeleccion, reducer(conSeleccion, { type: 'RESOLVE_TRAP', activate: false }))).toBe(true);
  });
});

describe('DEFECTO 6 · `REVIVE_CHOICE` no contrasta la carta de la acción', () => {
  // Con la elección de destino abierta por la Mágica 5, el reducer acepta
  // CUALQUIER acción `REVIVE_CHOICE` que apunte a otra carta de la mano: no
  // comprueba que `action.card` sea la Mágica de la selección ni que siga en la
  // mano. El efecto se recupera igualmente, y la cuota se consume igual, pero la
  // carta que se gasta no es la que ha abierto la elección.
  //
  // `legalActions()` de F1 solo genera `REVIVE_CHOICE` con la Mágica 5 de la
  // selección abierta. Cerrar el hueco en el reducer es F3.
  //
  // CORRESPONDE A: F3.

  it('acepta una recuperación abriendo la elección con la Mágica 5 pero gastando otra carta', () => {
    const m5 = magic(5);
    const otra = magic(10);
    const difunto = monster(3);
    const estado = scene({
      selection: { kind: 'revive-choice', card: m5 },
      me: { hand: [m5, otra], graveyard: [difunto] },
    });
    const after = reducer(estado, { type: 'REVIVE_CHOICE', card: otra, choice: 'hand' });
    expect(changedTheGame(estado, after)).toBe(true);
    // Comportamiento ACTUAL (el defecto): recupera el Monstruo y sube la cuota,
    // pero la Mágica 5 sigue en la mano.
    expect(after.players[0].hand.map((c) => c.id)).toContain('m5');
    expect(after.players[0].cardsPlayedThisTurn).toBe(1);
  });
});
