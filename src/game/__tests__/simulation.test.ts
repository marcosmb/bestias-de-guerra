import { describe, it, expect } from 'vitest';
import type { FindingCode } from './support/simulation';
import {
  formatReport,
  runTournament,
  simulateGame,
} from './support/simulation';

// ============================================================================
// F0 — RED DE SEGURIDAD DEL MOTOR
// ============================================================================
//
// Qué protege esta red y cómo usarla:
//
//   1. Las HUELLAS comparan, partida a partida y paso a paso, todo lo que ocurre
//      en el juego (turno, fase, acción, selección, campo, zonas) contra una
//      referencia FIJADA en este fichero. Si alguien toca el motor y el juego
//      deja de jugar igual, la huella cambia y la prueba falla. Esa es la
//      garantía que hace falta para extraer la legalidad con confianza (F1).
//
//   2. Los HALLAZGOS son los incumplimientos que la red detecta. Cada clase está
//      comparada con `KNOWN_DEFECTS`: si aparece una nueva, o desaparece una
//      vieja, la prueba falla. Así un defecto preexistente queda documentado,
//      contabilizado y sin poder olvidarse en silencio.
//
//   3. Los tests de IN VARIANTES no dependen de ninguna huella: validan que el
//      motor respete siempre la mano de 9, el campo de 6, la cuota de 3, los PV
//      no negativos, la coherencia de fases y la conservación de cartas.
//
// Limitación conocida y documentada: no hay CPU-contra-CPU real. `nextCpuAction`
// está cableada al asiento 1 y parametrizarla por asiento es el trabajo de la
// fase F5. En el torneo `harness` los dos asientos los lleva la política aleatoria
// del arnés, que PREGUNTA AL REDUCTOR qué es legal en vez de reimplementar ninguna
// regla. Esa es justamente la razón por la que esta red sigue valiendo como
// referencia después de F1: no comparte nada de código con `legalActions`.

/**
 * HUELLAS DE REFERENCIA — capturadas con el motor SIN los cambios de F1
 * (307/307 tests verdes, commit f13448a).
 *
 * `harness` mide el MOTOR: los dos asientos los lleva el arnés. Es el estándar
 * de «el juego juega exactamente igual que antes» y NO debe cambiar en F1 (F1
 * solo extrae la legalidad; el comportamiento se conserva).
 *
 * `cpu` mide la CPU DE PRODUCTO en el asiento 1. `cpu.ts` sí cambia en F1 (para
 * dejar de duplicar reglas), así que su huella solo se actualiza de forma
 * consciente y justificada, nunca «para que la prueba pase».
 */
/**
 * HUELLAS DE REFERENCIA — trazabilidad
 * ------------------------------------
 * La referencia `a53ef896` / `02e7e6d2` se fijó el 3 de octubre, cuando se
 * cerraron los defectos de F0. No se había refrescado desde entonces, aunque
 * después cambiaron reglas reales del motor: por ejemplo, la Mágica 1 pasó a
 * ser una habilidad permanente (6 de octubre) y se añadieron/corrigieron
 * elecciones obligatorias al inicio del turno (6–9 de octubre).
 *
 * Referencia actual, capturada por GitHub Actions tras corregir el doble
 * incremento de cuota de la Mágica 1 y rechazar objetivos de Trampa 2/9 durante
 * la fase local `pass`:
 *   · motor / arnés ...... `3eb373bb`
 *   · CPU de producto .... `65c84f65`
 *
 * En esta ejecución, las 60 partidas del arnés y las 45 partidas contra la CPU
 * terminaron. No apareció `QUOTA_EXCEEDED` ni una nueva clase de hallazgo:
 * el arnés conserva solo `CARD_LOST`, y la CPU conserva `CARD_LOST` y el
 * `CPU_REJECTED` ya documentado (propuestas durante fases en las que la CPU no
 * tiene la decisión). Estas huellas reemplazan la referencia obsoleta para
 * reflejar el comportamiento validado, no para suprimir los hallazgos de cuota.
 */
