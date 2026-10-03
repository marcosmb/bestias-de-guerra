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

describe('DEFECTO 1 · la cuota de 3 cartas por turno se puede saltar (Regla 16)', () => {
  // El reducer comprueba `cardsPlayedThisTurn` al entrar por la acción de
  // SELECCIÓN (`SELECT_TRAP_PLACE` / `SELECT_MAGIC`) pero NO al ejecutar la
  // acción de colocación. Es decir, las acciones de un solo paso
  // (`PLACE_TRAP_ON_MONSTER`, `PLACE_MAGIC_ON_MONSTER`, `MAGIC_TARGET_MONSTER`
  // y `MAGIC_INSTANT`) aplican la carta sin mirar la cuota.
  //
  // La interfaz nunca llega por ese camino: siempre pasa por la selección. Por
  // eso hoy es inocuo, y por eso es peligroso: es un hueco de validación que
  // cualquier cliente (o una futura CPU que construya acciones por su cuenta)
  // podría aprovechar.
  //
  // CORRESPONDE A: F3 (`isLegal`/`apply`), donde el reducer validará la acción.
  // NOTA: `legalActions()` de F1 NUNCA genera estas acciones de un paso: obliga
  // a pasar por la selección, que sí comprueba la cuota.

  it('colocar una Trampa sin selección no consulta la cuota', () => {
    const t = trap(1);
    // Cuota YA agotada de antemano.
    const state = scene({
      me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, field: [fieldMonster(monster(3)), ...blankField().slice(1)], hand: [t] },
    });
    expect(state.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN);

    // La ruta que usa la interfaz está correctamente bloqueada:
    expect(reducer(state, { type: 'SELECT_TRAP_PLACE', card: t })).toBe(state);

    // Pero la ruta directa SÍ se aplica y sube el contador por encima del tope.
    const after = reducer(state, {
      type: 'PLACE_TRAP_ON_MONSTER',
      card: t,
      fieldUid: state.players[0].field[0]!.uid,
    });
    expect(changedTheGame(state, after)).toBe(true);
    expect(after.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN + 1);
  });

  it('el hueco se repite con cualquier Mágica que no necesite objetivo', () => {
    // Se agota la cuota legítimamente y luego se sigue jugando por el atajo.
    const m = magic(10); // Robar 2 cartas: no necesita objetivo.
    const withQuota = scene({ me: { cardsPlayedThisTurn: MAX_CARDS_PER_TURN, hand: [m] } });
    expect(reducer(withQuota, { type: 'SELECT_MAGIC', card: m })).toBe(withQuota);
    const after = reducer(withQuota, { type: 'MAGIC_INSTANT', card: m });
    expect(changedTheGame(withQuota, after)).toBe(true);
    expect(after.players[0].cardsPlayedThisTurn).toBe(MAX_CARDS_PER_TURN + 1);
  });
});

