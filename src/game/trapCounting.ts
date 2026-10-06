import type { FieldMonster, PlayerState } from './types';

export type Trap3CountTarget = {
  fm: FieldMonster;
  player: 0 | 1;
};

/**
 * Orden de conteo de la Trampa 3.
 *
 * Se empieza en el Monstruo que lleva la Trampa y se avanza hacia la derecha
 * por su propia fila. Al terminar esa fila, se recorre la fila rival de
 * izquierda a derecha. Las casillas vacías nunca cuentan.
 *
 * El resultado se trata como un recorrido circular: una vez agotados todos los
 * Monstruos del campo, se vuelve al primero del recorrido.
 */
export function getTrap3CountingOrder(
  players: [PlayerState, PlayerState],
  startPlayer: 0 | 1,
  startUid: string,
): Trap3CountTarget[] {
  const otherPlayer = startPlayer === 0 ? 1 : 0;
  const startField = players[startPlayer].field;
  const startSlot = startField.findIndex((fm) => fm?.uid === startUid);

  const order: Trap3CountTarget[] = [];

  const addSlots = (player: 0 | 1, slots: number[]) => {
    for (const slot of slots) {
      const fm = players[player].field[slot];
      if (fm) order.push({ fm, player });
    }
  };

  if (startSlot >= 0) {
    // Desde la Trampa hacia la derecha en su propia fila.
    addSlots(startPlayer, Array.from({ length: startField.length - startSlot }, (_, i) => startSlot + i));
    // Después, la fila rival completa de izquierda a derecha.
    addSlots(otherPlayer, Array.from({ length: players[otherPlayer].field.length }, (_, i) => i));
    // Por último, los Monstruos que estaban a la izquierda de la Trampa.
    addSlots(startPlayer, Array.from({ length: startSlot }, (_, i) => i));
  } else {
    // Fallback defensivo: el Monstruo de inicio debería existir mientras la
    // Trampa 3 está pendiente.
    addSlots(startPlayer, Array.from({ length: startField.length }, (_, i) => i));
    addSlots(otherPlayer, Array.from({ length: players[otherPlayer].field.length }, (_, i) => i));
  }

  return order;
}
