import type {
  Action,
  FieldMonster,
  GameState,
  PlayerState,
  Position,
} from './types';
import {
  MAX_CARDS_PER_TURN,
  MAX_HAND_SIZE,
  canActivateMagic,
  canAttack,
  canPlaceTrapOn,
  hasEmptySlot,
  hasOwnCopy,
  hasTrapTarget,
  magicRequiredSide,
} from './types';
import type { MagicCard } from './cardData';

/**
 * ============================================================================
 * F1 — GENERADOR ÚNICO DE ACCIONES LEGALES
 * ============================================================================
 *
 * QUÉ ES
 * ------
 * `legalActions(state, player)` devuelve TODAS las acciones que el jugador
 * `player` puede ejecutar legalmente en este estado, y solo esas. Es la fuente
 * ÚNICA de legalidad de la que dependen:
 *
 *   · la CPU          — para saber qué puede hacer (F5 hará que además sepa
 *                        cuál le conviene mejor);
 *   · la interfaz     — para decidir qué botones y qué casillas se resaltan;
 *   · el servidor     — para validar lo que le llega de un cliente (F9).
 *
 * PRINCIPIO FUNDAMENTAL
 * ---------------------
 *   Si `legalActions()` devuelve una acción, esa acción es legal Y el reducer
 *   puede ejecutarla. Nunca devuelve una acción imposible.
 *
 * La red de seguridad de F0 lo comprueba de forma independiente: el arnés de
 * simulación (`src/game/__tests__/support/simulation.ts`) genera todas las
 * acciones que un jugador PODRÍA intentar y consulta al reducer cuál de ellas
 * produce un cambio real. Como no comparte ni una línea de código con este
 * fichero, ambos tienen que coincidir de verdad. Y si en el futuro divergen, la
 * red lo delata.
 *
 * QUÉ NO ENUMERA (a propósito, y por qué)
 * ---------------------------------------
 * · Acciones de METAJUEGO: `START_GAME`, `RESTART`, `CPU_PLAY` y `CONFIRM_START`
 *   no son jugadas de un jugador dentro de una partida, sino botones del menú.
 *
 * · Atajos de UN SOLO PASO que se saltan la cuota: `PLACE_TRAP_ON_MONSTER`,
 *   `PLACE_MAGIC_ON_MONSTER`, `MAGIC_TARGET_MONSTER` y `MAGIC_INSTANT` solo se
 *   generan cuando el juego ya ha abierto la selección correspondiente, es decir,
 *   como SEGUNDO paso. El reducer los admite también directamente y en ese
 *   camino NO consulta la cuota de 3 cartas por turno (Regla 16) — es un hueco
 *   de validación documentado en `knownDefects.test.ts` (DEFECTO 1) que
 *   corresponde a F3. Forzar siempre el camino de dos pasos es lo que mantiene
 *   esta función honesta: nunca devuelve una jugada que se salte una regla.
 *
 *   El ataque NO es una excepción: `DECLARE_ATTACK` y `DIRECT_ATTACK` sí se
 *   generan directamente, porque son legales y son el camino que usa la CPU.
 *   Lo que no se hace es omitir sus comprobaciones (ver más abajo).
 *
 * · Valores arbitrarios: `ROLL_DICE` solo devuelve las seis caras de un dado de
 *   6. El reducer no valida el número recibido (DEFECTO 9 en
 *   `knownDefects.test.ts`), pero una fuente de legalidad no puede Barrer el
 *   rango completo.
 *
 * LO QUE ESTÁ FUERA DE ALCANCE (F3)
 * ---------------------------------
 * Este fichero NO valida acciones arbitrarias: solo genera las legales. La
 * separación `isLegal(state, action)` / `applyAction(state, action)`, que hace
 * falta para un servidor autoritativo, es trabajo de F3.
 *
 * DEFICIENCIA DOCUMENTADA — `DECLARE_ATTACK`
 * -----------------------------------------
 * Hoy el caso `DECLARE_ATTACK` del reducer comprueba solo que existan atacante y
 * defensor, y que se respete la Regla 22. NO comprueba:
 *
 *   · que el atacante esté en posición de Ataque;
 *   · que el atacante no haya atacado ya este turno;
 *   · la Regla 17 (el primer turno del jugador que empieza no ataca);
 *   · que la acción venga de una selección abierta y no sea una invocación suelta.
 *
 * Por eso `legalActions()` sí aplica esas tres comprobaciones al GENERAR un
 * `DECLARE_ATTACK`: aunque el reducer lo admita, esta función no lo emite nunca.
 * Cerrar el hueco en el reducer es F3; el test que fija el comportamiento actual
 * está en `knownDefects.test.ts` (DEFECTO 8).
 */

