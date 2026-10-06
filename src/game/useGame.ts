import { useCallback, useEffect, useReducer, useRef } from 'react';
import { nextCpuAction, cpuDelay } from './cpu';
import { legalActions } from './legalActions';
import {
  getDefaultStorage,
  loadHistoryFrom,
  makeHistoryReducer,
  saveHistoryTo,
  type HistoryBundle,
  type HistoryStorage,
  type MatchHistory,
} from './history';
import {
  buildDeck,
  rollDie,
  type Card,
  type MagicCard,
  type MonsterCard,
  type TrapCard,
} from './cardData';
import {
  type Action,
  type CombatResult,
  type FieldMonster,
  type GameState,
  type PlayerState,
  type Position,
  type SelectionMode,
  MAX_HAND_SIZE,
  canAttack,
  createPlayer,
  detachFieldMonster,
  drawCards,
  getEffectiveAtk,
  getFirstEmptySlot,
  hasEmptySlot,
  canPlaceTrapOn,
  checkStalemate,
  isBlockedByStalemate,
  describeBlock,
  magicRequiredSide,
  ownerOf,
  hasOwnCopy,
  MAX_CARDS_PER_TURN,
  placeFieldMonster,
  resolveCombat,
  shuffleDeck,
  newInstanceId,
  indexOfCardInstance,
} from './types';
import { getTrap3CountingOrder } from './trapCounting';

/**
 * Identidad de instancia de un Monstruo en el campo.
 *
 * Es el MISMO generador que usan las cartas (`newInstanceId`), así que el juego
 * tiene un único esquema de identidad de instancia: un `FieldMonster` es una
 * copia física concreta, igual que una carta de la mano.
 */
function genUid(): string {
  return newInstanceId();
}

export function initialState(): GameState {
  return {
    phase: 'start',
    mode: 'local',
    difficulty: 'normal',
    currentPlayer: 0,
    turnCount: 0,
    stateVersion: 0,
    players: [
      createPlayer(0, 'Jugador 1', []),
      createPlayer(1, 'Jugador 2', []),
    ],
    selection: { kind: 'none' },
    log: [],
    winner: null,
    isDraw: false,
    pendingTrap: null,
    pendingDice: null,
    lastCombat: null,
    passTarget: 0,
    diceResult: null,
  };
}

function addLog(state: GameState, msg: string, actor: 0 | 1 = state.currentPlayer): string[] {
  const actorLabel = state.mode === 'cpu' && actor === 1 ? 'CPU' : `Jugador ${actor + 1}`;
  return [...state.log.slice(-50), `${actorLabel}: ${msg}`];
}

function checkWinner(players: [PlayerState, PlayerState]): { winner: 0 | 1 | null; isDraw: boolean } {
  if (players[0].lp <= 0 && players[1].lp <= 0) {
    if (players[0].lp === players[1].lp) return { winner: null, isDraw: true };
    return { winner: players[0].lp > players[1].lp ? 0 : 1, isDraw: false };
  }
  if (players[1].lp <= 0) return { winner: 0, isDraw: false };
  if (players[0].lp <= 0) return { winner: 1, isDraw: false };
  return { winner: null, isDraw: false };
}

/**
 * Regla 27 — Resuelve el final de la partida.
 *
 * ORDEN (decisión del creador):
 *   1. Regla 27.1 / 27.3 — si algún jugador tiene 0 LP se resuelve la victoria
 *      o el empate correspondientes. **La 27.2 NO se aplica.**
 *   2. Regla 27.2 — solo si ambos tienen LP > 0 y NINGUNO puede continuar.
 *
 * Criterio de bloqueo (27.2). Un jugador NO está bloqueado si tiene:
 *   A) alguna ACCIÓN LEGAL disponible, que según la Regla 15 incluye:
 *        · jugar un Monstruo
 *        · colocar o activar una Trampa
 *        · utilizar una Mágica legalmente
 *        · ATACAR con un Monstruo en Ataque que aún no ha atacado
 *        · CAMBIAR DE POSICIÓN un Monstruo que aún no lo ha hecho
 *      ni de
 *   B) una vía reglamentaria de CONTINUAR la partida: tener cartas en el mazo
 *      y sitio en la mano (por debajo de 9) significa que en su siguiente turno
 *      recibirá cartas nuevas por el robo automático.
 *
 * El robo NO es una acción legal (es automático al inicio del turno, Regla
 * 15): solo demuestra que la partida puede continuar.
 *
 * La cuota de 3 cartas (Regla 16) NO interviene: se reinicia cada turno, así
 * que agotarla nunca bloquea la partida.
 */
function checkStalemateEnd(state: GameState): GameState {
  // --- 1. Regla 27.1 / 27.3 tiene prioridad absoluta ---
  const winResult = checkWinner(state.players);
  if (winResult.winner !== null || winResult.isDraw) {
    return {
      ...state,
      phase: 'game-over' as const,
      winner: winResult.winner,
      isDraw: winResult.isDraw,
      selection: { kind: 'none' },
    };
  }

  // --- 2. Regla 27.2 ---
  if (!isBlockedByStalemate(state)) return state;

  const winner = checkStalemate(state.players);
  const [p1, p2] = state.players;
  const condicion =
    `${describeBlock(p1, state)} | ${describeBlock(p2, state)}`;
  const motivo = winner === null ? 'empate' : `gana el Jugador ${winner + 1}`;
  return {
    ...state,
    phase: 'game-over' as const,
    winner,
    isDraw: winner === null,
    selection: { kind: 'none' },
    log: addLog(
      state,
      `Ningún jugador puede continuar y no hay vía reglamentaria de seguir: ${condicion}. ` +
      `Regla 27.2: ${motivo} (J1 ${p1.lp} LP, J2 ${p2.lp} LP).`,
    ),
  };
}

/**
 * ¿Está ESTA copia concreta en la mano?
 *
 * Busca por identidad de instancia, no solo por `id`: con la Mágica 2 la mano
 * puede tener la Araña del Jugador 1 y la Araña del Jugador 2, y son dos cartas
 * distintas. Si la carta no está sellada (solo posible en pruebas) se recurre al
 * `id`, que basta porque entonces no hay dos copias del mismo tipo.
 */
function hasCardInHand(player: PlayerState, card: Card): boolean {
  return indexOfCardInstance(player.hand, card) !== -1;
}

function playCardFromHand(player: PlayerState, card: Card): PlayerState {
  return { ...removeCardFromHand(player, card), cardsPlayedThisTurn: player.cardsPlayedThisTurn + 1 };
}

/**
 * Elimina de la mano UNA sola copia: la carta que se ha jugado, identificada por
 * su `instanceId`.
 *
 * No elimina todas las copias con el mismo `id`. Cada mazo tiene un único
 * ejemplar de cada carta, pero la Mágica 2 puede traer la copia del RIVAL, así
 * que una mano puede tener legítimamente dos cartas con el mismo `id`. Jugando
 * una SOLO se retira esa: la otra permanece en la mano y conserva su propietario
 * original.
 */
function removeCardFromHand(player: PlayerState, card: Card): PlayerState {
  const idx = indexOfCardInstance(player.hand, card);
  if (idx === -1) return player;
  return { ...player, hand: [...player.hand.slice(0, idx), ...player.hand.slice(idx + 1)] };
}

function findFieldMonster(player: PlayerState, uid: string): FieldMonster | null {
  return player.field.find((f) => f?.uid === uid) ?? null;
}

function updateFieldMonster(player: PlayerState, uid: string, updater: (fm: FieldMonster) => FieldMonster): PlayerState {
  return { ...player, field: player.field.map((f) => (f?.uid === uid ? updater(f) : f)) };
}

/**
 * Regla 6 / Regla 26 — Retira un Monstruo (y sus Trampa/Mágica asociadas) del
 * campo de `playerIdx` y envía CADA carta al cementerio de su PROPIETARIO
 * original, no al de quien lo controlaba.
 *
 * Es lo que exige la Regla 6: «Cuando una carta deba pasar al cementerio, va
 * al cementerio de su propietario original, no al del jugador que la controle
 * en ese momento» (relevante con la Trampa 7 y la Trampa 10).
 *
 * Muta `players` en el sitio: las llamadas ya trabajaban sobre una copia local
 * con la forma `players[i] = removeFieldMonster(players[i], uid)`.
 */
function removeFieldMonster(
  players: [PlayerState, PlayerState],
  playerIdx: 0 | 1,
  uid: string,
): void {
  const player = players[playerIdx];
  const fm = findFieldMonster(player, uid);
  if (!fm) return;

  players[playerIdx] = { ...player, field: player.field.map((f) => (f?.uid === uid ? null : f)) };

  const cartas: Card[] = [fm.card, ...(fm.trap ? [fm.trap] : []), ...(fm.magic ? [fm.magic] : [])];
  for (const carta of cartas) {
    const dueno = ownerOf(carta) ?? playerIdx;
    players[dueno] = { ...players[dueno], graveyard: [...players[dueno].graveyard, carta] };
  }
}

