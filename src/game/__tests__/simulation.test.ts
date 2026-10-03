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
const ENGINE_BASELINE = {
  // Capturadas con el motor SIN los cambios de F1.
  // `harness` NO ha cambiado al aplicar F1: esa es la prueba de que extraer la
  // legalidad a `legalActions()` no alteró ni una jugada del juego.
  harness: '10e295f4',
  // `cpu` SÍ ha cambiado, y era lo previsto: `cpu.ts` ahora consume
  // `legalActions()`, con lo que se han corregido dos cosas concretas:
  //   · la Trampa 9 ya no elige un objetivo del rival (que el reducer rechazaba
  //     y hacía repetir la jugada hasta agotar la red de seguridad);
  //   · la Mágica 5 ya no se propone en bucle con la elección de destino abierta.
  // Consecuencia medible: las jugadas rechazadas por el reducer bajan de 110 a
  // 41, y el atasco (`CPU_STUCK`) ha desaparecido por completo.
  cpu: '394399ff',
} as Record<'harness' | 'cpu', string>;

/**
 * HALLAZGOS PREEXISTENTES que la red detecta y vigila.
 *
 * Ninguno se arregla en F0 ni en F1. Cada uno tiene su test propio y aislado en
 * `knownDefects.test.ts`, que explica por qué es un defecto y a qué fase se
 * delega el arreglo. Aquí solo se comprueba que el CONJUNTO DE CLASES
 * detectadas no cambia: si aparece una nueva, o desaparece una vieja, esta
 * prueba falla y hay que revisarlo.
 *
 *   CARD_LOST       · una Mágica utilizada desaparece del juego (el §26 solo
 *                     regula las cartas retiradas del campo: falta definir el
 *                     destino de una carta usada) y la Trampa 5 borra la
 *                     Trampa/Mágica rival sin mandarla al cementerio, contra el
 *                     §26 y el §31.
 *   DICE_ORPHANED   · las Trampas 3 y 6 dejan un dado pendiente en una fase que
 *                     no es la de tirar dados: el juego se bloquea para siempre.
 *   WIN_NOT_APPLIED · el §27.1 dice que llegar a 0 PV pierde la partida al
 *                     instante, pero una Mágica registra el ganador y deja la
 *                     fase en 'playing'.
 *   CPU_REJECTED    · la CPU de producto propone jugadas que el reducer no
 *                     admite. Con F1 bajó de 110 a 41 y el atasco `CPU_STUCK`
 *                     desapareció: eran la Trampa 9 apuntando a un rival y la
 *                     Mágica 5 con la elección abierta.
 */
const KNOWN_DEFECTS: Record<'harness' | 'cpu', FindingCode[]> = {
  harness: ['CARD_LOST', 'DICE_ORPHANED', 'WIN_NOT_APPLIED'],
  cpu: ['CARD_LOST', 'CPU_REJECTED', 'DICE_ORPHANED'],
};

/**
 * Cuántas veces proposes la CPU de producto una jugada que el reducer rechaza.
 *
 * No es un conjunto de clases sino un número, y por eso también es una
 * referencia: si este total cambia, el comportamiento de la CPU ha cambiado.
 * El atasco en sí (la misma jugada rechazada una y otra vez) está demostrado de
 * forma aislada y determinista en `knownDefects.test.ts` (DEFECTO 6); aquí el
 * arnés rescata a la CPU para que la partida pueda seguir, y ese rescate es lo
 * que evita que se acumule un `CPU_STUCK` aquí.
 */
const CPU_REJECTIONS_BASELINE = 41;

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

  it('la Trampa 9 llega a dispararse al menos una vez', () => {
    // Cubre `DESTROY_MONSTER`, que el torneo del arnés no alcanza.
    expect(cpu.actionCounts.DESTROY_MONSTER ?? 0).toBeGreaterThan(0);
  });

  it('los hallazgos de la CPU son los de referencia (nada nuevo, nada desaparecido)', () => {
    console.log('\n' + formatReport('CPU DE PRODUCTO', cpu));
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
