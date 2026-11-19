import type { Card, MagicCard, MonsterCard, TrapCard } from './cardData';
import type { FieldMonster, GameState, PlayerState } from './types';

function hiddenHandCard(key: string): MonsterCard {
  return {
    id: key,
    type: 'monster',
    suit: 'espadas',
    number: 0,
    name: 'Carta oculta',
    atk: 0,
    def: 0,
    image: '/cards/reverso-carta_2.jpg',
    instanceId: key,
  };
}

function hiddenTrap(key: string): TrapCard {
  return {
    id: key,
    type: 'trap',
    suit: 'copas',
    number: 0,
    name: 'Carta oculta',
    description: 'Carta oculta',
    effect: { kind: 'heal_per_turn', amount: 0 },
    image: '/cards/reverso-carta_2.jpg',
    instanceId: key,
  };
}

function hiddenMagic(key: string): MagicCard {
  return {
    id: key,
    type: 'magic',
    suit: 'oros',
    number: 0,
    name: 'Carta oculta',
    description: 'Carta oculta',
    effect: { kind: 'dice_damage' },
    placement: 'instant',
    image: '/cards/reverso-carta_2.jpg',
    instanceId: key,
  };
}

function hiddenAssociatedCard(card: TrapCard | MagicCard, key: string): TrapCard | MagicCard {
  return card.type === 'trap' ? hiddenTrap(key) : hiddenMagic(key);
}

function hidePendingCardSelection(
  selection: GameState['selection'],
  playerIndex: 0 | 1,
): GameState['selection'] {
  const key = `hidden-${playerIndex}-selection`;
  if (selection.kind === 'place-trap') {
    return { ...selection, card: hiddenTrap(key) };
  }
  if (selection.kind === 'place-magic' || selection.kind === 'magic-target-monster') {
    return { ...selection, card: hiddenMagic(key) };
  }
  return selection;
}

function hideFieldMonster(fm: FieldMonster, playerIndex: 0 | 1, slot: number): FieldMonster {
  return {
    ...fm,
    card: fm.faceDown ? hiddenHandCard(`hidden-${playerIndex}-field-${slot}-monster`) : fm.card,
    trap: fm.trap && !fm.trapRevealed
      ? hiddenAssociatedCard(fm.trap, `hidden-${playerIndex}-field-${slot}-trap`) as TrapCard
      : fm.trap,
    magic: fm.magic
      ? hiddenAssociatedCard(fm.magic, `hidden-${playerIndex}-field-${slot}-magic`) as MagicCard
      : null,
  };
}

function hidePendingTrap(
  pendingTrap: GameState['pendingTrap'],
  viewerIndex: 0 | 1,
): GameState['pendingTrap'] {
  if (!pendingTrap || pendingTrap.defenderPlayer === viewerIndex) return pendingTrap;
  return {
    ...pendingTrap,
    trap: hiddenTrap(`hidden-${pendingTrap.defenderPlayer}-pending-trap`),
  };
}

export function filterOnlineState(state: GameState, viewerIndex: 0 | 1): GameState {
  return {
    ...state,
    selection: state.currentPlayer === viewerIndex
      ? state.selection
      : hidePendingCardSelection(state.selection, state.currentPlayer),
    pendingTurnStartSelections: state.pendingTurnStartSelections?.map((selection) =>
      state.currentPlayer === viewerIndex
        ? selection
        : hidePendingCardSelection(selection, state.currentPlayer),
    ),
    pendingTrap: hidePendingTrap(state.pendingTrap, viewerIndex),
    players: state.players.map((player, index) => {
      if (index === viewerIndex) return player;

      const playerIndex = index as 0 | 1;
      return {
        ...player,
        hand: player.hand.map((_, cardIndex) =>
          hiddenHandCard(`hidden-${playerIndex}-hand-${cardIndex}`),
        ) as Card[],
        deck: player.deck.map((_, cardIndex) =>
          hiddenHandCard(`hidden-${playerIndex}-deck-${cardIndex}`),
        ) as Card[],
        field: player.field.map((fm, slot) =>
          fm ? hideFieldMonster(fm, playerIndex, slot) : null,
        ),
      };
    }) as [PlayerState, PlayerState],
  };
}
