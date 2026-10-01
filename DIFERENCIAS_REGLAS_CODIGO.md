# DIFERENCIAS_REGLAS_CODIGO.md

> **Documento de revisión para unificación de reglas.**
>
> Este documento recoge las diferencias entre la documentación y el código actual.
> **No decide qué regla debe ganar.** Solo documenta las contradicciones.
>
> **Fecha de creación:** 2026-09-30
> **Estado:** Pendiente de revisión por el usuario

---

## 1. Instrucciones de uso

Este documento está pensado para ser revisado **fuera de OpenCode**.

El usuario debe:

1. Revisar cada regla listada
2. Decidir cuál es la regla oficial correcta
3. Marcar la decisión en la columna "Decisión del usuario"
4. Una vez decididas todas las reglas, actualizar `REGLAS_JUEGO_DEFINITIVAS.md` con las reglas confirmadas

---

## 2. Leyenda de estados

| Estado | Significado |
|--------|-------------|
| ✅ Confirmada | El usuario ha confirmado que esta es la regla oficial |
| 🔍 Pendiente | El usuario no ha confirmado esta regla todavía |
| ⚠️ Discrepancia | El código hace algo diferente a lo que dice la documentación |
| ❌ No implementado | La regla no existe en el código |

---

## 3. Reglas de preparación

### 3.1 LP inicial

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| LP inicial = 100 | `lp: 100` | `types.ts` línea 119 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 3.2 Cartas iniciales en mano

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 7 cartas iniciales | `drawCards(p1, 7)` | `useGame.ts` línea 423 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 3.3 Máximo de cartas en mano

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Máximo 9 cartas | `MAX_HAND_SIZE = 9` | `types.ts` línea 128 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 3.4 Composición del mazo

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 12 Espadas + 12 Bastos + 12 Copas + 12 Oros | `buildDeck()` | `cardData.ts` línea 135-142 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

## 4. Reglas de campo

### 4.1 Espacios de monstruos

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 6 espacios | `field: [null, null, null, null, null, null]` | `types.ts` línea 122 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 4.2 Posiciones

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Ataque / Defensa | `position: 'attack' \| 'defense'` | `types.ts` línea 3 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 4.3 Cambio de posición

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 1 vez por turno por monstruo | `hasChangedPosition` se resetea en `END_TURN` | `useGame.ts` línea 636-638 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 4.4 Representación defensiva

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Carta rotada 90° (horizontal) | `rotate-90 scale-[0.8]` | `GameBoard.tsx` línea 98 | 🔍 Pendiente |

**Nota:** Esto es una decisión de implementación visual. No está claro si es una regla oficial o una decisión de diseño.

**Decisión del usuario:** ___________________________________________

---

## 5. Reglas de turnos

### 5.1 Robo al inicio de turno

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 2 cartas | `drawCards(players[nextPlayer], 2)` | `useGame.ts` línea 641 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 5.2 Máximo de cartas jugadas/activadas

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 3 cartas | `MAX_CARDS_PER_TURN = 3` | `useGame.ts` línea 65 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 5.3 Ataques por turno

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| 1 por monstruo | `hasAttacked` se resetea en `END_TURN` | `useGame.ts` línea 636-638 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 5.4 Cambio de posición independiente del límite

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Independiente del límite de 3 cartas | `CHANGE_POSITION` no verifica `cardsPlayedThisTurn` | `useGame.ts` línea 615-628 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 5.5 Primer turno del Jugador 1

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| No puede atacar | `canAttack` retorna false si `turnCount === 0 && currentPlayer === 0` | `types.ts` línea 180-182 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

## 6. Reglas de combate

### 6.1 Ataque contra Ataque — ATQ atacante > ATQ defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Defensor destruido, rival pierde (ATQ - ATQ) PV | `resolveCombat` | `types.ts` línea 154-155 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.2 Ataque contra Ataque — ATQ atacante < ATQ defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Atacante destruido, jugador pierde (ATQ - ATQ) PV | `resolveCombat` | `types.ts` línea 156-157 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.3 Ataque contra Ataque — ATQ atacante = ATQ defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Ambos destruidos, sin daño a PV | `resolveCombat` | `types.ts` línea 158-159 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.4 Ataque contra Defensa — ATQ atacante > DEF defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Defensor destruido, sin daño a PV | `resolveCombat` | `types.ts` línea 162-163 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.5 Ataque contra Defensa — ATQ atacante < DEF defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Nadie destruido, jugador pierde (DEF - ATQ) PV | `resolveCombat` | `types.ts` línea 164-165 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.6 Ataque contra Defensa — ATQ atacante = DEF defensor

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Nadie destruido, sin daño a PV | `resolveCombat` | `types.ts` línea 166-167 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.7 Ataque Directo

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Atacante resta su ATQ a los PV del rival | `executeDirectAttack` | `useGame.ts` línea 745-763 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 6.8 Condiciones de ataque

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Monstruo en ataque puede atacar | `attacker.position !== 'attack'` retorna state | `useGame.ts` línea 541 | 🔍 Pendiente |
| Monstruo en defensa no puede atacar | `attacker.position !== 'attack'` retorna state | `useGame.ts` línea 541 | 🔍 Pendiente |
| Ya atacó no puede atacar de nuevo | `attacker.hasAttacked` retorna state | `useGame.ts` línea 541 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

