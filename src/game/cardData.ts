export type Suit = 'espadas' | 'bastos' | 'copas' | 'oros';
export type CardType = 'monster' | 'trap' | 'magic';

/**
 * Propiedad de una carta (Regla 6).
 *
 * La propiedad pertenece SIEMPRE al jugador cuyo mazo originó la carta y NUNCA
 * cambia. Un efecto puede alterar el CONTROL de un Monstruo (Trampa 7/10) o
 * pasar una carta a la mano de otro jugador (Mágica 2), pero la carta sigue
 * siendo del mismo dueño: cuando acaba en un cementerio va al de su propietario.
 *
 * `undefined` significa "sin propietario marcado" y solo ocurre en cartas
 * construidas a mano en pruebas.
 */
export type CardOwner = 0 | 1;

/**
 * Identidad de una COPIA FÍSICA concreta de una carta.
 *
 * `Card.id` identifica el TIPO de carta (el Kraken, la Araña, la Mágica 8...):
 * es el mismo valor en las dos copias que existen en la partida, una por mazo.
 *
 * `Card.instanceId` identifica esa copia concreta. Es único de por vida, viaja
 * con la carta a donde vaya (mano, campo, cementerio, mano del rival) y NO
 * cambia nunca.
 *
 * Hace falta porque la Mágica 2 puede robar la copia del RIVAL: es legal que una
 * mano tenga a la vez la Araña del Jugador 1 y la Araña del Jugador 2. Dos
 * objetos carta distintos con el MISMO `id` necesitan dos `instanceId` distintos
 * para que React pueda identificarlos y para poder jugar uno sin jugar el otro.
 *
 * Nunca se usa como identidad de tipo: `id` sigue siendo el identificador de la
 * carta y es el que consultan las reglas (efectos, cementerios, duplicados).
 */
export type CardInstanceId = string;

export interface MonsterCard {
  /** Identidad del TIPO de carta. Compartida por las dos copias de la partida. */
  id: string;
  type: 'monster';
  suit: 'espadas' | 'bastos';
  number: number;
  name: string;
  atk: number;
  def: number;
  image: string;
  /** Propietario original (Regla 6). Lo fija `createPlayer`. */
  owner?: CardOwner;
  /** Identidad de ESTA copia física. Única e inmutable. La fija `createPlayer`. */
  instanceId?: CardInstanceId;
}

export interface TrapCard {
  /** Identidad del TIPO de carta. Compartida por las dos copias de la partida. */
  id: string;
  type: 'trap';
  suit: 'copas';
  number: number;
  name: string;
  description: string;
  effect: TrapEffect;
  image: string;
  /** Propietario original (Regla 6). Lo fija `createPlayer`. */
  owner?: CardOwner;
  /** Identidad de ESTA copia física. Única e inmutable. La fija `createPlayer`. */
  instanceId?: CardInstanceId;
}

export interface MagicCard {
  /** Identidad del TIPO de carta. Compartida por las dos copias de la partida. */
  id: string;
  type: 'magic';
  suit: 'oros';
  number: number;
  name: string;
  description: string;
  effect: MagicEffect;
  placement: 'instant' | 'field';
  image?: string;
  /** Propietario original (Regla 6). Lo fija `createPlayer`. */
  owner?: CardOwner;
  /** Identidad de ESTA copia física. Única e inmutable. La fija `createPlayer`. */
  instanceId?: CardInstanceId;
}

export type Card = MonsterCard | TrapCard | MagicCard;

// --- Trap effects (12 Copas) ---
export type TrapEffect =
  | { kind: 'heal_per_turn'; amount: number }       // 1: +5 PV/turno
  | { kind: 'destroy_2_self_1_opp' }                 // 2: destruye 2 propios + 1 rival
  | { kind: 'dice_count_field' }                    // 3: dado + conteo campo
  | { kind: 'reflect_damage' }                       // 4: devolver daño
  | { kind: 'negate_destroy_card' }                 // 5: negar ataque + destruir trampa/mágica rival
  | { kind: 'dice_4plus_destroy' }                   // 6: dado 4+ destruye atacante
  | { kind: 'swap_attacker' }                        // 7: cambiar atacante por tuyo
  | { kind: 'destroy_attacker' }                    // 8: eliminar atacante
  | { kind: 'three_turns_kill' }                     // 9: tres turnos mata
  | { kind: 'control_two_turns' }                    // 10: control 2 turnos
  | { kind: 'death_after_two_turns' }               // 11: muerte tras 2 turnos
  | { kind: 'damage_per_turn'; amount: number };    // 12: -5 PV/turno al rival