function consumeAttachedTrap(
  players: [PlayerState, PlayerState],
  playerIdx: 0 | 1,
  uid: string,
): void {
  const player = players[playerIdx];
  const fm = findFieldMonster(player, uid);
  if (!fm?.trap) return;

  const trap = fm.trap;
  const owner = ownerOf(trap) ?? playerIdx;
  players[owner] = {
    ...players[owner],
    graveyard: [...players[owner].graveyard, trap],
  };
  players[playerIdx] = updateFieldMonster(players[playerIdx], uid, (fieldMonster) => ({
    ...fieldMonster,
    trap: null,
  }));
}

function applyDamage(player: PlayerState, dmg: number): PlayerState {
  return { ...player, lp: Math.max(0, player.lp - dmg) };
}

function applyHeal(player: PlayerState, heal: number): PlayerState {
  return { ...player, lp: Math.min(999, player.lp + heal) };
}

// --- Trap resolution ---
function applyTrapEffect(
  state: GameState,
  trap: TrapCard,
  attackerPlayer: 0 | 1,
  defenderPlayer: 0 | 1,
  attackerUid: string,
  defenderUid: string,
): { state: GameState; negateAttack: boolean; destroyAttacker: boolean; skipCombat: boolean } {
  const players = [...state.players] as [PlayerState, PlayerState];
  let negateAttack = false;
  let destroyAttacker = false;
  let skipCombat = false;
  const log: string[] = [];
  const effect = trap.effect;
  const attacker = findFieldMonster(players[attackerPlayer], attackerUid);
  const defender = findFieldMonster(players[defenderPlayer], defenderUid);

  switch (effect.kind) {
    case 'heal_per_turn':
      // passive — handled at turn start, not on attack
      log.push(`¡${trap.name}! (Efecto pasivo, no se activa en combate.)`);
      break;
    case 'destroy_2_self_1_opp': {
      // Trampa 2 no se activa al recibir un ataque — se activa al comienzo del turno
      // Este caso no debería ejecutarse aquí, pero se mantiene por seguridad
      log.push(`¡${trap.name}! (Esta Trampa se activa al comienzo del turno, no al recibir un ataque.)`);
      break;
    }
    case 'dice_count_field':
      // needs dice — set up pending dice
      return { state: { ...state, phase: 'dice-roll', pendingDice: { reason: trap.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) } }, negateAttack: true, destroyAttacker: false, skipCombat: true };
    case 'reflect_damage':
      // handled in combat resolution — mark defender
      if (defender) {
        players[defenderPlayer] = updateFieldMonster(players[defenderPlayer], defenderUid, (fm) => ({ ...fm, pendingEffect: 'death', pendingTurns: -1 }));
        log.push(`¡${trap.name}! El daño será devuelto al adversario.`);
      }
      break;
    case 'negate_destroy_card': {
      negateAttack = true;
      skipCombat = true;
      // destroy a trap or magic from opponent's field
      const oppField = players[attackerPlayer].field.filter(Boolean) as FieldMonster[];
      const target = oppField.find((f) => f.trap || f.magic);
      if (target) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], target.uid, (fm) => ({ ...fm, trap: null, magic: null }));
        log.push(`¡${trap.name}! Ataque negado y carta especial del rival destruida.`);
      } else {
        log.push(`¡${trap.name}! Ataque negado.`);
      }
      break;
    }
    case 'dice_4plus_destroy':
      return { state: { ...state, phase: 'dice-roll', pendingDice: { reason: trap.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) } }, negateAttack: true, destroyAttacker: false, skipCombat: true };
    case 'swap_attacker': {
      // Trampa 7: El atacante pasa directamente al campo del defensor (sin intercambio)
      if (attacker && defender) {
        // Verificar que hay espacio libre en el campo del defensor
        if (!hasEmptySlot(players[defenderPlayer])) {
          log.push(`¡${trap.name}! No hay espacio libre en tu campo. La Trampa no puede activarse.`);
          break;
        }
        // Mover el atacante al campo del defensor SIN enviarlo al cementerio
        const movedAttacker: FieldMonster = {
          ...attacker,
          controlledBy: defenderPlayer,
        };
        players[defenderPlayer] = placeFieldMonster(players[defenderPlayer], movedAttacker);
        players[attackerPlayer] = detachFieldMonster(players[attackerPlayer], attackerUid);
        log.push(`¡${trap.name}! ${attacker.card.name} pasa a tu campo.`);
      }
      negateAttack = true;
      skipCombat = true;
      break;
    }
    case 'destroy_attacker':
      if (attacker) {
        removeFieldMonster(players, attackerPlayer, attackerUid);
        log.push(`¡${trap.name}! ${attacker.card.name} es destruido.`);
        destroyAttacker = true;
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'three_turns_kill': {
      // Trampa 9 no se activa al recibir un ataque — se activa al comienzo del turno
      // Este caso no debería ejecutarse aquí, pero se mantiene por seguridad
      log.push(`¡${trap.name}! (Esta Trampa se activa al comienzo del turno, no al recibir un ataque.)`);
      break;
    }
    case 'control_two_turns': {
      // Trampa 10: El atacante pasa al campo del defensor bajo su control durante 2 turnos
      if (attacker) {
        if (!hasEmptySlot(players[defenderPlayer])) {
          log.push(`¡${trap.name}! No hay espacio libre en tu campo. La Trampa no puede activarse.`);
          break;
        }
        const movedAttacker: FieldMonster = {
          ...attacker,
          pendingEffect: 'control',
          pendingTurns: 2,
          controlledBy: defenderPlayer,
          // El ataque que activó la Trampa fue realizado por el jugador anterior.
          // Al cambiar de control, este Monstruo no ha atacado todavía para su nuevo controlador.
          hasAttacked: false,
        };
        players[defenderPlayer] = placeFieldMonster(players[defenderPlayer], movedAttacker);
        players[attackerPlayer] = detachFieldMonster(players[attackerPlayer], attackerUid);
        log.push(`¡${trap.name}! ${attacker.card.name} pasa a tu campo bajo tu control por 2 turnos.`);
      }
      negateAttack = true;
      skipCombat = true;
      break;
    }
    case 'death_after_two_turns':
      if (attacker) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], attackerUid, (fm) => ({ ...fm, pendingEffect: 'death', pendingTurns: 2 }));
        log.push(`¡${trap.name}! ${attacker.card.name} morirá en 2 turnos.`);
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'damage_per_turn':
      log.push(`¡${trap.name}! (Efecto pasivo, no se activa en combate.)`);
      break;
  }

  return { state: { ...state, players, log: log.length > 0 ? addLog(state, log.join(' '), defenderPlayer) : state.log }, negateAttack, destroyAttacker, skipCombat };
}

/**
 * Resuelve el efecto de una Mágica.
 *
 * `targetUid` es opcional. El LADO del objetivo NO se toma del argumento: se
 * deduce del propio uid (en qué campo está realmente el Monstruo) y se valida
 * contra lo que exige la Regla 5. Así una Mágica 8 nunca puede acabar sobre un
 * monstruo propio por pasar un `side` equivocado.
 */