## 7. Reglas de victoria

### 7.1 Un jugador llega a 0 LP

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| El otro jugador gana | `checkWinner` | `useGame.ts` línea 58-63 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 7.2 Ambos jugadores llegan a 0 LP simultáneamente

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Gana quien tenga más LP | `checkWinner` | `useGame.ts` línea 59 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 7.3 Mazo vacío

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| No hay regla definida | No hay código que maneje este caso | — | ❌ No implementado |

**Decisión del usuario:** ___________________________________________

---

## 8. Reglas de Trampas

### 8.1 Activación de trampas

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Se activan cuando el monstruo es atacado | `DECLARE_ATTACK` verifica `defender.trap` | `useGame.ts` línea 558-573 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.2 Trampa 1 — +5 PV por turno

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Pasivo: +5 PV al inicio de tu turno | `applyTurnStartEffects` | `useGame.ts` línea 386-389 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.3 Trampa 2 — Destrucción 2+1

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Destruye 2 monstruos tuyos y 1 del rival | `applyTrapEffect` caso `destroy_2_self_1_opp` | `useGame.ts` línea 120-131 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.4 Trampa 3 — Dado y conteo

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Tira el dado, cuenta desde este monstruo, destruye donde caiga | `applyTrapEffect` caso `dice_count_field` | `useGame.ts` línea 132-134 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.5 Trampa 4 — Devolver daño

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| El daño se devuelve al adversario | `executeCombat` verifica `hasReflect` | `useGame.ts` línea 778, 794-798 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.6 Trampa 5 — Negar ataque

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Niega el ataque y destruye una trampa/mágica rival | `applyTrapEffect` caso `negate_destroy_card` | `useGame.ts` línea 142-154 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.7 Trampa 6 — Dado 4+

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Tira el dado, si sale 4+ destruye al atacante | `applyTrapEffect` caso `dice_4plus_destroy` | `useGame.ts` línea 156-157 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.8 Trampa 7 — Cambiar atacante

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Cambia el monstruo atacante por el tuyo | `applyTrapEffect` caso `swap_attacker` | `useGame.ts` línea 158-172 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.9 Trampa 8 — Eliminar atacante

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Elimina al monstruo atacante | `applyTrapEffect` caso `destroy_attacker` | `useGame.ts` línea 173-181 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.10 Trampa 9 — Tres turnos

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| El atacante muere en 3 turnos | `applyTrapEffect` caso `three_turns_kill` | `useGame.ts` línea 182-189 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.11 Trampa 10 — Control 2 turnos

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| El atacante es tuyo por 2 turnos | `applyTrapEffect` caso `control_two_turns` | `useGame.ts` linea 190-197 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.12 Trampa 11 — Muerte 2 turnos

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| El atacante muere en 2 turnos | `applyTrapEffect` caso `death_after_two_turns` | `useGame.ts` línea 198-205 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 8.13 Trampa 12 — -5 PV por turno

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Pasivo: rival pierde 5 PV al inicio de tu turno | `applyTurnStartEffects` | `useGame.ts` línea 391-395 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

## 9. Reglas de Mágicas