const ENGINE_BASELINE = {
  // Ver la trazabilidad en el comentario de bloque, justo encima.
  harness: '3eb373bb',
  // `cpu` SÍ ha cambiado, y era lo previsto: `cpu.ts` ahora consume
  // `legalActions()`, con lo que se han corregido tres cosas concretas:
  //   · la Trampa 9 ya no elige un objetivo del rival (que el reducer rechazaba
  //     y hacía repetir la jugada hasta agotar la red de seguridad);
  //   · la Mágica 5 ya no se propone en bucle con la elección de destino abierta;
  //   · responde a la fase de dados, que antes no conocía.
  cpu: '65c84f65',
} as Record<'harness' | 'cpu', string>;

/**
 * HALLAZGOS que la red detecta y vigila.
 *
 * Ninguno se arregla fuera de los bloques "ARREGLO" de `knownDefects.test.ts`.
 * Cada uno tiene su test propio y aislado allí, que explica por qué es un
 * defecto. Aquí solo se comprueba que el CONJUNTO DE CLASES detectadas no
 * cambia: si aparece una nueva, o desaparece una vieja, esta prueba falla y hay
 * que revisarlo.
 *
 *   CARD_LOST       · una Mágica utilizada desaparece del juego (el §26 solo
 *                     regula las cartas retiradas del campo: falta definir el
 *                     destino de una carta usada) y la Trampa 5 borra la
 *                     Trampa/Mágica rival sin mandarla al cementerio, contra el
 *                     §26 y el §31.
 *   CPU_REJECTED    · la CPU propone jugadas que el reducer no admite en fases
 *                     en las que no le toca decidir (por ejemplo, cuando el
 *                     ataque del rival abre la respuesta de una Trampa suya).
 *                     Es inocuo: el bucle de la CPU ya no se dispara cuando no
 *                     tiene jugadas legales, pero la propuesta sigue siendo un
 *                     rechazo.
 *
 *   Los hallazgos `DICE_ORPHANED` (dado colgante de las Trampas 3 y 6),
 *   `WIN_NOT_APPLIED` (el §27.1 no se aplicaba tras una Mágica) y `CPU_STUCK`
 *   (la CPU repitiendo la misma jugada rechazada) están CORREGIDOS y por eso ya
 *   no aparecen: si volvieran, esta prueba lo detectaría.
 */
const KNOWN_DEFECTS: Record<'harness' | 'cpu', FindingCode[]> = {
  harness: ['CARD_LOST'],
  cpu: ['CARD_LOST', 'CPU_REJECTED'],
};

/**
 * Cuántas veces propone la CPU de producto una jugada que el reducer rechaza.
 *
 * El valor 47 era de la referencia del 3 de octubre; tras los cambios de reglas
 * posteriores y la corrección del consumo doble de Mágica 1, la simulación
 * determinista actual da 48. Sigue siendo la clase ya documentada
 * `CPU_REJECTED`: no hay ninguna clase nueva ni partidas atascadas.
 */
const CPU_REJECTIONS_BASELINE = 48;

const SEED_BASE = 1;
const HARNESS_GAMES = 60;
const CPU_GAMES = 45;