function applyMagicEffect(state: GameState, card: MagicCard, targetUid?: string): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const me = state.currentPlayer;
  const opp = (me === 0 ? 1 : 0) as 0 | 1;
  const log: string[] = [];
  const eff = card.effect;
  let resolves = true;

  // Regla 16 — el límite de 3 cartas por turno se comprueba AQUÍ, en el único
  // punto por el que una carta sale de la mano, y no solo en las acciones que
  // ABREN una selección (`SELECT_MAGIC`).
  //
  // Sin esta comprobación, las acciones de un solo paso (`MAGIC_INSTANT`,
  // `PLACE_MAGIC_ON_MONSTER` y `MAGIC_TARGET_MONSTER`)avam a la cuota y
  // permitían jugar una carta de más por la Regla 16.
  if (state.players[me].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;

  switch (eff.kind) {
    case 'direct_attack': {
      if (targetUid) {
        const target = findFieldMonster(players[me], targetUid);
        if (!target || target.magic !== null) {
          resolves = false;
          break;
        }
        players[me] = playCardFromHand(
          updateFieldMonster(players[me], targetUid, (fm) => ({ ...fm, magic: card })),
          card,
        );
        log.push(`${card.name}: queda asociada a ${target.card.name}. Ese Monstruo puede elegir atacar a cualquier Monstruo rival o directamente a los LP, incluso si hay Defensas.`);
      }
      break;
    }
    case 'steal_hand_card': {
      // Mágica 2 (decisión del creador): puede robar una carta aunque el jugador
      // ya tenga otra con el mismo `id`. No existe regla general que prohíba
      // duplicados en la mano: cada mazo tiene un ejemplar de cada carta, así
      // que puede haber dos Kraken, uno de cada jugador.
      // La carta robada CONSERVA su propietario (Regla 6).
      const oppHand = players[opp].hand;
      if (players[me].hand.length >= MAX_HAND_SIZE) {
        resolves = false;
        log.push(`${card.name}: Tu mano está llena (máximo ${MAX_HAND_SIZE} cartas).`);
      } else if (oppHand.length === 0) {
        resolves = false;
        log.push(`${card.name}: El rival no tiene cartas en su mano.`);
      } else {
        const idx = Math.floor(Math.random() * oppHand.length);
        const stolen = oppHand[idx];
        players[opp] = { ...players[opp], hand: oppHand.filter((_, i) => i !== idx) };
        // La carta entra tal cual: su `owner` sigue siendo el del rival (Regla 6).
        players[me] = { ...players[me], hand: [...players[me].hand, stolen] };
        const dueno = ownerOf(stolen) ?? opp;
        log.push(
          `${card.name}: Robas ${stolen.name} de la mano del rival. ` +
          `Sigue siendo propiedad del Jugador ${dueno + 1}.`,
        );
      }
      break;
    }
    case 'hand_swap': {
      for (const i of [0, 1] as const) {
        const p = players[i];
        const puedeRobar = p.deck.length >= 5;
        // Regla 6: cada carta descartada va al cementerio de SU propietario. Una
        // carta robada con la Mágica 2 vuelve al cementerio del rival.
        players[i] = { ...p, hand: [] };
        for (const carta of p.hand) {
          const dueno = ownerOf(carta) ?? i;
          players[dueno] = { ...players[dueno], graveyard: [...players[dueno].graveyard, carta] };
        }
        if (!puedeRobar) {
          log.push(`${card.name}: Jugador ${i + 1} no tiene 5 cartas en el mazo. No roba ninguna.`);
        } else {
          players[i] = drawCards(players[i], 5);
          log.push(`${card.name}: Jugador ${i + 1} descarta y roba 5 cartas.`);
        }
      }
      break;
    }
    case 'atk_boost':
    case 'def_reduce':
    case 'dice_protection': {
      // Regla 5: las Mágicas 4 y 9 van solo sobre un Monstruo PROPIO; la
      // Mágica 8 es la excepción y va solo sobre un Monstruo RIVAL.
      // Sin objetivo legal la Mágica NO se consume, NO gasta cuota y NO registra
      // un éxito falso (se marca `resolves = false`).
      const exigido = magicRequiredSide(card);
      // Índice del jugador cuyo campo debe alojar el objetivo (Regla 5).
      const exigidoLado: 0 | 1 | null =
        exigido === 'self' ? me : exigido === 'enemy' ? opp : null;
      const ladoReal = targetUid
        ? findFieldMonster(players[me], targetUid)
          ? me
          : findFieldMonster(players[opp], targetUid)
            ? opp
            : null
        : null;

      if (!targetUid) {
        resolves = false;
        log.push(`${card.name}: No se ha indicado un Monstruo sobre el que colocarla.`);
      } else if (ladoReal === null) {
        resolves = false;
        log.push(`${card.name}: El Monstruo indicado ya no está en el campo.`);
      } else if (exigidoLado !== null && ladoReal !== exigidoLado) {
        resolves = false;
        log.push(
          exigido === 'self'
            ? `${card.name}: solo puede colocarse sobre un Monstruo PROPIO.`
            : `${card.name}: solo puede colocarse sobre un Monstruo RIVAL.`,
        );
      } else if (findFieldMonster(players[ladoReal], targetUid)!.magic !== null) {
        // Regla 4 y Regla 5: máximo 1 Mágica por Monstruo.
        resolves = false;
        log.push(`${card.name}: ese Monstruo ya tiene una Mágica asociada.`);
      } else {
        players[ladoReal] = updateFieldMonster(players[ladoReal], targetUid, (fm) => {
          if (eff.kind === 'atk_boost') return { ...fm, magic: card, tempAtkModifier: fm.tempAtkModifier + eff.amount };
          if (eff.kind === 'def_reduce') return { ...fm, magic: card, tempDefModifier: fm.tempDefModifier - eff.amount };
          return { ...fm, magic: card, diceProtection: true };
        });
        const detalle =
          eff.kind === 'atk_boost' ? `+${eff.amount} ATQ colocada.`
          : eff.kind === 'def_reduce' ? `-${eff.amount} DEF colocada.`
          : 'Protección por dado colocada.';
        log.push(`${card.name}: ${detalle}`);
      }
      break;
    }
    case 'revive_monster': {
      const monsters = players[me].graveyard.filter((c) => c.type === 'monster') as MonsterCard[];
      if (monsters.length === 0) {
        resolves = false;
        log.push(`${card.name}: No hay Monstruos en el cementerio.`);
        break;
      }
      // Decisión del creador: NO recuperar una carta que ya esté representada en
      // la mano por OTRA COPIA PROPIA. No es una prohibición general de
      // duplicados: si la copia que hay en la mano es del RIVAL (Mágica 2), sí
      // se puede recuperar la propia.
      const toHand = monsters.filter((c) => !hasOwnCopy(players[me].hand, c));
      const canReviveToHand = players[me].hand.length < MAX_HAND_SIZE && toHand.length > 0;
      const canReviveToField = hasEmptySlot(players[me]);
      if (!canReviveToHand && !canReviveToField) {
        resolves = false;
        log.push(`${card.name}: No hay espacio en la mano ni en el campo, o la carta ya está en tu mano. La Mágica no puede utilizarse.`);
        break;
      }
      // Si solo hay una opción posible, ejecutarla directamente
      if (canReviveToHand && !canReviveToField) {
        // Solo se puede revivir a la mano
        const sorted = [...toHand].sort((a, b) => b.atk - a.atk);
        const revived = sorted[0];
        players[me] = {
          ...players[me],
          hand: [...players[me].hand, revived],
          graveyard: players[me].graveyard.filter((c) => c.id !== revived.id),
        };
        log.push(`${card.name}: ${revived.name} recuperado del cementerio a la mano.`);
      } else if (!canReviveToHand && canReviveToField) {
        // Solo se puede revivir al campo
        const sorted = [...monsters].sort((a, b) => b.atk - a.atk);
        const revived = sorted[0];
        const slot = getFirstEmptySlot(players[me]);
        const fm: FieldMonster = {
          uid: genUid(),
          card: revived,
          position: state.turnCount === 0 ? 'defense' : 'attack',
          faceDown: state.turnCount === 0,
          trap: null,
          magic: null,
          hasAttacked: true,
          hasChangedPosition: false,
          summonedThisTurn: true,
          pendingTurns: 0,
          pendingEffect: null,
          controlledBy: null,
          tempAtkModifier: 0,
          tempDefModifier: 0,
          diceProtection: false,
        };
        players[me] = {
          ...players[me],
          graveyard: players[me].graveyard.filter((c) => c.id !== revived.id),
          field: players[me].field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[],
        };
        log.push(`${card.name}: ${revived.name} revivido del cementerio al campo.`);
      } else {
        // Ambas opciones son posibles — pedir al jugador que elija
        return { ...state, selection: { kind: 'revive-choice', card } };
      }
      break;
    }
    case 'destroy_all_field': {
      for (const i of [0, 1] as const) {
        const count = players[i].field.filter(Boolean).length;
        const allFms = players[i].field.filter(Boolean) as FieldMonster[];
        allFms.forEach((f) => { removeFieldMonster(players, i, f.uid); });
        log.push(`${card.name}: ${count} cartas destruidas del Jugador ${i + 1}.`);
      }
      break;
    }
    case 'switch_all_opp_position': {
      players[opp] = {
        ...players[opp],
        field: players[opp].field.map((f) =>
          f ? {
            ...f,
            position: f.position === 'attack' ? 'defense' as Position : 'attack' as Position,
            // Regla 13: al cambiar de posición, el Monstruo queda boca arriba.
            // Si estaba oculto en Defensa, al pasar a Ataque se revela; si estaba
            // boca arriba en Ataque, al pasar a Defensa sigue siendo visible.
            faceDown: false,
          } : f,
        ),
      };
      log.push(`${card.name}: Todos los Monstruos del rival cambian de posición.`);
      break;
    }
    // NOTA: `def_reduce` y `dice_protection` se resuelven junto a `atk_boost`
    // en el bloque agrupado de la línea 445, que aplica la validación de lado
    // exigida por la Regla 5. Aquí no se repiten.
    case 'draw_cards': {
      players[me] = drawCards(players[me], eff.amount);
      log.push(`${card.name}: Robas ${eff.amount} cartas.`);
      break;
    }
    case 'dice_damage': {
      return { ...state, phase: 'dice-roll', pendingDice: { reason: card.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) }, diceResult: null, selection: { kind: 'none' } };
    }
    case 'clean_opp_field': {
      const allFms = players[opp].field.filter(Boolean) as FieldMonster[];
      allFms.forEach((f) => { removeFieldMonster(players, opp, f.uid); });
      log.push(`${card.name}: Campo del rival limpiado.`);
      break;
    }
  }

  // La Mágica solo se retira de la mano cuando el efecto se resolvió de verdad.
  if (resolves && (card.placement === 'instant' || targetUid)) {
    players[me] = playCardFromHand(players[me], card);
  }

  const winResult = checkWinner(players);
  // Regla 27.1 — «Cuando un jugador llega a 0 PV, pierde inmediatamente la
  // partida». Se comprueba aquí y no solo al final de un combate o de un turno:
  // la Mágica 1 (ataque directo) puede dejar al rival sin PV, y antes esta
  // función registraba el ganador sin pasar la fase a 'game-over', así que la
  // partida seguía con un jugador ya derrotado.
  return {
    ...state,
    players,
    phase: winResult.winner !== null || winResult.isDraw ? ('game-over' as const) : ('playing' as const),
    log: addLog(state, log.join(' ')),
    winner: winResult.winner,
    isDraw: winResult.isDraw,
    selection: { kind: 'none' },
  };
}