### 9.1 Mágica 1 — Ataque directo

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Ataca directamente a los PV del rival | `applyMagicEffect` caso `direct_attack` | `useGame.ts` línea 223-234 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.2 Mágica 2 — Robar de la mano

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Coge una carta de la mano del rival sin mirar | `applyMagicEffect` caso `steal_hand_card` | `useGame.ts` línea 236-249 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.3 Mágica 3 — Cambio de mano

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Todos descartan y roban 5 cartas | `applyMagicEffect` caso `hand_swap` | `useGame.ts` línea 251-259 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.4 Mágica 4 — +2 de ataque

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Colocada: +2 ATQ al monstruo | `applyMagicEffect` caso `atk_boost` | `useGame.ts` línea 261-271 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.5 Mágica 5 — Recuperar Monstruo

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Revive el monstruo más fuerte del cementerio | `applyMagicEffect` caso `revive_monster` | `useGame.ts` línea 273-305 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.6 Mágica 6 — Destrucción total

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Destruye todas las cartas del campo | `applyMagicEffect` caso `destroy_all_field` | `useGame.ts` línea 307-314 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.7 Mágica 7 — Cambio posición rival

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Todos los monstruos del rival cambian de posición | `applyMagicEffect` caso `switch_all_opp_position` | `useGame.ts` línea 316-324 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.8 Mágica 8 — -2 de defensa

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Colocada: -2 DEF al monstruo | `applyMagicEffect` caso `def_reduce` | `useGame.ts` línea 326-336 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.9 Mágica 9 — Protección por dado

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Solo puede ser eliminado con tirada de dado. Si sale < 4 se destruye, si sale ≥ 4 sobrevive | `executeCombat` verifica `diceProtection` | `useGame.ts` línea 782-791, 814-819 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.10 Mágica 10 — Robar dos cartas

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Roba 2 cartas y destruye esta carta | `applyMagicEffect` caso `draw_cards` | `useGame.ts` línea 350-353 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.11 Mágica 11 — Daño por dado

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Tira el dado, el resultado es daño al rival | `applyMagicEffect` caso `dice_damage` | `useGame.ts` línea 355-357 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

### 9.12 Mágica 12 — Limpieza del campo rival

| Documento dice | Código hace | Ubicación | Estado |
|----------------|-------------|-----------|--------|
| Quita todas las cartas del campo rival | `applyMagicEffect` caso `clean_opp_field` | `useGame.ts` línea 358-362 | 🔍 Pendiente |

**Decisión del usuario:** ___________________________________________

---

## 10. Contradicciones entre documentos

### 10.1 No se encontraron contradicciones directas

Los documentos `PROYECTO_ESTADO.md` y `REGLAS_JUEGO_DEFINITIVAS.md` no presentan contradicciones directas entre sí.

Ambos documentos describen el mismo comportamiento del código.

### 10.2 Discrepancia potencial — Reglas no confirmadas

**Situación:** `REGLAS_JUEGO_DEFINITIVAS.md` presenta reglas como "oficiales" pero no hay confirmación explícita del usuario de que estas son las reglas correctas.

**Estado:** Todas las reglas están marcadas como "🔍 Pendiente de confirmar"

**Acción requerida:** El usuario debe revisar cada regla y confirmar cuál es la oficial.

---

## 11. Resumen de pendientes

| Categoría | Total | Confirmadas | Pendientes | No implementadas |
|-----------|-------|-------------|-----------|------------------|
| Preparación | 4 | 0 | 4 | 0 |
| Campo | 4 | 0 | 4 | 0 |
| Turnos | 5 | 0 | 5 | 0 |
| Combate | 8 | 0 | 8 | 0 |
| Victoria | 3 | 0 | 2 | 1 |
| Trampas | 13 | 0 | 13 | 0 |
| Mágicas | 12 | 0 | 12 | 0 |
| **Total** | **49** | **0** | **48** | **1** |

---

## 12. Instrucciones para el usuario

### Paso 1: Revisar cada regla

Revisar cada regla listada en este documento y decidir:

- **¿Es esta la regla oficial correcta?**
- **¿El código implementa correctamente esta regla?**
- **¿Hay alguna discrepancia?**

### Paso 2: Marcar la decisión

Para cada regla, escribir en la columna "Decisión del usuario":

- ✅ **Confirmada** — Esta es la regla oficial correcta
- ❌ **Rechazada** — Esta NO es la regla oficial
- 📝 **Modificada** — La regla oficial es diferente (especificar cuál)
- ⚠️ **Discrepancia** — El código no implementa correctamente esta regla

### Paso 3: Actualizar REGLAS_JUEGO_DEFINITIVAS.md

Una vez revisadas todas las reglas, actualizar `REGLAS_JUEGO_DEFINITIVAS.md` con:

- Las reglas confirmadas como "✅ Confirmada"
- Las reglas modificadas con su nuevo texto
- Las discrepancias documentadas

### Paso 4: Corregir el código (si es necesario)

Si alguna regla confirmada difiere del comportamiento actual del código, corregir el código para que coincida con la regla oficial.

---

## 13. Documentos de referencia

| Documento | Contenido |
|-----------|-----------|
| `PROYECTO_ESTADO.md` | Estado actual del proyecto, arquitectura, mejoras realizadas |
| `REGLAS_JUEGO_DEFINITIVAS.md` | Reglas oficiales del juego (pendientes de confirmación) |
| `DIFERENCIAS_REGLAS_CODIGO.md` | Este documento — diferencias entre documentación y código |

---

*Fecha de creación: 2026-09-30*
*Estado: Pendiente de revisión por el usuario*