describe('DEFECTO 2 · la Trampa 5 borra la Trampa o Mágica rival sin mandarla al cementerio', () => {
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

describe('DEFECTO 3 · las Trampas 3 y 6 dejan el dado colgado para siempre', () => {
  // `applyTrapEffect` pide el dado devolviendo `phase: 'dice-roll'` y un
  // `pendingDice`. Pero `RESOLVE_TRAP` fuerza después `phase: 'playing'` porque
  // entra en el bloque de `negateAttack` ANTES de comprobar la fase de dados. El
  // resultado es un estado con un dado pendiente en una fase normal: nadie puede
  // lanzar el dado y `ROLL_DICE` ya no se aceptará. El juego se queda bloqueado
  // para siempre con esa Trampa puesta.
  //
  // CORRESPONDE A: F3 (orden de fases en el resolver de Trampas).

  it('tras activar la Trampa 3 el juego queda con un dado que no se puede lanzar', () => {
    const estado = scene({
      me: { field: [fieldMonster(monster(6)), ...blankField().slice(1)] },
      opp: { field: [fieldMonster(monster(4), { uid: 'defensor', trap: trap(3) }), ...blankField().slice(1)] },
    });
    const conTrampa = reducer(estado, {
      type: 'PLACE_TRAP_ON_MONSTER',
      card: trap(6),
      fieldUid: estado.players[0].field[0]!.uid,
    });
    const atacando = reducer(conTrampa, { type: 'DECLARE_ATTACK', attackerUid: estado.players[0].field[0]!.uid, defenderUid: 'defensor' });
    expect(atacando.phase).toBe('trap-response');

    const resuelto = reducer(atacando, { type: 'RESOLVE_TRAP', activate: true });
    // Comportamiento ACTUAL (el defecto): fase normal con dado pendiente.
    expect(resuelto.phase).toBe('playing');
    expect(resuelto.pendingDice).not.toBeNull();
    // Y el dado ya no se puede lanzar, porque `ROLL_DICE` exige esa fase.
    expect(reducer(resuelto, { type: 'ROLL_DICE', roll: 3 })).toBe(resuelto);
  });
});

describe('DEFECTO 4 · una Mágica puede dejar a un rival con 0 PV sin terminar la partida', () => {
  // `applyMagicEffect` calcula el ganador al final, pero no pasa la fase a
  // 'game-over'. La Regla 27.1 dice que el jugador que llega a 0 PV «pierde
  // inmediatamente». Con la Mágica 1 (ataque directo) eso no ocurre: la partida
  // sigue con un jugador ya sin PV.
  //
  // CORRESPONDE A: F3 (aplicar el final de partida tras cualquier acción).

  it('la Mágica 1 registra el ganador pero deja la fase en "playing"', () => {
    const m = magic(1);
    const estado = scene({
      me: { field: [fieldMonster(monster(9)), ...blankField().slice(1)], hand: [m] },
      opp: { lp: 4 },
    });
    const after = reducer(estado, { type: 'SELECT_MAGIC', card: m });
    expect(after.players[1].lp).toBe(0);
    expect(after.winner).toBe(0);
    // Comportamiento ACTUAL (el defecto): la partida no ha terminado.
    expect(after.phase).toBe('playing');
  });
});

describe('DEFECTO 5 · una Mágica utilizada desaparece del juego', () => {
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

describe('DEFECTO 7 · la Trampa 9 solo puede destruir Monstruos propios', () => {
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

describe('DEFECTO 8 · `DECLARE_ATTACK` no valida quién ataca', () => {
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

describe('DEFECTO 9 · el resultado de un dado no se valida', () => {
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

describe('DEFECTO 10 · el reducer no respeta la selección pendiente', () => {
  // Cuando el juego abre una elección (colocar una Trampa, colocar una Mágica,
  // elegir a quién destruir con la Trampa 9, elegir destino al recuperar con la
  // Mágica 5), lo lógico es que la única jugada legal sea TERMINAR esa elección.
  //
  // El reducer no lo comprueba: `SUMMON_MONSTER`, `SELECT_TRAP_PLACE`,
  // `SELECT_MAGIC`, `CHANGE_POSITION`, `START_ATTACK` y `END_TURN` solo miran la
  // fase. Peor aún: invocar un Monstruo pone `selection: {kind:'none'}`, así que
  // una jugada «colateral» deja la elección pendiente sin resolver y la carta
  // elegida para ella sigue en la mano.
  //
  // `legalActions()` de F1 sí lo respeta: con una selección abierta solo genera
  // las acciones que la terminan (más cancelar). Cerrar el hueco en el reducer
  // es F3.
  //
  // CORRESPONDE A: F3.

  it('permite cerrar el turno con una Trampa pendiente de colocar', () => {
    const t = trap(1);
    const estado = scene({
      selection: { kind: 'place-trap', card: t },
      me: { hand: [t], field: [fieldMonster(monster(3)), ...blankField().slice(1)] },
    });
    // Comportamiento ACTUAL (el defecto): la partida avanza con la elección a medias.
    const after = reducer(estado, { type: 'END_TURN' });
    expect(changedTheGame(estado, after)).toBe(true);
    expect(after.turnCount).toBe(estado.turnCount + 1);
    // La Trampa sigue en la mano: la elección se ha perdido.
    expect(after.players[0].hand).toContain(t);
  });

  it('invocar un Monstruo cancela la Trampa pendiente sin consumirla', () => {
    const t = trap(1);
    const m = monster(4);
    const estado = scene({
      selection: { kind: 'place-trap', card: t },
      me: { hand: [t, m], field: [fieldMonster(monster(3)), ...blankField().slice(1)] },
    });
    const after = reducer(estado, { type: 'SUMMON_MONSTER', card: m, position: 'attack' });
    expect(changedTheGame(estado, after)).toBe(true);
    // Comportamiento ACTUAL (el defecto): la selección desaparece sola.
    expect(after.selection.kind).toBe('none');
    expect(after.players[0].hand).toContain(t);
  });
});

describe('DEFECTO 11 · `REVIVE_CHOICE` no contrasta la carta de la acción', () => {
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