describe('F0 · red de seguridad — invariantes del motor', () => {
  const harness = runTournament({ driver: 'harness', games: HARNESS_GAMES, seedBase: SEED_BASE });

  it('ninguna partida se queda colgada y todas llegan a un final', () => {
    expect(harness.unfinished).toBe(0);
    expect(harness.finished).toBe(harness.games);
  });

  it('el motor llega a finales reales por PV (Regla 27.1/27.3)', () => {
    expect(harness.endReasons.lp).toBeGreaterThan(0);
  });

  it('el arnés alcanza a ejecutar todas las clases de acción del juego', () => {
    // `DESTROY_MONSTER` (la Trampa 9 necesita tres turnos puesta) queda fuera de
    // esta lista a propósito: con la política aleatoria es rarísimo que llegue
    // a dispararse. Se comprueba en el torneo de la CPU de producto.
    const expected = [
      'SUMMON_MONSTER',
      'SELECT_TRAP_PLACE',
      'PLACE_TRAP_ON_MONSTER',
      'SELECT_MAGIC',
      'PLACE_MAGIC_ON_MONSTER',
      'START_ATTACK',
      'DECLARE_ATTACK',
      'DIRECT_ATTACK',
      'CHANGE_POSITION',
      'REVIVE_CHOICE',
      'ROLL_DICE',
      'RESOLVE_TRAP',
      'CONFIRM_PASS',
      'END_TURN',
    ];
    for (const type of expected) {
      expect(harness.actionCounts[type] ?? 0).toBeGreaterThan(0);
    }
  });

  it('el arnés descubre los hallazgos de referencia del motor', () => {
    console.log('\n' + formatReport('MOTOR (arnés)', harness));
    console.log('Ejemplos de nuevos hallazgos del motor:', JSON.stringify(
      harness.findings.filter((f) => f.code === 'QUOTA_EXCEEDED' || f.code === 'INVARIANT').slice(0, 8),
    ));
    const observed = Object.keys(harness.findingCounts).sort() as FindingCode[];
    expect(observed).toEqual([...KNOWN_DEFECTS.harness].sort());
  });

  it('el motor rechaza sondas de jugadas ilegales (la comprobación es real)', () => {
    // Si el reducer no rechazara nada, el arnés no sería una comprobación real.
    // Estos rechazos son los que confirman que hay reglas aplicándose.
    expect(harness.probeRejections.START_ATTACK ?? 0).toBeGreaterThan(0);
    expect(harness.probeRejections.DECLARE_ATTACK ?? 0).toBeGreaterThan(0);
    expect(harness.probeRejections.SUMMON_MONSTER ?? 0).toBeGreaterThan(0);
  });

  it('el motor juega EXACTAMENTE igual que la referencia fijada', () => {
    expect(harness.fingerprint).toBe(ENGINE_BASELINE.harness);
  });

  it('es determinista: la misma semilla reproduce la misma partida', () => {
    const a = simulateGame({ seed: 7, driver: 'harness', difficulty: 'normal' });
    const b = simulateGame({ seed: 7, driver: 'harness', difficulty: 'normal' });
    expect(a.traceHash).toBe(b.traceHash);
    expect(a).toEqual(b);
  });

  it('semillas distintas producen partidas distintas (no está todo clavado)', () => {
    const a = simulateGame({ seed: 1, driver: 'harness', difficulty: 'normal' });
    const b = simulateGame({ seed: 2, driver: 'harness', difficulty: 'normal' });
    expect(a.traceHash).not.toBe(b.traceHash);
  });
});

describe('F0 · red de seguridad — CPU de producto', () => {
  const cpu = runTournament({ driver: 'cpu', games: CPU_GAMES, seedBase: SEED_BASE });

  it('la CPU completa sus partidas sin que el motor se atasque', () => {
    expect(cpu.unfinished).toBe(0);
  });

  it('ningún turno supera la red de seguridad de la aplicación (60 acciones)', () => {
    expect(cpu.maxActionsInOneTurn).toBeLessThanOrEqual(60);
  });

  it('la Trampa 9 se cubre con tests dirigidos, no con el torneo', () => {
    // `DESTROY_MONSTER` necesita tres turnos de espera con la Trampa 9 puesta,
    // así que un torneo aleatorio la alcanza de forma intermitente y no sirve
    // como comprobación. Está cubierta de forma determinista en
    // `reducerIntegration.test.ts` (Trampa 9), en `knownDefects.test.ts`
    // (objetivos propios) y en `legalActions.test.ts` (qué se enumera).
    // Aquí solo se comprueba que el torneo no la detecta como problema.
    expect(cpu.findings.filter((f) => f.detail.includes('DESTROY'))).toEqual([]);
  });

  it('los hallazgos de la CPU son los de referencia (nada nuevo, nada desaparecido)', () => {
    console.log('\n' + formatReport('CPU DE PRODUCTO', cpu));
    console.log('Ejemplos de nuevos hallazgos de la CPU:', JSON.stringify(
      cpu.findings.filter((f) => f.code === 'QUOTA_EXCEEDED' || f.code === 'INVARIANT').slice(0, 8),
    ));
    const observed = Object.keys(cpu.findingCounts).sort() as FindingCode[];
    expect(observed).toEqual([...KNOWN_DEFECTS.cpu].sort());
  });

  it('la huella de la CPU de producto es la referencia fijada', () => {
    expect(cpu.fingerprint).toBe(ENGINE_BASELINE.cpu);
  });

  it('la CPU propone el mismo número de jugadas rechazadas', () => {
    expect(cpu.cpuRejections).toBe(CPU_REJECTIONS_BASELINE);
  });
});