/** Posiciones en las que se puede invocar un Monstruo. */
const POSITIONS: readonly Position[] = ['attack', 'defense'];

/** Las seis caras de un dado de 6. */
const DICE_FACES: readonly number[] = [1, 2, 3, 4, 5, 6];

// ============================================================================
// REGLAS 22 y 23 — ELECCIÓN DEL OBJETIVO DE ATAQUE
// ============================================================================

/**
 * Regla 22 — Un ataque a Monstruo puede elegir CUALQUIER Monstruo rival,
 * independientemente de que esté en Ataque o en Defensa.
 *
 * El único requisito de posición adicional afecta al ataque directo:
 * mientras exista un Monstruo rival en Defensa, no hay ataque directo salvo
 * que el Monstruo atacante tenga una Mágica 1 asociada.
 */
export function legalTargets(defenders: FieldMonster[]): FieldMonster[] {
  return defenders;
}

/**
 * Regla 22 — El ataque directo solo se bloquea por Monstruos rivales en Defensa,
 * salvo la excepción de la Mágica 1. Tener Monstruos rivales en Ataque NO bloquea
 * el ataque directo.
 */
export function canDirectAttack(defenders: FieldMonster[]): boolean {
  return defenders.every((f) => f.position !== 'defense');
}

// ============================================================================
// AYUDANTES
// ============================================================================

function monstersOf(player: PlayerState): FieldMonster[] {
  return player.field.filter((f): f is FieldMonster => f !== null);
}

function opponentOf(state: GameState, player: 0 | 1): PlayerState {
  return state.players[player === 0 ? 1 : 0];
}

/**
 * Regla 21 + Regla 17 — ¿Puede ESTE Monstruo atacar ahora mismo?
 *
 * El reducer sí comprueba estas tres cosas al iniciar un ataque
 * (`START_ATTACK`), pero no al declararlo (`DECLARE_ATTACK`). Aquí se aplican
 * siempre. Ver la nota sobre `DECLARE_ATTACK` al principio del fichero.
 */
export function isLegalAttacker(state: GameState, player: 0 | 1, attacker: FieldMonster | undefined): boolean {
  if (!attacker) return false;
  if (!canAttack(state)) return false;
  return attacker.position === 'attack' && !attacker.hasAttacked;
}

/**
 * Regla 5 — Monstruos que pueden recibir una Mágica de campo.
 *
 *   · `side === 'self'`  → solo propios (Mágicas 4 y 9).
 *   · `side === 'enemy'` → solo rivales (Mágica 8, la excepción).
 *   · `side === null`    → cualquiera.
 *
 * En todos los casos el Monstruo no puede llevar ya una Mágica (máximo 1).
 */
export function magicTargets(magic: MagicCard, me: PlayerState, opp: PlayerState): FieldMonster[] {
  const side = magicRequiredSide(magic);
  if (side === 'self') return monstersOf(me).filter((f) => f.magic === null);
  if (side === 'enemy') return monstersOf(opp).filter((f) => f.magic === null);
  return [...monstersOf(me).filter((f) => f.magic === null), ...monstersOf(opp).filter((f) => f.magic === null)];
}

// ============================================================================
// PASOS DE SELECCIÓN PENDIENTE
// ============================================================================