// --- Turn start/end effects ---
function applyTurnStartEffects(state: GameState, playerIdx: 0 | 1): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const log: string[] = [];

  // Trampa 12 es continua: se aplica al comienzo de cada turno mientras el
  // Monstruo portador siga vivo. Si sigue oculta, no revelamos su identidad.
  for (const ownerIdx of [0, 1] as const) {
    const opponentIdx = (ownerIdx === 0 ? 1 : 0) as 0 | 1;
    for (const fm of players[ownerIdx].field) {
      if (!fm?.trap || fm.trap.effect.kind !== 'damage_per_turn') continue;
      const amount = fm.trap.effect.amount;
      players[opponentIdx] = applyDamage(players[opponentIdx], amount);
      log.push(
        fm.trapRevealed
          ? `${fm.trap.name}: el rival pierde ${amount} PV por su efecto continuo.`
          : `Una Trampa activa hace perder ${amount} PV al rival.`,
      );
    }
  }

  const p = players[playerIdx];

  for (const fm of p.field) {
    if (!fm) continue;
    // Trampa 1: +5 PV al comienzo de cada turno de su propietario.
    if (fm.trap?.effect.kind === 'heal_per_turn') {
      const amount = fm.trap.effect.amount;
      players[playerIdx] = applyHeal(players[playerIdx], amount);
      log.push(fm.trapRevealed ? `${fm.trap.name}: +${amount} PV por su efecto continuo.` : `Una Trampa activa te hace recuperar ${amount} PV.`);
    }
    // Trap 2: Destrucción 2+1 — se activa al comienzo del turno
    if (fm.trap?.effect.kind === 'destroy_2_self_1_opp') {
      const selfFms = players[playerIdx].field.filter(Boolean) as FieldMonster[];
      const oppFms = players[playerIdx === 0 ? 1 : 0].field.filter(Boolean) as FieldMonster[];
      if (selfFms.length >= 2 && oppFms.length >= 1) {
        // La Trampa 2 siempre se activa, pero los 2 Monstruos propios no se
        // eligen automáticamente: los elige su propietario.
        log.push(`${fm.trap.name}: Elige los 2 Monstruos propios que quieres destruir por efecto de la Trampa.`);
        return {
          ...state,
          players,
          selection: { kind: 'choose-trap-2-own', trapUid: fm.uid, selectedUids: [] },
          log: log.length > 0 ? addLog(state, log.join(' '), playerIdx) : state.log,
        };
      } else {
        const propiosNecesarios = 2;
        const propiosDisponibles = selfFms.length;
        const rivalesNecesarios = 1;
        const rivalesDisponibles = oppFms.length;
        const motivo =
          propiosDisponibles < propiosNecesarios && rivalesDisponibles < rivalesNecesarios
            ? `no tienes los 2 Monstruos propios necesarios y el rival tampoco tiene un Monstruo disponible`
            : propiosDisponibles < propiosNecesarios
              ? `solo tienes ${propiosDisponibles} Monstruo${propiosDisponibles === 1 ? '' : 's'} propio${propiosDisponibles === 1 ? '' : 's'} y necesitas al menos 2`
              : `el rival no tiene ningún Monstruo disponible para destruir`;
        log.push(`${fm.trap.name}: La Trampa se activa, pero no tiene efecto porque ${motivo}.`);
      }
    }
    // Trap 9: Tres turnos — cuenta 3 turnos y luego permite elegir un monstruo para destruir
    if (fm.trap?.effect.kind === 'three_turns_kill') {
      const currentTurns = fm.pendingTurns > 0 ? fm.pendingTurns : 3;
      const newTurns = currentTurns - 1;
      if (newTurns === 0) {
        players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingTurns: 0 }));
        log.push(`${fm.trap.name}: ¡Elige un Monstruo del campo para destruir!`);
        return {
          ...state,
          players,
          selection: { kind: 'choose-destroy-target', trapUid: fm.uid },
          log: log.length > 0 ? addLog(state, log.join(' ')) : state.log,
        };
      } else {
        players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingTurns: newTurns }));
        log.push(`${fm.trap.name}: ${newTurns} turnos restantes.`);
      }
    }
    // Pending effects countdown
    if (fm.pendingEffect && fm.pendingTurns > 0) {
      const newTurns = fm.pendingTurns - 1;
      if (newTurns === 0) {
        if (fm.pendingEffect === 'death' || fm.pendingEffect === 'three_turns') {
          removeFieldMonster(players, playerIdx, fm.uid);
          log.push(`${fm.card.name} muere por efecto pendiente.`);
        } else if (fm.pendingEffect === 'control') {
          players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingEffect: null, pendingTurns: 0, controlledBy: null }));
          log.push(`${fm.card.name} recupera el control.`);
        }
      } else {
        players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingTurns: newTurns }));
      }
    }
  }

  return { ...state, players, log: log.length > 0 ? addLog(state, log.join(' ')) : state.log };
}

/**
 * Acciones que COMPLETAN cada elección abierta.
 *
 * Regla 15: el turno se desarrolla por pasos, así que una elección abierta se
 * COMPLETA o se CANCELA, y nada más. Sin este mapa, cualquier otra jugada
 * (invocar, cerrar el turno, cambiar de posición, abrir otra selección, o incluso
 * una acción de completación que pertenece a OTRA elección) se aplicaba igual y,
 * si tocaba la selección, la borraba sin haberla resuelto: la carta elegida se
 * quedaba en la mano y el jugador perdía su turno de decidir.
 *
 * Es la misma tabla que usa `legalActions()`; aquí se escribe en forma de mapa
 * para poder comprobar en O(1) y sin recalcular el conjunto completo.
 */
const ACCIONES_QUE_COMPLETAN: Record<SelectionMode['kind'], ReadonlySet<Action['type']>> = {
  none: new Set<Action['type']>(),
  'place-trap': new Set<Action['type']>(['PLACE_TRAP_ON_MONSTER']),
  'place-magic': new Set<Action['type']>(['PLACE_MAGIC_ON_MONSTER']),
  'magic-target-monster': new Set<Action['type']>(['MAGIC_TARGET_MONSTER']),
  attack: new Set<Action['type']>(['DECLARE_ATTACK']),
  'attack-or-direct': new Set<Action['type']>(['DECLARE_ATTACK', 'DIRECT_ATTACK']),
  'direct-attack': new Set<Action['type']>(['DIRECT_ATTACK']),
  'choose-destroy-target': new Set<Action['type']>(['DESTROY_MONSTER']),
  'choose-trap-2-own': new Set<Action['type']>(['TRAP_2_SELECT_OWN']),
  'revive-choice': new Set<Action['type']>(['REVIVE_CHOICE']),
};

