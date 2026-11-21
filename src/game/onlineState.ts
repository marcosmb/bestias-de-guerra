import type { Card, MagicCard, MonsterCard, TrapCard } from './cardData.ts';
import type { FieldMonster, GameState, PlayerState } from './types.ts';

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
  if (selection.kind === 'place-magic' || selection.kind === 'magic-target-monster' ||
      selection.kind === 'revive-choice') {
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
  state: GameState,
  viewerIndex: 0 | 1,
): GameState['pendingTrap'] {
  const pendingTrap = state.pendingTrap;
  if (!pendingTrap || pendingTrap.defenderPlayer === viewerIndex) return pendingTrap;

  const defender = state.players[pendingTrap.defenderPlayer].field.find(
    (fieldMonster) => fieldMonster?.uid === pendingTrap.defenderUid,
  );
  return {
    ...pendingTrap,
    trap: hiddenTrap(`hidden-${pendingTrap.defenderPlayer}-pending-trap`),
    // A face-down defender is still secret while its trap response is pending.
    defenderCard: defender?.faceDown
      ? hiddenHandCard(`hidden-${pendingTrap.defenderPlayer}-pending-defender`)
      : pendingTrap.defenderCard,
  };
}


function hiddenCardNames(state: GameState, viewerIndex: 0 | 1): string[] {
  const opponent = state.players[viewerIndex === 0 ? 1 : 0];
  const names = new Set<string>();
  const add = (card: Card | null | undefined) => {
    if (card?.name && card.name !== 'Carta oculta') names.add(card.name);
  };

  // Hand and deck are always private to their owner.
  opponent.hand.forEach(add);
  opponent.deck.forEach(add);

  // Face-down monsters and unrevealed associated traps are also private.
  for (const monster of opponent.field) {
    if (!monster) continue;
    if (monster.faceDown) add(monster.card);
    if (monster.trap && !monster.trapRevealed) add(monster.trap);
    // Associated magic cards are not revealed by the online rules.
    if (monster.magic) add(monster.magic);
  }

  // A pending selection belongs to the active player and can expose its card.
  if (state.currentPlayer !== viewerIndex) {
    const selection = state.selection;
    if (selection.kind === 'place-trap' || selection.kind === 'place-magic' ||
        selection.kind === 'magic-target-monster' || selection.kind === 'revive-choice') {
      add(selection.card);
    }
    for (const pending of state.pendingTurnStartSelections ?? []) {
      if (pending.kind === 'place-trap' || pending.kind === 'place-magic' ||
          pending.kind === 'magic-target-monster' || pending.kind === 'revive-choice') {
        add(pending.card);
      }
    }
  }

  if (state.pendingTrap && state.pendingTrap.defenderPlayer !== viewerIndex) {
    add(state.pendingTrap.trap);
    const defender = opponent.field.find((fieldMonster) =>
      fieldMonster?.uid === state.pendingTrap?.defenderUid);
    if (defender?.faceDown) add(state.pendingTrap.defenderCard);
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function redactHiddenNames(value: string, names: string[]): string {
  return names.reduce((result, name) => {
    let index = result.indexOf(name);
    while (index !== -1) {
      const afterName = index + name.length;
      const numberSuffix = result.slice(afterName).match(/^\\s*\\(\\d+\\)/);
      const end = afterName + (numberSuffix?.[0].length ?? 0);
      result = result.slice(0, index) + 'Carta oculta' + result.slice(end);
      index = result.indexOf(name, index + 'Carta oculta'.length);
    }
    return result;
  }, value);
}
export function filterOnlineState(state: GameState, viewerIndex: 0 | 1): GameState {
  const privateNames = hiddenCardNames(state, viewerIndex);
  return {
    ...state,
    // Historial y último combate también son superficies de salida: sus textos
    // pueden contener nombres de cartas que siguen ocultas para este jugador.
    log: state.log.map((entry) => redactHiddenNames(entry, privateNames)),
    lastCombat: state.lastCombat ? {
      ...state.lastCombat,
      log: redactHiddenNames(state.lastCombat.log, privateNames),
      attackerCard: state.lastCombat.attackerCard && privateNames.includes(state.lastCombat.attackerCard.name)
        ? hiddenHandCard('hidden-last-combat-attacker')
        : state.lastCombat.attackerCard,
      defenderCard: state.lastCombat.defenderCard && privateNames.includes(state.lastCombat.defenderCard.name)
        ? hiddenHandCard('hidden-last-combat-defender')
        : state.lastCombat.defenderCard,
    } : null,
    selection: state.currentPlayer === viewerIndex
      ? state.selection
      : hidePendingCardSelection(state.selection, state.currentPlayer),
    pendingTurnStartSelections: state.pendingTurnStartSelections?.map((selection) =>
      state.currentPlayer === viewerIndex
        ? selection
        : hidePendingCardSelection(selection, state.currentPlayer),
    ),
    pendingTrap: hidePendingTrap(state, viewerIndex),
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