/**
 * Acciones que completan la selección pendiente, o `null` si no hay ninguna.
 *
 * Cuando hay una selección abierta el juego NO admite jugadas nuevas: lo único
 * legal es terminarla (o cancelarla, si la interfaz lo ofrece). Por eso aquí no
 * se generan Monstruos, ataques ni cambios de posición aunque el jugador pueda
 * hacerlos: hacerlo no sería legal.
 */
function selectionActions(state: GameState, player: 0 | 1, me: PlayerState, opp: PlayerState): Action[] | null {
  const sel = state.selection;

  switch (sel.kind) {
    case 'none':
      return null;

    case 'place-trap': {
      // Regla 19: la Trampa va sobre un Monstruo PROPIO que no tenga ya otra.
      return monstersOf(me)
        .filter((fm) => canPlaceTrapOn(me, fm.uid))
        .map((fm) => ({ type: 'PLACE_TRAP_ON_MONSTER', card: sel.card, fieldUid: fm.uid }));
    }

    case 'place-magic':
    case 'magic-target-monster': {
      // Regla 5: la Mágica va al lado que exige su efecto (M4/M9 propias,
      // M8 rival) y solo sobre un Monstruo sin Mágica asociada.
      const side = magicRequiredSide(sel.card) ?? 'self';
      return magicTargets(sel.card, me, opp).map((fm) =>
        sel.kind === 'place-magic'
          ? { type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side, fieldUid: fm.uid }
          : { type: 'MAGIC_TARGET_MONSTER', card: sel.card, side, fieldUid: fm.uid },
      );
    }

    case 'attack': {
      const attacker = monstersOf(me).find((f) => f.uid === sel.attackerUid);
      if (!isLegalAttacker(state, player, attacker)) return [];

      if (attacker?.magic?.effect.kind === 'direct_attack') {
        return [
          ...monstersOf(opp).map((target) => ({
            type: 'DECLARE_ATTACK' as const,
            attackerUid: sel.attackerUid,
            defenderUid: target.uid,
          })),
          { type: 'DIRECT_ATTACK' as const, attackerUid: sel.attackerUid },
        ];
      }

      return legalTargets(monstersOf(opp)).map((target) => ({
        type: 'DECLARE_ATTACK',
        attackerUid: sel.attackerUid,
        defenderUid: target.uid,
      }));
    }

    case 'attack-or-direct': {
      const attacker = monstersOf(me).find((f) => f.uid === sel.attackerUid);
      if (!isLegalAttacker(state, player, attacker)) return [];

      const targets = attacker?.magic?.effect.kind === 'direct_attack'
        ? monstersOf(opp)
        : legalTargets(monstersOf(opp));

      const out: Action[] = targets.map((target) => ({
        type: 'DECLARE_ATTACK',
        attackerUid: sel.attackerUid,
        defenderUid: target.uid,
      }));

      if (attacker?.magic?.effect.kind === 'direct_attack' || canDirectAttack(monstersOf(opp))) {
        out.push({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid });
      }
      return out;
    }

    case 'choose-destroy-target': {
      // Trampa 9: el propietario elige cualquier Monstruo del adversario.
      return monstersOf(opp).map((fm) => ({ type: 'DESTROY_MONSTER', fieldUid: fm.uid }));
    }
    
    case 'choose-destroy-associated-card': {
      const owner = sel.player;
      const field = monstersOf(state.players[owner]);
      return field
        .filter((fm) => fm.trap || fm.magic)
        .flatMap((fm) => [
          ...(fm.trap ? [{ type: 'DESTROY_ASSOCIATED_CARD' as const, fieldUid: fm.uid, cardType: 'trap' as const }] : []),
          ...(fm.magic ? [{ type: 'DESTROY_ASSOCIATED_CARD' as const, fieldUid: fm.uid, cardType: 'magic' as const }] : []),
        ]);
    }

    case 'choose-trap-2-own': {
      // Trampa 2: el propietario de la Trampa debe elegir exactamente 2
      // Monstruos propios. No se puede elegir dos veces el mismo Monstruo.
      return monstersOf(me)
        .filter((fm) => !sel.selectedUids.includes(fm.uid))
        .map((fm) => ({
          type: 'TRAP_2_SELECT_OWN' as const,
          fieldUid: fm.uid,
        }));
    }

    case 'revive-choice': {
      // Mágica 5: recuperar del cementerio a la mano o al campo.
      const out: Action[] = [];

      // A la mano: hace falta hueco y que la carta no esté ya representada en
      // la mano por OTRA COPIA PROPIA (la del rival no lo impide: Mágica 2).
      const alCementerio = me.graveyard.filter((c) => c.type === 'monster');
      const aLaManoPosible =
        me.hand.length < MAX_HAND_SIZE && alCementerio.some((c) => !hasOwnCopy(me.hand, c));
      if (aLaManoPosible) {
        out.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'hand' });
      }

      // Al campo: en el primer turno el Monstruo tambien debe entrar en Defensa.
      if (hasEmptySlot(me)) {
        if (state.turnCount > 0) {
          out.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'attack' });
        }
        out.push({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'defense' });
      }
      return out;
    }
  }
}