export function reducer(state: GameState, action: Action): GameState {
  // Con una elección abierta, lo único legal es terminarla o cancelarla.
  //
  // La guarda se limita a `phase === 'playing'` porque en las fases de paso, de
  // Trampa y de dados quien debe actuar es otro: su acción corresponde a ESA
  // fase (`CONFIRM_PASS`, `RESOLVE_TRAP`, `ROLL_DICE`) y no a la elección.
  if (state.phase === 'playing' && state.selection.kind !== 'none') {
    const completa = ACCIONES_QUE_COMPLETAN[state.selection.kind];
    if (!completa.has(action.type) && action.type !== 'CANCEL_SELECTION') return state;
  }

  switch (action.type) {
    case 'START_GAME': {
      const mode = action.mode ?? 'local';
      const difficulty = action.difficulty ?? 'normal';
      const deck = shuffleDeck(buildDeck());
      let p1 = createPlayer(0, 'Jugador 1', deck);
      p1 = drawCards(p1, 7);
      const deck2 = shuffleDeck(buildDeck());
      let p2 = createPlayer(1, mode === 'cpu' ? 'CPU' : 'Jugador 2', deck2);
      p2 = drawCards(p2, 7);

      // En cada partida se sortea aleatoriamente quien empieza.
      const startingPlayer = Math.random() < 0.5 ? 0 : 1;
      const startingPlayerName = mode === 'cpu' && startingPlayer === 1
        ? 'CPU'
        : startingPlayer === 0
          ? p1.name
          : p2.name;

      return {
        ...initialState(),
        mode,
        difficulty,
        phase: mode === 'cpu' ? 'playing' : 'pass',
        passTarget: startingPlayer,
        players: [p1, p2],
        currentPlayer: startingPlayer,
        log: ['¡Empieza la partida! Empieza ' + startingPlayerName + '.'],
      };
    }
    case 'CONFIRM_START': {
      return { ...state, phase: 'playing', passTarget: 0 };
    }
    case 'CONFIRM_PASS': {
      // Solo tiene efecto si realmente estamos en el paso de turno. Sin esta
      // guarda, un CONFIRM_PASS rezagado (o un doble clic) resucitaba una
      // partida ya terminada y borraba el resultado de la Regla 27.
      if (state.phase !== 'pass') return state;
      return { ...state, phase: 'playing' };
    }
    case 'SUMMON_MONSTER': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card)) return state;
      if (!hasEmptySlot(state.players[cp])) return state;
      if (state.turnCount === 0 && action.position !== 'defense') return state;
      const slot = getFirstEmptySlot(state.players[cp]);
      const fm: FieldMonster = {
        uid: genUid(),
        card: action.card,
        position: action.position,
        faceDown: action.position === 'defense',
        trap: null,
        magic: null,
        hasAttacked: false,
        hasChangedPosition: false,
        summonedThisTurn: true,
        pendingTurns: 0,
        pendingEffect: null,
        controlledBy: null,
        tempAtkModifier: 0,
        tempDefModifier: 0,
        diceProtection: false,
      };
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = {
        ...players[cp],
        field: players[cp].field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[],
        hand: removeCardFromHand(players[cp], action.card).hand,
        cardsPlayedThisTurn: players[cp].cardsPlayedThisTurn + 1,
      };
      const posText = action.position === 'attack' ? 'Ataque' : 'Defensa (boca abajo)';
      const newState: GameState = { ...state, players, selection: { kind: 'none' }, log: addLog(state, `${players[cp].name} invoca ${action.card.name} en ${posText}.`) };
      return checkStalemateEnd(newState);
    }
    case 'SELECT_TRAP_PLACE': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card)) return state;
      return { ...state, selection: { kind: 'place-trap', card: action.card } };
    }
    case 'PLACE_TRAP_ON_MONSTER': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      // Regla 16: la cuota también se comprueba aquí, no solo en
      // `SELECT_TRAP_PLACE`. Sin esto, colocar la Trampa saltándose el paso de
      // selección jugaba una carta extra con el contador por encima del tope.
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      const fm = findFieldMonster(state.players[cp], action.fieldUid);
      if (!hasCardInHand(state.players[cp], action.card) || !fm || !canPlaceTrapOn(state.players[cp], action.fieldUid)) return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = updateFieldMonster(players[cp], action.fieldUid, (f) => ({ ...f, trap: action.card, trapRevealed: false }));
      players[cp] = playCardFromHand(players[cp], action.card);

      let logMessage = `${players[cp].name} coloca una Trampa bajo ${fm.card.name}.`;
      if (action.card.effect.kind === 'damage_per_turn') {
        const opponent = (cp === 0 ? 1 : 0) as 0 | 1;
        const amount = action.card.effect.amount;
        players[opponent] = applyDamage(players[opponent], amount);
        logMessage += ` Su efecto empieza inmediatamente: el rival pierde ${amount} PV.`;
      }

      const winResult = checkWinner(players);
      const newState: GameState = {
        ...state, players,
        phase: winResult.winner !== null || winResult.isDraw ? 'game-over' : 'playing',
        selection: { kind: 'none' },
        log: addLog(state, logMessage),
        winner: winResult.winner, isDraw: winResult.isDraw,
      };
      return winResult.winner !== null || winResult.isDraw ? newState : checkStalemateEnd(newState);
    }
    case 'SELECT_MAGIC': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card)) return state;
      const eff = action.card.effect;
      // Instant magics that need no target
      if (eff.kind === 'steal_hand_card' || eff.kind === 'hand_swap' || eff.kind === 'revive_monster' ||
          eff.kind === 'destroy_all_field' || eff.kind === 'switch_all_opp_position' ||
          eff.kind === 'draw_cards' || eff.kind === 'clean_opp_field') {
        return applyMagicEffect(state, action.card);
      }
      // Dice damage needs a roll
      if (eff.kind === 'dice_damage') {
        return applyMagicEffect(state, action.card);
      }
      // Mágica 1: se equipa a un Monstruo propio y permanece asociada.
