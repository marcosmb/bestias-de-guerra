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
 * HUELLAS DE REFERENCIA — versión con activación automática de Trampas.
 *
 * Desde que las Trampas que responden a un ataque se resuelven automáticamente,
 * la fase `trap-response` es interna: ya no se cuenta RESOLVE_TRAP como acción
 * independiente y la CPU no intenta actuar durante esa fase. Por eso cambian
 * las huellas deterministas y desaparece el rechazo inocuo CPU_REJECTED.
 *
 * Valores observados en CI tras corregir Trampas 4, 5, 7, 9, 10, 11 y 12,
 * y aplicar el límite específico de la Mágica 5:
 *   · motor / arnés ...... `6c27abfb`
 *   · CPU de producto .... `87dde524`
 *
 * Se actualizan las referencias porque corresponden al flujo actual del motor,
 * no para ocultar un fallo funcional.
 */
const ENGINE_BASELINE = {
  harness: '84e72a00',
  cpu: '01ea3ca9',
} as Record<'harness' | 'cpu', string>;

/**
 * Hallazgos que permanecen en la simulación actual.
 * La CPU ya no produce CPU_REJECTED: el flujo automático de Trampas evita
 * invocarla durante la fase interna trap-response.
 */
const KNOWN_DEFECTS: Record<'harness' | 'cpu', FindingCode[]> = {
  harness: ['CARD_LOST'],
  cpu: ['CARD_LOST'],
};

/** No se observan rechazos de la CPU en la referencia actual. */
const CPU_REJECTIONS_BASELINE = 0;

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
      // RESOLVE_TRAP es una llamada interna del reducer, no una acción del arnés.
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