// ============================================================================
// JUGADAS LIBRES (sin selección pendiente)
// ============================================================================

/**
 * Regla 15 — desarrollo del turno: jugar un Monstruo, colocar una Trampa,
 * utilizar una Mágica, atacar o cambiar de posición.
 *
 * LÍMITE DE CARTAS POR TURNO (Regla 16): solo lo consumen las acciones que salen
 * de la mano. Atacar y cambiar de posición NO lo consumen, y resolver una
 * Trampa ya colocada tampoco (no es una carta de la mano). Es exactamente lo
 * que dice el reglamento, y por eso el contador se comprueba solo en el primer
 * bloque.
 */
function freeActions(state: GameState, me: PlayerState, opp: PlayerState): Action[] {
  const out: Action[] = [];
  const hayCuota = me.cardsPlayedThisTurn < MAX_CARDS_PER_TURN;

  if (hayCuota) {
    // Regla 18: un Monstruo de la mano, en un hueco libre del campo.
    // Primer turno de la partida: solo puede colocarse en Defensa.
    if (hasEmptySlot(me)) {
      const summonPositions: readonly Position[] = state.turnCount === 0 ? ['defense'] : POSITIONS;
      for (const card of me.hand) {
        if (card.type !== 'monster') continue;
        for (const position of summonPositions) {
          out.push({ type: 'SUMMON_MONSTER', card, position });
        }
      }
    }

    for (const card of me.hand) {
      // Regla 19: una Trampa va bajo un Monstruo propio sin Trampa.
      if (card.type === 'trap') {
        if (hasTrapTarget(me)) {
          out.push({ type: 'SELECT_TRAP_PLACE', card });
        }
        continue;
      }
      // Regla 5: una Mágica solo si tiene un objetivo o una condición válidos
      // AHORA. Sin eso no se gasta cuota ni se abre una selección imposible.
      if (card.type === 'magic' && canActivateMagic(me, state, card)) {
        out.push({ type: 'SELECT_MAGIC', card });
      }
    }
  }

  // Regla 21: atacar con un Monstruo en Ataque que aún no ha atacado.
  //
  // El ataque tiene DOS formas legales, y las dos se generan:
  //
  //   · `START_ATTACK` — el camino de la interfaz: abre la elección de objetivo
  //     para que la persona elija a quién atacar (y el reducer valida después
  //     con `DECLARE_ATTACK`).
  //   · `DECLARE_ATTACK` / `DIRECT_ATTACK` — el camino de un solo paso, que es el
  //     que usa hoy la CPU. El reducer lo admite y aplica igual.
  //
  // Se generan las dos para que esta función sea una descripción COMPLETA de lo
  // que se puede hacer, no una descripción de lo que hace la interfaz. Quien
  // necesite el camino corto (una CPU, un servidor) lo tiene; quien necesite
  // preguntar al usuario usa `START_ATTACK`.
  if (canAttack(state)) {
    const defenders = monstersOf(opp);
    for (const fm of monstersOf(me)) {
      if (fm.position !== 'attack' || fm.hasAttacked) continue;
      out.push({ type: 'START_ATTACK', attackerUid: fm.uid });
      // Regla 22: cualquier Monstruo rival puede ser objetivo,
      // tanto si está en Ataque como si está en Defensa.
      const targets = fm.magic?.effect.kind === 'direct_attack' ? defenders : legalTargets(defenders);
      for (const target of targets) {
        out.push({ type: 'DECLARE_ATTACK', attackerUid: fm.uid, defenderUid: target.uid });
      }
      // Ataque directo: permitido si NO hay ningún rival en Defensa. Los
      // Monstruos rivales en Ataque no lo bloquean. Mágica 1 ignora incluso
      // la presencia de Defensas.
      if (fm.magic?.effect.kind === 'direct_attack' || canDirectAttack(defenders)) {
        out.push({ type: 'DIRECT_ATTACK', attackerUid: fm.uid });
      }
    }
  }

  // Regla 14: cambiar de posición una vez por Monstruo y por turno.
  // Durante el primer turno los Monstruos se mantienen en Defensa.
  if (state.turnCount > 0) {
    for (const fm of monstersOf(me)) {
      if (!fm.hasChangedPosition) {
        out.push({ type: 'CHANGE_POSITION', fieldUid: fm.uid });
      }
    }
  }

  // Regla 15: siempre se puede cerrar el turno.
  out.push({ type: 'END_TURN' });

  return out;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Devuelve todas las acciones legales del jugador `player` en este estado.
 *
 * Siempre devuelve un conjunto cerrado y nunca incluye una acción imposible.
 * Solo devuelve `[]` cuando de verdad no hay nada que hacer (partida terminada,
 * no es su turno, o le toca resolver a otro jugador).
 */
export function legalActions(state: GameState, player: 0 | 1): Action[] {
  // Sin partida en curso no hay jugadas que enumerar.
  if (state.phase === 'start' || state.phase === 'game-over') return [];

  const me = state.players[player];
  const opp = opponentOf(state, player);

  // Paso de dispositivo entre jugadores (1v1 local): le toca a quien tiene el
  // paso. El reducer solo acepta la confirmación si la fase es exactamente esta.
  if (state.phase === 'pass') {
    return player === state.currentPlayer ? [{ type: 'CONFIRM_PASS' }] : [];
  }

  // Regla 19: el defensor decide si activa su Trampa.
  //
  // DEFICIENCIA DOCUMENTADA (F3): el reducer no comprueba QUIÉN resuelve la
  // Trampa, así que en la aplicación cualquiera puede pulsar los botones. Aquí
  // se le atribuye la decisión a quien realmente la tiene: el defensor.
  if (state.phase === 'trap-response') {
    if (!state.pendingTrap || state.pendingTrap.defenderPlayer !== player) return [];
    return [
      { type: 'RESOLVE_TRAP', activate: true },
      { type: 'RESOLVE_TRAP', activate: false },
    ];
  }

  // Dado pendiente (Trampas 3 y 6, Mágica 11, protección por dado).
  //
  // DEFICIENCIA DOCUMENTADA (F3): el reducer acepta cualquier número, no solo
  // del 1 al 6. Aquí solo se generan las seis caras reales de un dado de 6.
  if (state.phase === 'dice-roll') {
    if (!state.pendingDice || player !== state.currentPlayer) return [];
    return DICE_FACES.map((roll) => ({ type: 'ROLL_DICE', roll }));
  }

  // A partir de aquí solo juega quien tiene el turno: el reducer siempre aplica
  // las acciones al jugador en turno, sin mirar quién las envía.
  if (state.phase !== 'playing' || player !== state.currentPlayer) return [];

  const completing = selectionActions(state, player, me, opp);
  if (completing !== null) {
    // Cancelar siempre es legal mientras haya una elección abierta, y la
    // interfaz lo ofrece (botón de cerrar y clic fuera del tablero).
    return [...completing, { type: 'CANCEL_SELECTION' }];
  }

  return freeActions(state, me, opp);
}

/**
 * ¿Está esta acción concreta entre las legales del jugador `player`?
 *
 * Comparación por IDENTIDAD DE COPIA, no por posición en la lista: la interfaz
 * y la CPU construyen la acción a partir de las cartas de la mano del propio
 * estado, así que el objeto carta es literalmente el mismo.
 */
export function isLegalAction(state: GameState, player: 0 | 1, action: Action): boolean {
  return legalActions(state, player).some((candidate) => sameAction(candidate, action));
}

/** Comparación de acciones por contenido. */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  // Se repite `b.type` en cada rama porque TypeScript solo estrecha `b` al
  // comprobar su discriminante dentro de la propia rama.
  switch (a.type) {
    case 'SUMMON_MONSTER':
      return b.type === 'SUMMON_MONSTER' && a.card === b.card && a.position === b.position;
    case 'SELECT_TRAP_PLACE':
      return b.type === 'SELECT_TRAP_PLACE' && a.card === b.card;
    case 'PLACE_TRAP_ON_MONSTER':
      return b.type === 'PLACE_TRAP_ON_MONSTER' && a.card === b.card && a.fieldUid === b.fieldUid;
    case 'SELECT_MAGIC':
      return b.type === 'SELECT_MAGIC' && a.card === b.card;
    case 'PLACE_MAGIC_ON_MONSTER':
      return b.type === 'PLACE_MAGIC_ON_MONSTER' && a.card === b.card && a.fieldUid === b.fieldUid;
    case 'MAGIC_TARGET_MONSTER':
      return b.type === 'MAGIC_TARGET_MONSTER' && a.card === b.card && a.fieldUid === b.fieldUid;
    case 'MAGIC_INSTANT':
      return b.type === 'MAGIC_INSTANT' && a.card === b.card;
    case 'START_ATTACK':
      return b.type === 'START_ATTACK' && a.attackerUid === b.attackerUid;
    case 'DECLARE_ATTACK':
      return b.type === 'DECLARE_ATTACK' && a.attackerUid === b.attackerUid && a.defenderUid === b.defenderUid;
    case 'DIRECT_ATTACK':
      return b.type === 'DIRECT_ATTACK' && a.attackerUid === b.attackerUid;
    case 'RESOLVE_TRAP':
      return b.type === 'RESOLVE_TRAP' && a.activate === b.activate;
    case 'CHANGE_POSITION':
      return b.type === 'CHANGE_POSITION' && a.fieldUid === b.fieldUid;
    case 'DESTROY_MONSTER':
      return b.type === 'DESTROY_MONSTER' && a.fieldUid === b.fieldUid;
    case 'DESTROY_ASSOCIATED_CARD':
      return b.type === 'DESTROY_ASSOCIATED_CARD' && a.fieldUid === b.fieldUid && a.cardType === b.cardType;
    case 'SELECT_ASSOCIATED_CARD_TARGET':
      return b.type === 'SELECT_ASSOCIATED_CARD_TARGET' && a.fieldUid === b.fieldUid;
    case 'TRAP_2_SELECT_OWN':
      return b.type === 'TRAP_2_SELECT_OWN' && a.fieldUid === b.fieldUid;
    case 'CLOSE_DICE_RESULT':
      return b.type === 'CLOSE_DICE_RESULT';
    case 'ROLL_DICE':
      return b.type === 'ROLL_DICE' && a.roll === b.roll;
    case 'REVIVE_CHOICE':
      return b.type === 'REVIVE_CHOICE' && a.card === b.card && a.choice === b.choice && a.position === b.position;
    // Sin datos que comparar: que coincidan el tipo ya es suficiente.
    case 'START_GAME':
    case 'CPU_PLAY':
    case 'CONFIRM_START':
    case 'CONFIRM_PASS':
    case 'END_TURN':
    case 'CANCEL_SELECTION':
    case 'RESTART':
      return true;
    default:
      return false;
  }
}