// Field-placed magics need target.
      // Si no existe ningún objetivo legal NO se abre la selección: una
      // selección imposible de resolver dejaría la partida en un estado
      // pendiente que el jugador no puede completar. La Mágica tampoco se
      // consume ni gasta cuota: simplemente no se activa.
      if (eff.kind === 'atk_boost' || eff.kind === 'def_reduce' || eff.kind === 'dice_protection' || eff.kind === 'direct_attack') {
        const lados = magicRequiredSide(action.card) === 'self'
          ? [cp]
          : magicRequiredSide(action.card) === 'enemy'
            ? [cp === 0 ? 1 : 0]
            : [0, 1];
        const hayObjetivo = lados.some((i) =>
          state.players[i].field.some((f) => f !== null && f.magic === null),
        );
        if (!hayObjetivo) {
          const exigido = magicRequiredSide(action.card);
          const mensaje =
            exigido === 'self'
              ? 'no tienes Monstruos propios sin Mágica donde colocarla'
              : exigido === 'enemy'
                ? 'el rival no tiene Monstruos sin Mágica donde colocarla'
                : 'no hay Monstruos sin Mágica donde colocarla';
          return {
            ...state,
            log: addLog(state, `${action.card.name}: ${mensaje}. La Mágica no se utiliza.`),
          };
        }
        return { ...state, selection: { kind: 'place-magic', card: action.card } };
      }
      return state;
    }
    case 'PLACE_MAGIC_ON_MONSTER': {
      return applyMagicEffect(state, action.card, action.fieldUid);
    }
    case 'MAGIC_TARGET_MONSTER': {
      return applyMagicEffect(state, action.card, action.fieldUid);
    }
    case 'MAGIC_INSTANT': {
      return applyMagicEffect(state, action.card);
    }
    case 'START_ATTACK': {
      if (state.phase !== 'playing') return state;
      if (!canAttack(state)) return state;
      const cp = state.currentPlayer;
      const attacker = findFieldMonster(state.players[cp], action.attackerUid);
      if (!attacker || attacker.position !== 'attack' || attacker.hasAttacked) return state;
      const opp = (cp === 0 ? 1 : 0) as 0 | 1;
      const oppField = state.players[opp].field;
      const hasOppMonsters = oppField.some((f) => f !== null);
      
      if (!hasOppMonsters) {
        // Regla 22.3: El rival no tiene Monstruos — ataque directo
        return executeDirectAttack(state, action.attackerUid);
      }
      
      const hasOppDefense = oppField.some((f) => f !== null && f.position === 'defense');
      
      if (attacker.magic?.effect.kind === 'direct_attack') {
         return { ...state, selection: { kind: 'attack-or-direct', attackerUid: action.attackerUid } };
       }

       if (hasOppDefense) {
        // Regla 22.1: obligado a atacar a un Monstruo en Defensa
        return { ...state, selection: { kind: 'attack', attackerUid: action.attackerUid } };
      }
      
      // Regla 22.2: sin Monstruos en Defensa pero sí en Ataque → puede atacar o hacer directo
      return { ...state, selection: { kind: 'attack-or-direct', attackerUid: action.attackerUid } };
    }
    case 'DECLARE_ATTACK': {
      if (state.phase !== 'playing') return state;
      if (!canAttack(state)) return state;
      const cp = state.currentPlayer;
      const opp = (cp === 0 ? 1 : 0) as 0 | 1;
      const attacker = findFieldMonster(state.players[cp], action.attackerUid);
      const defender = findFieldMonster(state.players[opp], action.defenderUid);
      if (!attacker || !defender || attacker.position !== 'attack' || attacker.hasAttacked) return state;
      if (defender.trap) {
        return {
          ...state,
          phase: 'trap-response',
          pendingTrap: {
            attackerUid: action.attackerUid,
            defenderUid: action.defenderUid,
            trap: defender.trap,
            defenderPlayer: opp,
            attackerPlayer: cp,
            attackerCard: attacker.card,
            defenderCard: defender.card,
            defenderPosition: defender.position,
          },
        };
      }
      return executeCombat(state, action.attackerUid, action.defenderUid);
    }
    case 'DIRECT_ATTACK': {
      if (state.phase !== 'playing') return state;
      if (!canAttack(state)) return state;
      const cp = state.currentPlayer;
      const opp = (cp === 0 ? 1 : 0) as 0 | 1;
       const attacker = findFieldMonster(state.players[cp], action.attackerUid);
       if (!attacker || attacker.position !== 'attack' || attacker.hasAttacked) return state;
      // Regla 22.1: no se puede atacar directamente si hay Monstruos en Defensa
      const hasOppDefense = state.players[opp].field.some((f) => f !== null && f.position === 'defense');
      if (hasOppDefense && attacker.magic?.effect.kind !== 'direct_attack') return state;
      return executeDirectAttack(state, action.attackerUid);
    }
    case 'RESOLVE_TRAP': {
      if (state.phase !== 'trap-response' || !state.pendingTrap) return state;
      const pt = state.pendingTrap;
      if (action.activate) {
        const result = applyTrapEffect(state, pt.trap, pt.attackerPlayer, pt.defenderPlayer, pt.attackerUid, pt.defenderUid);
        let newState = result.state;
        // Remove the trap from the defender
        if (newState.phase !== 'dice-roll') {
          const players = [...newState.players] as [PlayerState, PlayerState];
          if (findFieldMonster(players[pt.defenderPlayer], pt.defenderUid)) {
            players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
            newState = { ...newState, players };
          }
        }
        // Si la Trampa ha pedido un dado (Trampas 3 y 6), la fase de dados tiene
        // PRIORIDAD y se sale aquí. Antes se comprobaba más abajo, después del
        // bloque `negateAttack`, que rehacía la fase a 'playing' sin limpiar
        // `pendingDice`: el dado quedaba colgado en una fase normal, `ROLL_DICE`
        // ya no se aceptaba y la partida se congelaba para siempre.
        //
        // `pendingTrap` se conserva a propósito: `ROLL_DICE` lo necesita para
        // resolver estas dos Trampas, y lo limpia al terminar.
        if (newState.phase === 'dice-roll') {
          // Las Trampas de dado son de un solo uso: se consumen al activarse,
          // independientemente de que la tirada acierte o falle.
          const diceTrapKinds = new Set(['dice_count_field', 'dice_4plus_destroy']);
          if (diceTrapKinds.has(pt.trap.effect.kind)) {
            const players = [...newState.players] as [PlayerState, PlayerState];
            consumeAttachedTrap(players, pt.defenderPlayer, pt.defenderUid);
            newState = { ...newState, players };
          }
          return { ...newState, selection: { kind: 'none' } };
        }
        if (result.negateAttack) {
          if (!result.destroyAttacker) {
            const players = [...newState.players] as [PlayerState, PlayerState];
            if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
              players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
              newState = { ...newState, players };
            }
          }
          newState = { ...newState, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } };
          const winResult = checkWinner(newState.players);
          if (winResult.winner !== null || winResult.isDraw) return { ...newState, phase: 'game-over', winner: winResult.winner, isDraw: winResult.isDraw };
          return newState;
        }
        return executeCombat({ ...newState, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } }, pt.attackerUid, pt.defenderUid);
      } else {
        // Don't activate — remove trap and proceed with combat
        const players = [...state.players] as [PlayerState, PlayerState];
        players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
        return executeCombat({ ...state, players, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } }, pt.attackerUid, pt.defenderUid);
      }
    }
    case 'CHANGE_POSITION': {
      if (state.phase !== 'playing') return state;
      if (state.turnCount === 0) return state;
      const cp = state.currentPlayer;
      const fm = findFieldMonster(state.players[cp], action.fieldUid);
      if (!fm || fm.hasChangedPosition) return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = updateFieldMonster(players[cp], action.fieldUid, (f) => ({
        ...f,
        position: f.position === 'attack' ? 'defense' : 'attack',
        // Regla 13: un Monstruo que cambia de posición queda boca arriba y ya
        // no vuelve a ocultarse por cambios de posición.
        faceDown: false,
        hasChangedPosition: true,
      }));
      const newState: GameState = { ...state, players, log: addLog(state, `${fm.card.name} cambia a ${fm.position === 'attack' ? 'Defensa' : 'Ataque'}.`) };
      return checkStalemateEnd(newState);
    }
    case 'END_TURN': {
      if (state.phase !== 'playing') return state;
      const nextPlayer = (state.currentPlayer === 0 ? 1 : 0) as 0 | 1;
      const players = [...state.players] as [PlayerState, PlayerState];
      // Reset de marcas del jugador que termina el turno.
      players[state.currentPlayer] = {
        ...players[state.currentPlayer],
        field: players[state.currentPlayer].field.map((f) =>
          f ? { ...f, hasAttacked: false, hasChangedPosition: false } : f,
        ),
      };
      // Regla 19 — `summonedThisTurn` solo tiene sentido dentro del turno en el
      // que el Monstruo entró al campo, así que se limpia en la frontera de
      // turno para AMBOS jugadores. Así los Monstruos que cambiaron de
      // controlador (Trampa 7/10) tampoco quedan bloqueados en el turno
      // siguiente de quien los controla.
      for (const idx of [0, 1] as const) {
        players[idx] = {
          ...players[idx],
          field: players[idx].field.map((f) => (f ? { ...f, summonedThisTurn: false } : f)),
        };
      }
      // Draw 2 for next player
      players[nextPlayer] = drawCards(players[nextPlayer], 2);
      players[nextPlayer] = { ...players[nextPlayer], cardsPlayedThisTurn: 0 };
      const newTurn = state.turnCount + 1;
      let newState: GameState = {
        ...state,
        players,
        currentPlayer: nextPlayer,
        turnCount: newTurn,
        selection: { kind: 'none' },
        passTarget: nextPlayer,
        phase: state.mode === 'cpu' || state.mode === 'online' ? 'playing' : 'pass',
        log: addLog(state, `Comienza su turno.`, nextPlayer),
      };
      // Apply turn start passive effects
      newState = applyTurnStartEffects(newState, nextPlayer);
      const winResult = checkWinner(newState.players);
      if (winResult.winner !== null || winResult.isDraw) return { ...newState, phase: 'game-over', winner: winResult.winner, isDraw: winResult.isDraw };
      // Regla 27.2: comprobar si ningún jugador puede realizar acciones legales
      return checkStalemateEnd(newState);
    }
    case 'CLOSE_DICE_RESULT': {
      if (state.phase !== 'dice-roll' || state.diceResult === null) return state;

      // Cierre de seguridad de la ventana de resultado. La tirada ya se ha
      // resuelto al ejecutar ROLL_DICE; aquí solo se libera la interfaz.
      return {
        ...state,
        phase: 'playing',
        pendingDice: null,
        diceResult: null,
      };
    }

    case 'ROLL_DICE': {
      if (state.phase !== 'dice-roll' || !state.pendingDice) return state;
      const roll = action.roll;
      const reason = state.pendingDice.reason;
      const players = [...state.players] as [PlayerState, PlayerState];
      const log: string[] = [`🎲 Dado: ${roll} (${reason})`];

      // Handle trap 3 (dice_count_field) or trap 6 (dice_4plus_destroy) or magic 11 (dice_damage)
      if (reason.includes('conteo') || reason.includes('Dado y conteo')) {
        // Trap 3: count from the trap's monster
        const pt = state.pendingTrap;
        if (pt) {
          // Regla 29.3: empieza en la Trampa, sigue a la derecha por su fila,
          // después recorre la fila rival de izquierda a derecha. Las casillas
          // vacías no cuentan y el recorrido es circular.
          const allMonsters = getTrap3CountingOrder(players, pt.defenderPlayer, pt.defenderUid);
          if (allMonsters.length > 0) {
            const target = allMonsters[(roll - 1) % allMonsters.length];
            removeFieldMonster(players, target.player, target.fm.uid);
            log.push(`${target.fm.card.name} destruido por conteo.`);
          }
          // La Trampa 3 ya fue consumida al activarse (RESOLVE_TRAP).
          // Aquí solo se resuelve el resultado del dado.
          // Mark attacker as having attacked
          if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
            players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
          }
        }
      } else if (reason.includes('4+') || reason.includes('Dado 4')) {
        const pt = state.pendingTrap;
        if (pt) {
          if (roll >= 4) {
            removeFieldMonster(players, pt.attackerPlayer, pt.attackerUid);
            log.push(`¡${roll} ≥ 4! Atacante destruido.`);
          } else {
            log.push(`${roll} < 4. Sin efecto.`);
            if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
              players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
            }
          }
          // La Trampa 6 ya fue consumida al activarse (RESOLVE_TRAP).
          // Aquí solo se resuelve el resultado del dado.
        }
      } else if (reason.includes('dado') || reason.includes('Daño por dado')) {
        // Magic 11: dice damage
        const cp = state.currentPlayer;
        const opp = (cp === 0 ? 1 : 0) as 0 | 1;
        players[opp] = applyDamage(players[opp], roll);
        log.push(`${roll} PV de daño al rival.`);
        // consume the magic card
        const me = state.currentPlayer;
        const magicCard = state.players[me].hand.find((c) => c.type === 'magic' && c.name.includes('dado'));
        if (magicCard) players[me] = playCardFromHand(players[me], magicCard);
      }

      const winResult = checkWinner(players);
      return {
        ...state,
        players,
        phase: winResult.winner !== null || winResult.isDraw ? 'game-over' : 'playing',
        pendingTrap: null,
        pendingDice: null,
        diceResult: roll,
        selection: { kind: 'none' },
        log: addLog(state, log.join(' ')),
        winner: winResult.winner,
        isDraw: winResult.isDraw,
      };
    }
    case 'TRAP_2_SELECT_OWN': {
      if (state.selection.kind !== 'choose-trap-2-own') return state;
      const sel = state.selection;
      if (sel.selectedUids.includes(action.fieldUid)) return state;

      const players = [...state.players] as [PlayerState, PlayerState];
      const owner = state.currentPlayer;
      const selected = findFieldMonster(players[owner], action.fieldUid);
      if (!selected) return state;

      const selectedUids = [...sel.selectedUids, action.fieldUid];
      if (selectedUids.length < 2) {
        return {
          ...state,
          selection: { ...sel, selectedUids },
          log: addLog(state, `${selected.card.name} seleccionado para la Trampa. Elige 1 Monstruo propio más.`),
        };
      }

      const opponent = (owner === 0 ? 1 : 0) as 0 | 1;
      const opponentTarget = players[opponent].field.find((f): f is FieldMonster => f !== null);
      if (!opponentTarget) return state;

      const first = findFieldMonster(players[owner], selectedUids[0]);
      const second = findFieldMonster(players[owner], selectedUids[1]);
      const trapFm = players[owner].field.find((f) => f?.uid === sel.trapUid);
      selectedUids.forEach((uid) => removeFieldMonster(players, owner, uid));
      removeFieldMonster(players, opponent, opponentTarget.uid);

      // Si el Monstruo que llevaba la Trampa no fue uno de los elegidos,
      // la Trampa se consume al resolver el efecto.
      if (trapFm && !selectedUids.includes(sel.trapUid)) {
        const remainingTrapFm = players[owner].field.find((f) => f?.uid === sel.trapUid);
        if (remainingTrapFm) {
          players[owner] = updateFieldMonster(players[owner], sel.trapUid, (f) => ({ ...f, trap: null }));
        }
      }

      const winResult = checkWinner(players);
      const newState: GameState = {
        ...state,
        players,
        phase: winResult.winner !== null || winResult.isDraw ? 'game-over' : 'playing',
        selection: { kind: 'none' },
        log: addLog(state, `Trampa 2: destruyes ${first?.card.name ?? 'un Monstruo'}, ${second?.card.name ?? 'un Monstruo'} y ${opponentTarget.card.name} del rival.`, owner),
        winner: winResult.winner,
        isDraw: winResult.isDraw,
      };
      return checkStalemateEnd(newState);
    }
    case 'DESTROY_MONSTER': {
      if (state.selection.kind !== 'choose-destroy-target') return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      const target = findFieldMonster(players[state.currentPlayer], action.fieldUid);
      if (!target) return state;
      removeFieldMonster(players, state.currentPlayer, action.fieldUid);
      // Eliminar la trampa del monstruo que la activó (si sigue existiendo)
      const trapUid = state.selection.kind === 'choose-destroy-target' ? state.selection.trapUid : null;
      if (trapUid) {
        const trapFm = players[state.currentPlayer].field.find((f) => f?.uid === trapUid);
        if (trapFm) {
          players[state.currentPlayer] = updateFieldMonster(players[state.currentPlayer], trapUid, (f) => ({ ...f, trap: null }));
        }
      }
      const winResult = checkWinner(players);
      const newState: GameState = {
        ...state,
        players,
        phase: winResult.winner !== null || winResult.isDraw ? ('game-over' as const) : ('playing' as const),
        selection: { kind: 'none' },
        log: addLog(state, `${target.card.name} destruido por Trampa 9.`),
        winner: winResult.winner,
        isDraw: winResult.isDraw,
      };
      return checkStalemateEnd(newState);
    }
    case 'REVIVE_CHOICE': {
      if (state.selection.kind !== 'revive-choice') return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      const me = state.currentPlayer;
      const monsters = players[me].graveyard.filter((c) => c.type === 'monster') as MonsterCard[];
      if (monsters.length === 0) return state;
      const log: string[] = [];
      // Ir a la mano exige hueco y que la carta NO esté ya representada por otra
      // copia PROPIA (decisión del creador). No es una prohibición general de
      // duplicados: la copia del rival en la mano no lo impide.
      const candidates =
        action.choice === 'hand'
          ? monsters.filter((c) => !hasOwnCopy(players[me].hand, c))
          : monsters;
      if (candidates.length === 0) return state;
      const sorted = [...candidates].sort((a, b) => b.atk - a.atk);
      const revived = sorted[0];
      if (action.choice === 'hand') {
        if (players[me].hand.length >= MAX_HAND_SIZE) return state;
        players[me] = {
          ...players[me],
          hand: [...players[me].hand, revived],
          graveyard: players[me].graveyard.filter((c) => c.id !== revived.id),
        };
        log.push(`${action.card.name}: ${revived.name} recuperado del cementerio a la mano.`);
      } else {
        const slot = getFirstEmptySlot(players[me]);
        // Si no hay hueco, la carta NO se retira del cementerio (no se pierde).
        if (slot === -1) return state;
        if (state.turnCount === 0 && action.position === 'attack') return state;
        const position = state.turnCount === 0 ? 'defense' : (action.position ?? 'attack');
        const fm: FieldMonster = {
          uid: genUid(),
          card: revived,
          position,
          faceDown: position === 'defense',
          trap: null,
          magic: null,
          hasAttacked: true,
          hasChangedPosition: false,
          summonedThisTurn: true,
          pendingTurns: 0,
          pendingEffect: null,
          controlledBy: null,
          tempAtkModifier: 0,
          tempDefModifier: 0,
          diceProtection: false,
        };
        players[me] = {
          ...players[me],
          graveyard: players[me].graveyard.filter((c) => c.id !== revived.id),
          field: players[me].field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[],
        };
        log.push(`${action.card.name}: ${revived.name} revivido del cementerio al campo en posición ${position === 'attack' ? 'Ataque' : 'Defensa'}.`);
      }
      // Consumir la carta de la mano
      players[me] = playCardFromHand(players[me], action.card);
      const winResult = checkWinner(players);
      const newState: GameState = {
        ...state,
        players,
        phase: winResult.winner !== null || winResult.isDraw ? ('game-over' as const) : ('playing' as const),
        selection: { kind: 'none' },
        log: addLog(state, log.join(' ')),
        winner: winResult.winner,
        isDraw: winResult.isDraw,
      };
      return checkStalemateEnd(newState);
    }
    case 'CANCEL_SELECTION': {
      return { ...state, selection: { kind: 'none' } };
    }
    case 'RESTART': {
      return initialState();
    }
    default:
      return state;
  }
}

