import type { Action, Difficulty, FieldMonster, GameState } from './types';
import {
  canAttack,
  canPlaceTrapOn,
  getEffectiveAtk,
  getEffectiveDef,
  hasOwnCopy,
  magicRequiredSide,
  MAX_HAND_SIZE,
} from './types';
import { canDirectAttack, isLegalAction, legalActions, legalTargets } from './legalActions';
import { reducer } from './useGame';
import type { MagicCard, MonsterCard, TrapCard } from './cardData';

/**
 * Valor máximo de ATQ/DEF posible en el mazo (Monstruo 12).
 * Se usa para asumir el peor caso ante información oculta.
 */
const MAX_MONSTER_VALUE = 12;

/**
 * Asiento que controla la CPU.
 *
 * Sigue siendo el 1: parametrizarlo por asiento es trabajo de la fase F5. Lo que
 * sí se ha hecho en F1 es dejar de reimplementar las reglas de legalidad para
 * conocer las jugadas disponibles: eso ahora lo dice `legalActions()`, la misma
 * fuente que consume la interfaz y que usará el futuro servidor.
 */
/**
 * Asiento que controla la CPU.
 *
 * Sigue siendo el 1: parametrizarlo por asiento es trabajo de la fase F5. Lo que
 * sí se ha hecho en F1 es dejar de reimplementar las reglas de legalidad para
 * conocer las jugadas disponibles: eso ahora lo dice `legalActions()`, la misma
 * fuente que consume la interfaz y que usará el futuro servidor.
 */
const CPU_SEAT: 0 | 1 = 1;

const MAX_CPU_ACTIONS_PER_TURN = 60;
const CONSECUTIVE_IDENTICAL_LIMIT = 3;

let cpuActionCount = 0;
let lastCpuAction: Action | null = null;
let consecutiveIdentical = 0;

/**
 * Configuración por dificultad.
 * Cada nivel cambia SOLO la calidad de decisión, no las reglas.
 */
interface DifficultyConfig {
  depth: number;
  moveOrdering: boolean;
  blunderRate: number;
  label: string;
}

/**
 * Configuración de las 4 dificultades.
 * La calidad de decisión aumenta con cada nivel, no el tiempo de espera.
 */
const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy:    { depth: 0, moveOrdering: false, blunderRate: 0.30, label: 'Fácil' },
  normal:  { depth: 1, moveOrdering: false, blunderRate: 0.00, label: 'Normal' },
  hard:    { depth: 2, moveOrdering: true,  blunderRate: 0.00, label: 'Difícil' },
  expert:  { depth: 3, moveOrdering: true,  blunderRate: 0.00, label: 'Experto' },
};

/**
 * Evalúa el estado desde la perspectiva de la CPU (jugador 1).
 * Valor > 0 = ventaja para la CPU, < 0 = ventaja para el humano.
 *
 * Componentes:
 * 1. Diferencial de LP (peso 1.0)
 * 2. Ventaja en campo (ATQ/DEF efectivos, peso 0.8)
 * 3. Ventaja en cartas (mano + cementerio, peso 0.5)
 * 4. Tempo: monstruos en Ataque listos para atacar (peso 0.6)
 * 5. Amenazas: monstruos rivales que ganan en combate (peso 0.7)
 * 6. Protecciones activas (dado, Trampas, Mágicas, peso 0.4)
 * 7. Cuota restante (peso 0.3)
 */