// --- Magic effects (12 Oros) ---
export type MagicEffect =
  | { kind: 'direct_attack' }                        // 1: ataque directo a PV
  | { kind: 'steal_hand_card' }                      // 2: robar carta de la mano
  | { kind: 'hand_swap' }                            // 3: cambio de mano
  | { kind: 'atk_boost'; amount: number }            // 4: +2 ATQ (colocada)
  | { kind: 'revive_monster' }                       // 5: recuperar del cementerio
  | { kind: 'destroy_all_field' }                    // 6: destrucción total
  | { kind: 'switch_all_opp_position' }              // 7: cambio posición rival
  | { kind: 'def_reduce'; amount: number }           // 8: -2 DEF (colocada)
  | { kind: 'dice_protection' }                      // 9: protección por dado (colocada)
  | { kind: 'draw_cards'; amount: number }           // 10: robar 2
  | { kind: 'dice_damage' }                          // 11: daño por dado
  | { kind: 'clean_opp_field' };                    // 12: limpieza campo rival

export const TRAPS: TrapCard[] = [
  { id: 't1', type: 'trap', suit: 'copas', number: 1, name: '+5 PV por turno', description: 'Cada turno que esta carta esté en un Monstruo, ganas 5 PV.', effect: { kind: 'heal_per_turn', amount: 5 }, image: '/cards/copas-1.webp' },
  { id: 't2', type: 'trap', suit: 'copas', number: 2, name: 'Destrucción 2+1', description: 'Destrúyese a sí misma: destruye 2 Monstruos tuyos y 1 del rival.', effect: { kind: 'destroy_2_self_1_opp' }, image: '/cards/copas-2.webp' },
  { id: 't3', type: 'trap', suit: 'copas', number: 3, name: 'Dado y conteo', description: 'Tira el dado, cuenta desde este Monstruo (izq→der, saltando huecos). El Monstruo donde cae se destruye.', effect: { kind: 'dice_count_field' }, image: '/cards/copas-3.webp' },
  { id: 't4', type: 'trap', suit: 'copas', number: 4, name: 'Devolver daño', description: 'El daño que recibas al morir un Monstruo se devuelve al adversario.', effect: { kind: 'reflect_damage' }, image: '/cards/copas-4.webp' },
  { id: 't5', type: 'trap', suit: 'copas', number: 5, name: 'Negar ataque', description: 'Niega el ataque y destruye una Trampa o Mágica del adversario.', effect: { kind: 'negate_destroy_card' }, image: '/cards/copas-5.webp' },
  { id: 't6', type: 'trap', suit: 'copas', number: 6, name: 'Dado 4+', description: 'Tira el dado. Si sale 4 o más, el Monstruo atacante se destruye.', effect: { kind: 'dice_4plus_destroy' }, image: '/cards/copas-6.webp' },
  { id: 't7', type: 'trap', suit: 'copas', number: 7, name: 'Cambiar atacante', description: 'Cambia el Monstruo que te ataca por el tuyo.', effect: { kind: 'swap_attacker' }, image: '/cards/copas-7.webp' },
  { id: 't8', type: 'trap', suit: 'copas', number: 8, name: 'Eliminar atacante', description: 'Elimina al Monstruo que te ha atacado.', effect: { kind: 'destroy_attacker' }, image: '/cards/copas-8.webp' },
  { id: 't9', type: 'trap', suit: 'copas', number: 9, name: 'Tres turnos', description: 'Puesta, en tres turnos destruye un Monstruo.', effect: { kind: 'three_turns_kill' }, image: '/cards/copas-9.webp' },
  { id: 't10', type: 'trap', suit: 'copas', number: 10, name: 'Control 2 turnos', description: 'El Monstruo que te ataca es tuyo durante dos turnos.', effect: { kind: 'control_two_turns' }, image: '/cards/copas-10.webp' },
  { id: 't11', type: 'trap', suit: 'copas', number: 11, name: 'Muerte 2 turnos', description: 'El Monstruo atacante muere después de dos turnos.', effect: { kind: 'death_after_two_turns' }, image: '/cards/copas-11.webp' },
  { id: 't12', type: 'trap', suit: 'copas', number: 12, name: '-5 PV por turno', description: 'Al colocarse hace perder 5 PV inmediatamente. Después, cada turno que esta carta permanezca en un Monstruo, el rival pierde 5 PV.', effect: { kind: 'damage_per_turn', amount: 5 }, image: '/cards/copas-12.webp' },
];