function executeDirectAttack(state: GameState, attackerUid: string): GameState {
  const cp = state.currentPlayer;
  const opp = (cp === 0 ? 1 : 0) as 0 | 1;
  const players = [...state.players] as [PlayerState, PlayerState];
  const attacker = findFieldMonster(players[cp], attackerUid);
  if (!attacker) return state;
  const dmg = getEffectiveAtk(attacker);
  players[opp] = applyDamage(players[opp], dmg);
  players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
  const winResult = checkWinner(players);
  const combat: CombatResult = {
    attackerDestroyed: false,
    defenderDestroyed: false,
    attackerDamage: 0,
    defenderDamage: dmg,
    log: `${attacker.card.name} ataca directamente. ${dmg} PV al rival.`,
    attackerUid,
    defenderUid: 'lp-' + opp,
    attackerPlayer: cp,
    attackerCard: attacker.card,
  };
  return {
    ...state,
    players,
    phase: winResult.winner !== null || winResult.isDraw ? 'game-over' : 'playing',
    selection: { kind: 'none' },
    log: addLog(state, `${attacker.card.name} ataca directamente. ${dmg} PV al rival.`),
    lastCombat: combat,
    winner: winResult.winner,
    isDraw: winResult.isDraw,
  };
}

// Función para resolver el sistema de dados de la Mágica 9
// Ambos jugadores lanzan un dado, gana el resultado más alto
// En empate se repite
function resolveDiceProtection(): { ownerRoll: number; opponentRoll: number; ownerWins: boolean } {
  let ownerRoll = rollDie();
  let opponentRoll = rollDie();
  while (ownerRoll === opponentRoll) {
    ownerRoll = rollDie();
    opponentRoll = rollDie();
  }
  return { ownerRoll, opponentRoll, ownerWins: ownerRoll > opponentRoll };
}