function evaluate(state: GameState): number {
  const cpu = state.players[CPU_SEAT];
  const human = state.players[CPU_SEAT === 0 ? 1 : 0];

  let score = 0;
  score += (cpu.lp - human.lp) * 1.0;

  const cpuField = monstersOf(cpu);
  const humanField = monstersOf(state.players[CPU_SEAT === 0 ? 1 : 0]);

  let cpuFieldPower = 0;
  let humanFieldPower = 0;

  for (const fm of cpuField) {
    const atk = getEffectiveAtk(fm);
    const def = getEffectiveDef(fm);
    const mult = fm.position === 'attack' ? 1.2 : 1.0;
    cpuFieldPower += (atk + def) * mult;
    if (fm.magic) cpuFieldPower += 3;
    if (fm.trap) cpuFieldPower += 2;
    if (fm.diceProtection) cpuFieldPower += 5;
  }

  for (const fm of humanField) {
    const atk = getEffectiveAtk(fm);
    const def = getEffectiveDef(fm);
    const mult = fm.position === 'attack' ? 1.2 : 1.0;
    humanFieldPower += (atk + def) * mult;
    if (fm.magic) humanFieldPower += 3;
    if (fm.trap) humanFieldPower += 2;
    if (fm.diceProtection) humanFieldPower += 5;
  }

  score += (cpuFieldPower - humanFieldPower) * 0.8;

  const cpuCards = cpu.hand.length + cpu.graveyard.length * 0.3;
  const humanCards = human.hand.length + human.graveyard.length * 0.3;
  score += (cpuCards - humanCards) * 0.5;

  const cpuReadyAttackers = cpuField.filter(f => f.position === 'attack' && !f.hasAttacked).length;
  const humanReadyAttackers = humanField.filter(f => f.position === 'attack' && !f.hasAttacked).length;
  score += (cpuReadyAttackers - humanReadyAttackers) * 0.6;

  let threatScore = 0;
  for (const hfm of humanField) {
    const hAtk = hfm.position === 'attack' ? getEffectiveAtk(hfm) : getEffectiveDef(hfm);
    for (const cfm of cpuField) {
      const cDef = cfm.position === 'attack' ? getEffectiveAtk(cfm) : getEffectiveDef(cfm);
      if (hAtk > cDef) { threatScore += 1; break; }
    }
  }
  score -= threatScore * 0.7;

  const cpuProtections = cpuField.filter(f => f.diceProtection || f.magic || f.trap).length;
  score += cpuProtections * 0.4;

  const cpuQuotaLeft = 3 - cpu.cardsPlayedThisTurn;
  score += cpuQuotaLeft * 0.3;

  return score;
}

/**
 * Búsqueda minimax con poda alfa-beta.
 * La CPU es MAX (quiere maximizar evaluate), el humano es MIN.
 */
interface SearchResult {
  score: number;
  bestAction: Action | null;
}

function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean,
  config: { depth: number; moveOrdering: boolean }
): { score: number; bestAction: Action | null } {
  const actingPlayer = maximizingPlayer ? CPU_SEAT : (CPU_SEAT === 0 ? 1 : 0);
  const legal = legalActions(state, actingPlayer);

  if (legal.length === 0 || depth === 0 || state.phase === 'game-over') {
    return { score: evaluate(state), bestAction: null };
  }

  let orderedLegal = legal;
  if (config.moveOrdering && depth > 1) {
    orderedLegal = orderMoves(state, legal, maximizingPlayer);
  }

  if (maximizingPlayer) {
    let maxScore = -Infinity;
    let bestAction: Action | null = null;
    for (const action of orderedLegal) {
      const nextState = reducer(state, action);
      const result = search(nextState, depth - 1, alpha, beta, false, config);
      if (result.score > maxScore) { maxScore = result.score; bestAction = action; }
      alpha = Math.max(alpha, maxScore);
      if (beta <= alpha) break;
    }
    return { score: maxScore, bestAction };
  } else {
    let minScore = Infinity;
    let bestAction: Action | null = null;
    for (const action of orderedLegal) {
      const nextState = reducer(state, action);
      const result = search(nextState, depth - 1, alpha, beta, true, config);
      if (result.score < minScore) { minScore = result.score; bestAction = action; }
      beta = Math.min(beta, minScore);
      if (beta <= alpha) break;
    }
    return { score: minScore, bestAction };
  }
}