export const MAGICS: MagicCard[] = [
  { id: 'm1', type: 'magic', suit: 'oros', number: 1, name: 'Ataque directo', description: 'Se coloca sobre un Monstruo. Mientras permanezca asociada, ese Monstruo puede elegir entre atacar a cualquier Monstruo rival o atacar directamente a los PV del adversario, incluso si el rival tiene Monstruos en Defensa.', effect: { kind: 'direct_attack' }, placement: 'field' },
  { id: 'm2', type: 'magic', suit: 'oros', number: 2, name: 'Robar de la mano', description: 'Coge una carta de la mano del adversario sin mirar.', effect: { kind: 'steal_hand_card' }, placement: 'instant' },
  { id: 'm3', type: 'magic', suit: 'oros', number: 3, name: 'Cambio de mano', description: 'Todos se descartan la mano y roban 5 cartas del mazo.', effect: { kind: 'hand_swap' }, placement: 'instant' },
  { id: 'm4', type: 'magic', suit: 'oros', number: 4, name: '+2 de ataque', description: 'Mientras esté colocada, el Monstruo tiene +2 de ataque.', effect: { kind: 'atk_boost', amount: 2 }, placement: 'field' },
  { id: 'm5', type: 'magic', suit: 'oros', number: 5, name: 'Recuperar Monstruo', description: 'Coge un Monstruo de tu cementerio.', effect: { kind: 'revive_monster' }, placement: 'instant' },
  { id: 'm6', type: 'magic', suit: 'oros', number: 6, name: 'Destrucción total', description: 'Destruye todas las cartas del campo de batalla.', effect: { kind: 'destroy_all_field' }, placement: 'instant' },
  { id: 'm7', type: 'magic', suit: 'oros', number: 7, name: 'Cambio posición rival', description: 'Todas las cartas del rival cambian de posición.', effect: { kind: 'switch_all_opp_position' }, placement: 'instant' },
  { id: 'm8', type: 'magic', suit: 'oros', number: 8, name: '-2 de defensa', description: 'Mientras esté colocada, el Monstruo tiene -2 de defensa.', effect: { kind: 'def_reduce', amount: 2 }, placement: 'field' },
  { id: 'm9', type: 'magic', suit: 'oros', number: 9, name: 'Protección por dado', description: 'Este Monstruo solo puede ser eliminado en una tirada de dados.', effect: { kind: 'dice_protection' }, placement: 'field' },
  { id: 'm10', type: 'magic', suit: 'oros', number: 10, name: 'Robar dos cartas', description: 'Roba 2 cartas y destruye esta carta.', effect: { kind: 'draw_cards', amount: 2 }, placement: 'instant' },
  { id: 'm11', type: 'magic', suit: 'oros', number: 11, name: 'Daño por dado', description: 'Tira el dado y el resultado se resta a los PV del rival.', effect: { kind: 'dice_damage' }, placement: 'instant' },
  { id: 'm12', type: 'magic', suit: 'oros', number: 12, name: 'Limpieza del campo rival', description: 'Quita todos los Monstruos, Trampas y Mágicas del rival del campo.', effect: { kind: 'clean_opp_field' }, placement: 'instant' },
];

export const SUIT_COLORS: Record<Suit, { from: string; to: string; accent: string; label: string }> = {
  espadas: { from: '#1a1a2e', to: '#0d0d1a', accent: '#60a5fa', label: 'Espadas' },
  bastos: { from: '#1a2a1a', to: '#0d1a0d', accent: '#a3e635', label: 'Bastos' },
  copas: { from: '#2a1a1a', to: '#1a0d0d', accent: '#f87171', label: 'Copas' },
  oros: { from: '#2a2a1a', to: '#1a1a0d', accent: '#fbbf24', label: 'Oros' },
};

export function buildMonsterCards(suit: 'espadas' | 'bastos'): MonsterCard[] {
  const names: Record<string, string[]> = {
    espadas: ['Duende', 'Lobo', 'Escarabajo', 'Orco', 'Serpiente', 'Esqueleto', 'Troll', 'Golem', 'Demonio', 'Kraken', 'Dragón', 'Dragón ancestral'],
    bastos: ['Sapo', 'Zorro', 'Araña', 'Bestia', 'Lagarto', 'Espectro', 'Ent', 'Autómata', 'Hechicero', 'Leviatán', 'Ave tormenta', 'Bestia divina'],
  };
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return {
      id: `m-${suit}-${n}`,
      type: 'monster' as const,
      suit,
      number: n,
      name: names[suit][i],
      atk: n,
      def: n,
      image: `/cards/${suit}-${n}.webp`,
    };
  });
}

export function buildTrapCards(): TrapCard[] {
  return TRAPS.map((t) => ({ ...t }));
}

export function buildMagicCards(): MagicCard[] {
  return MAGICS.map((m) => ({ ...m }));
}

export function buildDeck(): Card[] {
  return [
    ...buildMonsterCards('espadas'),
    ...buildMonsterCards('bastos'),
    ...buildTrapCards(),
    ...buildMagicCards(),
  ];
}

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}