function executeCombat(state: GameState, attackerUid: string, defenderUid: string): GameState {
  const cp = state.currentPlayer;
  const opp = (cp === 0 ? 1 : 0) as 0 | 1;
  const players = [...state.players] as [PlayerState, PlayerState];
  const attacker = findFieldMonster(players[cp], attackerUid);
  const defender = findFieldMonster(players[opp], defenderUid);
  if (!attacker || !defender) return state;

  const discoveredTrap = defender.trap;
  if (discoveredTrap) {
    players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, faceDown: false, trapRevealed: true }));
  } else if (defender.faceDown) {
    players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, faceDown: false }));
  }

  const result: CombatResult = {
    ...resolveCombat(attacker, defender),
    attackerUid,
    defenderUid,
    attackerPlayer: cp,
    attackerCard: attacker.card,
    defenderCard: defender.card,
  };
  const hasReflect = defender.trap?.effect.kind === 'reflect_damage';
  const trapDiscoveryLog = defender.trap ? ` ¡Trampa descubierta: ${defender.trap.name}. ${defender.trap.description}` : '';

  if (result.attackerDestroyed) {
    // Check dice protection
    if (attacker.diceProtection) {
      const { ownerWins } = resolveDiceProtection();
      if (!ownerWins) {
        // Gana el rival — el monstruo es eliminado
        removeFieldMonster(players, cp, attackerUid);
        players[cp] = applyDamage(players[cp], result.attackerDamage);
        if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
      } else {
        // Gana el propietario — el monstruo sobrevive
        players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
        if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
      }
    } else {
      removeFieldMonster(players, cp, attackerUid);
      if (hasReflect) {
        players[opp] = applyDamage(players[opp], result.attackerDamage);
      } else {
        players[cp] = applyDamage(players[cp], result.attackerDamage);
      }
      if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
    }
  } else {
    players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
    if (result.attackerDamage > 0) {
      if (hasReflect) {
        players[opp] = applyDamage(players[opp], result.attackerDamage);
      } else {
        players[cp] = applyDamage(players[cp], result.attackerDamage);
      }
    }
    if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
  }

  if (result.defenderDestroyed) {
    if (defender.diceProtection) {
      const { ownerWins } = resolveDiceProtection();
      if (!ownerWins) {
        // Gana el rival — el monstruo es eliminado
        removeFieldMonster(players, opp, defenderUid);
        players[opp] = applyDamage(players[opp], result.defenderDamage);
      }
      // Si gana el propietario, el monstruo sobrevive y no hay daño
    } else {
      removeFieldMonster(players, opp, defenderUid);
      players[opp] = applyDamage(players[opp], result.defenderDamage);
    }
  }

  const winResult = checkWinner(players);
  const newState: GameState = {
    ...state,
    players,
    phase: winResult.winner !== null || winResult.isDraw ? ('game-over' as const) : ('playing' as const),
    selection: { kind: 'none' },
    lastCombat: result,
    log: addLog(
      state,
      result.log + trapDiscoveryLog + (result.defenderDestroyed && defender.trap
        ? ` La Trampa ${defender.trap.name} se elimina porque su Monstruo ha sido destruido.`
        : ''),
    ),
    winner: winResult.winner,
    isDraw: winResult.isDraw,
  };
  return checkStalemateEnd(newState);
}

// ============================================================================
// HISTORIAL — inicialización y reductor envolvente
// ============================================================================

/**
 * Envoltura del reductor real del juego. Solo observa: el `GameState` que
 * devuelve es exactamente el que produciría `reducer`.
 */
const historyReducer = makeHistoryReducer(reducer);

/**
 * Arranque. NO restaura el estado de la partida desde el almacenamiento (eso
 * sería cambiar la lógica del juego): solo deja disponible el historial de la
 * última partida para poder consultarlo desde el menú.
 */
function initBundle(): HistoryBundle {
  return { game: initialState(), history: null };
}

export function useGame() {
  // ---------------------------------------------------------------------------
  // HISTORIAL DE LA ÚLTIMA PARTIDA (capa de depuración).
  //
  // `reducer` es una función pura `(state, action) => state`, así que el punto
  // único y fiel de intercepción es envolverla. El estado del juego y la
  // firma de `dispatch` no cambian: `App.tsx` y `GameBoard.tsx` siguen
  // recibiendo exactamente lo mismo.
  // ---------------------------------------------------------------------------
  const [bundle, dispatchBundle] = useReducer(historyReducer, undefined, initBundle);
  const state = bundle.game;

  // Persistencia con limiting: escribir en localStorage en cada movimiento
  // ralentizaría la partida. Se agrupa por tiempo y se fuerza el volcado en
  // los momentos críticos (fin de partida, recarga, salida de la página).
  const storageRef = useRef<HistoryStorage | null>(null);
  if (storageRef.current === null) storageRef.current = getDefaultStorage();
  const lastWriteRef = useRef(0);
  const lastPersistedRef = useRef<MatchHistory | null>(null);

  const persistNow = useCallback((h: MatchHistory) => {
    if (lastPersistedRef.current === h) return;
    saveHistoryTo(storageRef.current, h);
    lastPersistedRef.current = h;
    lastWriteRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!bundle.history) return;
    const h = bundle.history;
    if (h.finished) {
      persistNow(h);
      return;
    }
    if (Date.now() - lastWriteRef.current > 250) {
      persistNow(h);
    }
  }, [bundle.history, persistNow]);

  // Volcado inmediato al cerrar o recargar: garantiza que no se pierda lo que
  // ya se había escrito en el almacenamiento.
  useEffect(() => {
    const flush = () => {
      if (bundle.history) saveHistoryTo(storageRef.current, bundle.history);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [bundle.history]);

  const dispatch = useCallback((action: Action) => {
    dispatchBundle({ action });
  }, []);

  /** Historial guardado en el navegador de una partida anterior. */
  const readStoredHistory = useCallback((): MatchHistory | null => {
    return loadHistoryFrom(storageRef.current);
  }, []);

  const cpuTurnActionsRef = useRef(0);

  useEffect(() => {
    if (state.mode !== 'cpu' || state.currentPlayer !== 1) return;
    if (state.phase !== 'playing' && state.phase !== 'pass') return;

    // Si la CPU no tiene NINGUNA jugada legal en esta fase, no se invoca.
    //
    // Pasa, por ejemplo, cuando el ataque del rival abre la respuesta de una
    // Trampa que es de la CPU: quien debe decidir es el defensor, y aquí es el
    // jugador en turno. Antes la CPU proponía `END_TURN` igualmente, el reducer
    // lo rechazaba por la fase, el estado no cambiaba y el efecto se disparaba
    // otra vez en bucle. `legalActions` sabe a quién le toca en cada fase, así
    // que es también la respuesta a «¿le toca a la CPU?».
    if (legalActions(state, 1).length === 0) {
      cpuTurnActionsRef.current = 0;
      return;
    }

    // Red de seguridad: si el CPU encadena demasiadas acciones en un mismo turno,
    // se fuerza el cierre del turno para evitar bucles o turnos congelados.
    if (cpuTurnActionsRef.current > 60) {
      cpuTurnActionsRef.current = 0;
      dispatch({ type: 'END_TURN' });
      return;
    }
    cpuTurnActionsRef.current += 1;

    const timer = window.setTimeout(() => {
      if (state.phase === 'pass') {
        dispatch({ type: 'CONFIRM_PASS' });
        return;
      }
      dispatch(nextCpuAction(state));
    }, cpuDelay(state.difficulty));

    return () => window.clearTimeout(timer);
    // `dispatch` es estable (useCallback con dependencia []); se incluye solo
    // para satisfacer la regla de hooks exhaustivos.
  }, [state, dispatch]);

  // Reinicia el contador cuando el turno cambia de jugador.
  const previousPlayerRef = useRef(state.currentPlayer);
  useEffect(() => {
    if (previousPlayerRef.current !== state.currentPlayer) {
      previousPlayerRef.current = state.currentPlayer;
      cpuTurnActionsRef.current = 0;
    }
  }, [state.currentPlayer]);

  return {
    state,
    dispatch,
    /** Historial en memoria de la partida en curso (null si aún no hay ninguna). */
    liveHistory: bundle.history,
    /** Historial persistente de la última partida, para la pantalla del menú. */
    readStoredHistory,
  };
}