function orderMoves(state: GameState, actions: Action[], maximizingPlayer: boolean): Action[] {
  const scored = actions.map(action => {
    const nextState = reducer(state, action);
    const evalScore = evaluate(nextState);
    return { action, score: maximizingPlayer ? evalScore : -evalScore };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.action);
}

/**
 * Información oculta (§9 y §13.2 del reglamento).
 *
 * Un monstruo rival en Defensa boca abajo NO es identificable por el rival: no se
 * conoce ni su nombre ni sus valores reales. Para no aprovechar información que un
 * jugador real no tendría, se asume el valor MÁXIMO posible del mazo (peor caso
 * para quien decide atacar).
 *
 * Nota: esta es una convención del código, no una garantía. En cuanto la CPU
 * tenga búsqueda (F6) hará falta la vista filtrada de la FASE F4, que es la
 * que impone la información oculta de verdad.
 */
function isHiddenFromOpponent(fm: FieldMonster): boolean {
  return fm.position === 'defense' && fm.faceDown;
}

function opponentAssumedAtk(fm: FieldMonster): number {
  return isHiddenFromOpponent(fm) ? MAX_MONSTER_VALUE : getEffectiveAtk(fm);
}

function opponentAssumedDef(fm: FieldMonster): number {
  return isHiddenFromOpponent(fm) ? MAX_MONSTER_VALUE : getEffectiveDef(fm);
}

function monstersOf(player: { field: (FieldMonster | null)[] }): FieldMonster[] {
  return player.field.filter((slot): slot is FieldMonster => slot !== null);
}

/**
 * Monstruos propios que pueden atacar (Regla 21 y Regla 17).
 *
 * Delega en `legalActions`: si la acción `START_ATTACK` no es legal, ese
 * Monstruo no puede atacar. Así la CPU no reimplementa la comprobación.
 */
function availableAttackers(state: GameState, legal: Action[]): FieldMonster[] {
  const cpu = state.players[CPU_SEAT];
  return monstersOf(cpu).filter((fm) =>
    legal.some((a) => a.type === 'START_ATTACK' && a.attackerUid === fm.uid),
  );
}

/** Monstruos propios que pueden recibir una Trampa (Regla 19). */
function trapTargets(state: GameState): FieldMonster[] {
  const cpu = state.players[CPU_SEAT];
  return monstersOf(cpu).filter((fm) => canPlaceTrapOn(cpu, fm.uid));
}

/** Elige la posición de invocación según dificultad. */
function chooseSummonPosition(monster: MonsterCard, difficulty: Difficulty, humanDefenders: FieldMonster[]): 'attack' | 'defense' {
  if (difficulty === 'easy') return 'attack';

  if (difficulty === 'normal') {
    // Monstruos con ATQ >= 4 pueden atacar; el resto se protege.
    return monster.atk >= 4 ? 'attack' : 'defense';
  }

  // hard: valora el estado real del campo rival, sin usar información oculta.
  const pressure = humanDefenders.length;
  if (monster.atk >= 6) return 'attack';
  if (monster.atk <= 3 && pressure >= 3) return 'defense';
  return monster.atk >= monster.def ? 'attack' : 'defense';
}

/** Elige qué Monstruo invocar de la mano. */
function chooseSummonCandidate(hand: MonsterCard[], difficulty: Difficulty): MonsterCard | null {
  if (hand.length === 0) return null;
  if (difficulty === 'easy') return hand[0];
  return [...hand].sort((a, b) => b.atk - a.atk)[0];
}

/**
 * Completa una selección de Trampa, Mágica o destrucción pendiente.
 *
 * Las jugadas que puede proponer salen de `legalActions()`: si el juego tiene
 * abierta una elección, ahí están todas las formas de terminarla, y solo
 * escollendo entre ellas es imposible proponer algo ilegal.
 */
function completePendingSelection(state: GameState, legal: Action[]): Action | null {
  const sel = state.selection;
  if (sel.kind === 'none') return null;

  const completing = legal.filter((a) => a.type !== 'CANCEL_SELECTION' && a.type !== 'END_TURN');
  if (completing.length === 0) return { type: 'CANCEL_SELECTION' };

  switch (sel.kind) {
    case 'place-trap': {
      // Regla 19: primera casilla propia sin Trampa.
      const primera = completing[0];
      return primera;
    }

    case 'place-magic':
    case 'magic-target-monster': {
      if (magicRequiredSide(sel.card) === 'enemy') {
        // Mágica 8: va sobre un Monstruo rival (Regla 5).
        return completing[0];
      }
      // Mágicas de campo propias: la Mágica 4 rinde más sobre el ATQ más alto.
      const sobreAtk = completing
        .filter((a) => a.type === 'PLACE_MAGIC_ON_MONSTER' || a.type === 'MAGIC_TARGET_MONSTER')
        .sort((a, b) => valorDeObjetivo(state, b) - valorDeObjetivo(state, a))[0];
      return sobreAtk ?? completing[0];
    }

    case 'choose-destroy-target': {
      // Trampa 9: destruir el Monstruo más fuerte. Solo se consideran los
      // objetivos que `legalActions` ofrece (que son los PROPIOS: el reducer no
      // acepta uno del rival, DEFECTO 7 en `knownDefects.test.ts`).
      return completing.sort((a, b) => valorDeObjetivo(state, b) - valorDeObjetivo(state, a))[0];
    }

    case 'revive-choice': {
      // Mágica 5: recuperar del cementerio. Al campo es mejor que a la mano.
      const alCampo = completing.find((a) => a.type === 'REVIVE_CHOICE' && a.choice === 'field');
      return alCampo ?? completing[0];
    }

    case 'attack':
    case 'attack-or-direct':
    case 'direct-attack': {
      // La CPU actual decide sus ataques en un solo paso, así que no abre esta
      // clase de selección. Si llegara aquí, se acepta la primera propuesta.
      return completing[0];
    }
  }
}

/** Valor de combate de la casilla a la que apunta una acción (para ordenar objetivos). */
function valorDeObjetivo(state: GameState, action: Action): number {
  if (!('fieldUid' in action)) return 0;
  const uid = action.fieldUid;
  for (const p of state.players) {
    const fm = p.field.find((f) => f?.uid === uid);
    if (fm) return fm.position === 'attack' ? getEffectiveAtk(fm) : getEffectiveDef(fm);
  }
  return 0;
}

/** Mágicas resolubles al instante que la CPU tiene sentido de usar ahora. */
function chooseInstantMagic(state: GameState, legal: Action[]): Action | null {
  const cpu = state.players[CPU_SEAT];
  const human = state.players[CPU_SEAT === 0 ? 1 : 0];
  const magics = cpu.hand.filter((c): c is MagicCard => c.type === 'magic');

  for (const magic of magics) {
    // La legalidad de la Mágica la dice `legalActions` (que usa `canActivateMagic`).
    const seleccion = legal.find(
      (a): a is Extract<Action, { type: 'SELECT_MAGIC' }> => a.type === 'SELECT_MAGIC' && a.card === magic,
    );
    if (!seleccion) continue;

    switch (magic.effect.kind) {
      case 'direct_attack': {
        // Solo tiene sentido si hay un atacante disponible y no hay monstruos en Defensa.
        const defenders = monstersOf(human);
        if (!canDirectAttack(defenders)) break;
        if (availableAttackers(state, legal).length > 0) return seleccion;
        break;
      }
      case 'draw_cards': {
        // Robar solo aporta si no está al límite de mano.
        if (cpu.hand.length < MAX_HAND_SIZE) return seleccion;
        break;
      }
      case 'revive_monster': {
        // La Mágica 5 solo se usa si hay un Monstruo en el cementerio Y hay
        // salida real: hueco en el campo, o hueco en la mano con alguna carta
        // que aún no sea una copia propia (la del RIVAL no lo impide, Mágica 2).
        const difuntos = cpu.graveyard.filter((c) => c.type === 'monster');
        if (difuntos.length === 0) break;
        const alCampo = trapTargets(state).length < 6;
        const aLaMano =
          cpu.hand.length < MAX_HAND_SIZE && difuntos.some((c) => !hasOwnCopy(cpu.hand, c));
        if (alCampo || aLaMano) return seleccion;
        break;
      }
      case 'destroy_all_field': {
        // Solo si realmente hay cartas en el campo que destruir.
        if (monstersOf(cpu).length > 0 || monstersOf(human).length > 0) return seleccion;
        break;
      }
      case 'clean_opp_field': {
        if (monstersOf(human).length > 0) return seleccion;
        break;
      }
      case 'switch_all_opp_position': {
        if (monstersOf(human).length > 0) return seleccion;
        break;
      }
      case 'steal_hand_card': {
        // Solo si hay alguna carta del rival que la CPU no tenga ya en la mano.
        const puedeRobarNuevo = human.hand.some((c) => !cpu.hand.some((h) => h.id === c.id));
        if (puedeRobarNuevo && cpu.hand.length < MAX_HAND_SIZE) return seleccion;
        break;
      }
      case 'hand_swap':
      case 'dice_damage': {
        return seleccion;
      }
      default:
        break;
    }
  }

  return null;
}

/**
 * Mágicas que necesitan elegir un Monstruo propio o rival.
 *
 * De qué lado va la Mágica no lo decide la CPU: lo dice `magicRequiredSide`, que
 * es la MISMA función que usa el reducer y que implementa la Regla 5 (M4 y M9
 * propias, M8 rival).
 */
function chooseTargetedMagic(state: GameState, legal: Action[]): Action | null {
  const cpu = state.players[CPU_SEAT];
  const human = state.players[CPU_SEAT === 0 ? 1 : 0];
  const magics = cpu.hand.filter((c): c is MagicCard => c.type === 'magic');

  for (const magic of magics) {
    const seleccion = legal.find(
      (a): a is Extract<Action, { type: 'SELECT_MAGIC' }> => a.type === 'SELECT_MAGIC' && a.card === magic,
    );
    if (!seleccion) continue;

    const lado = magicRequiredSide(magic);
    if (lado === 'self') {
      // No tiene sentido colocar una Mágica sobre un monstruo que nunca atacará.
      const hayAtacante = monstersOf(cpu).some((f) => f.position === 'attack');
      if (hayAtacante) return seleccion;
      continue;
    }
    if (lado === 'enemy') {
      // Mágica 8 (-2 DEF): útil sobre un monstruo rival que vaya a atacar.
      const atacantesRivales = monstersOf(human).filter((f) => f.position === 'attack' && f.magic === null);
      if (atacantesRivales.length > 0) return seleccion;
      continue;
    }
  }

  return null;
}

/** Elige la Trampa que colocar, si hay alguna útil. */
function chooseTrapToPlace(state: GameState, legal: Action[]): Action | null {
  const cpu = state.players[CPU_SEAT];
  if (trapTargets(state).length === 0) return null;
  const traps = cpu.hand.filter((c): c is TrapCard => c.type === 'trap');
  // Easy es coherente consigo mismo: la primera Trampa de la mano.
  const elegida = traps[0];
  if (!elegida) return null;
  const seleccion = legal.find(
    (a): a is Extract<Action, { type: 'SELECT_TRAP_PLACE' }> => a.type === 'SELECT_TRAP_PLACE' && a.card === elegida,
  );
  return seleccion ?? null;
}

/**
 * Decide el siguiente ataque respetando la Regla 22.
 *
 * Los objetivos salen de `legalTargets`, que es la misma función que usa
 * `legalActions`. La diferencia es que aquí la CPU solo eluye: entre todos los
 * objetivos legales elige el que le convenga según su dificultad.
 */
function chooseAttack(state: GameState, legal: Action[]): Action | null {
  const human = state.players[CPU_SEAT === 0 ? 1 : 0];
  if (!canAttack(state)) return null;

  const attackers = availableAttackers(state, legal);
  if (attackers.length === 0) return null;

  const defenders = monstersOf(human);
  const targets = legalTargets(defenders);
  const directAllowed = canDirectAttack(defenders);
  const directa = (attacker: FieldMonster): Action =>
    ({ type: 'DIRECT_ATTACK', attackerUid: attacker.uid });
  const declaro = (attacker: FieldMonster, objetivo: FieldMonster): Action =>
    ({ type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: objetivo.uid });

  for (const attacker of attackers) {
    const atk = getEffectiveAtk(attacker);

    // Sin monstruos rivales → ataque directo (Regla 22.3).
    if (defenders.length === 0) {
      return directa(attacker);
    }

    // Prioriza destruir objetivos que puede batir realmente.
    const lethal = targets.find((t) => {
      const targetValue = t.position === 'attack' ? opponentAssumedAtk(t) : opponentAssumedDef(t);
      return targetValue < atk;
    });

    if (lethal) {
      return declaro(attacker, lethal);
    }

    // Regla 22.1: si hay monstruos en Defensa, atacar a esos es obligatorio.
    // Se elige al más débil (el más fácil de abatir).
    if (targets.some((t) => t.position === 'defense')) {
      if (state.difficulty === 'easy') {
        // easy no se sacrifica un monstruo sin ventaja clara.
        continue;
      }
      const weakest = [...targets].sort((a, b) => {
        const av = a.position === 'attack' ? opponentAssumedAtk(a) : opponentAssumedDef(a);
        const bv = b.position === 'attack' ? opponentAssumedAtk(b) : opponentAssumedDef(b);
        return av - bv;
      })[0];
      return declaro(attacker, weakest);
    }

    // Regla 22.2: sin monstruos en Defensa → puede atacar a un Ataque o hacer directo.
    const beatable = targets.find((t) => opponentAssumedAtk(t) < atk);
    if (beatable) {
      return declaro(attacker, beatable);
    }

    // easy no hace ataques directos suicidas; hard/normal aprovechan el ATQ.
    if (directAllowed && state.difficulty !== 'easy') {
      return directa(attacker);
    }
  }

  return null;
}

/**
 * Cambio de posición legal (Regla 14: una vez por Monstruo y turno, y sin
 * consumir ninguna de las 3 cartas del turno).
 */
function choosePositionChange(state: GameState, legal: Action[]): Action | null {
  if (state.difficulty === 'easy') return null;

  const cambioLegal = new Set(legal.filter((a) => a.type === 'CHANGE_POSITION').map((a) => (a as { fieldUid: string }).fieldUid));
  const candidates = monstersOf(state.players[CPU_SEAT]).filter(
    (f) => !f.hasChangedPosition && cambioLegal.has(f.uid),
  );

  // 1) Un monstruo que ya atacó pasa a Defensa para protegerse.
  const afterAttack = candidates.find((f) => f.position === 'attack' && f.hasAttacked);
  if (afterAttack) {
    return { type: 'CHANGE_POSITION', fieldUid: afterAttack.uid };
  }

  // 2) Un monstruo fuerte en Defensa pasa a Ataque para presionar.
  const defenders = candidates.filter((f) => f.position === 'defense');
  if (defenders.length > 0) {
    const best = [...defenders].sort((a, b) => getEffectiveDef(b) - getEffectiveDef(a))[0];
    if (getEffectiveDef(best) >= 6) {
      return { type: 'CHANGE_POSITION', fieldUid: best.uid };
    }
  }

  return null;
}

/**
 * Cara que la CPU tira cuando hay un dado pendiente.
 *
 * Determinista y repartida: tirar siempre la misma cara haría el juego
 * predecible, pero tampoco hay motivo para usar azar (y `nextCpuAction` es pura).
 * Se reparte contando la situation del tablero: los dados de la Trampa 3 cuentan
 * casillas, los de la Trampa 6 umbralizan y los de la Mágica 11 hacen daño, así
 * que todas las caras sirven igual de bien.
 *
 * Nota: elegir la cara por VALOR ESPERADO (la Mágica 9, la Trampa 3) es trabajo
 * de la fase de búsqueda (F6). Aquí solo hay que responder a la fase.
 */
function caraDelDado(state: GameState): number {
  const monstruos = state.players[0].field.filter(Boolean).length + state.players[1].field.filter(Boolean).length;
  const trampas =
    state.players[0].field.filter((f) => f?.trap).length + state.players[1].field.filter((f) => f?.trap).length;
  const propias = state.players[CPU_SEAT].field.filter((f) => f !== null).length;
  return ((state.turnCount + monstruos + trampas + propias) % 6) + 1;
}

/**
 * Devuelve la siguiente acción del CPU.
 *
 * Garantiza siempre una salida segura: si no hay ninguna acción legal
 * disponible, devuelve END_TURN. Esto evita bucles y turnos congelados.
 *
 * Todas las decisiones se apoyan en `legalActions(state, 1)`, la fuente única de
 * legalidad. La dificultad sigue decidiendo PREFERENCIAS (qué Monstruo invocar,
 * a quién atacar, si forego un cambio de posición), nunca qué es legal.
 */
export function nextCpuAction(state: GameState): Action {
  const legal = legalActions(state, CPU_SEAT);

  // 0) Hay un dado pendiente (Trampas 3 y 6, Mágica 11): hay que lanzarlo.
  //
  //    Antes esto no existía, y al arreglar el dado colgado de las Trampas 3 y 6
  //    la CPU se quedaba igual de congelada: proponía END_TURN, el reducer lo
  //    rechazaba por la fase y la partida esperaba un dado que nadie tiraba. No
  //    es «más inteligencia»: es responder a la única jugada que existe.
  if (state.phase === 'dice-roll') {
    const tirada = legal.find((a): a is Extract<Action, { type: 'ROLL_DICE' }> => a.type === 'ROLL_DICE');
    if (tirada) return { ...tirada, roll: caraDelDado(state) };
  }

  // Cualquier propuesta se acepta solo si `legalActions` la considera legal.
  // Es la red de seguridad que garantiza el principio «la CPU nunca juega algo
  // ilegal», y sustituye a los `if` sueltos que antes comprobaban reglas a mano.
  const siLegal = (accion: Action | null): Action | null =>
    accion !== null && isLegalAction(state, CPU_SEAT, accion) ? accion : null;

  // 1) Si hay una selección pendiente, completarla primero. Con una elección
  //    abierta el juego no admite otras jugadas, así que esta respuesta es la
  //    única posible.
  if (state.selection.kind !== 'none') {
    return completePendingSelection(state, legal) ?? { type: 'END_TURN' };
  }

  // 2) Magias resolubles al instante.
  const instantanea = siLegal(chooseInstantMagic(state, legal));
  if (instantanea) return instantanea;

  // 3) Magicas que necesitan objetivo propio o rival.
  const conObjetivo = siLegal(chooseTargetedMagic(state, legal));
  if (conObjetivo) return conObjetivo;

  // 4) Invocar Monstruos mientras queden espacios y cartas.
  const summon = siLegal(chooseSummon(state));
  if (summon) return summon;

  // 5) Colocar Trampas sobre monstruos propios sin Trampa.
  const trampa = siLegal(chooseTrapToPlace(state, legal));
  if (trampa) return trampa;

  // 6) Atacar.
  const ataque = siLegal(chooseAttack(state, legal));
  if (ataque) return ataque;

  // 7) Cambios de posición legales.
  const cambio = siLegal(choosePositionChange(state, legal));
  if (cambio) return cambio;

  // 8) Salida segura: finalizar el turno.
  return { type: 'END_TURN' };
}

/** Elige la jugada de invocar, si la mano y el campo lo permiten. */
function chooseSummon(state: GameState): Action | null {
  const cpu = state.players[CPU_SEAT];
  const human = state.players[CPU_SEAT === 0 ? 1 : 0];
  const monsters = cpu.hand.filter((c): c is MonsterCard => c.type === 'monster');
  const candidate = chooseSummonCandidate(monsters, state.difficulty);
  if (!candidate) return null;
  const position = chooseSummonPosition(candidate, state.difficulty, monstersOf(human));
  return {
    type: 'SUMMON_MONSTER',
    card: candidate,
    position,
  };
}

/**
 * Retardo entre acciones del CPU.
 * Suficientemente pausado para ser legible, sin ralentizar la partida.
 */
export function cpuDelay(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 450 : difficulty === 'hard' ? 850 : 650;
}
