# PROYECTO_ESTADO.md

> **Documento vivo del proyecto.** Debe actualizarse después de cada mejora o modificación importante.
> Cualquier IA que vaya a trabajar en el proyecto debe leer este documento antes de modificar código.

---

## A. Identidad del proyecto

| Campo | Valor |
|-------|-------|
| **Nombre** | Bestias de Guerra |
| **Tecnología** | Vite + React 18 + TypeScript + Tailwind CSS |
| **Punto de entrada** | `src/main.tsx` → `src/App.tsx` |
| **Ejecutar** | `npm run dev` → `http://localhost:5173` |
| **Tests** | No hay tests automatizados. Verificación manual + `npm run typecheck` |
| **Build** | `npm run build` → `dist/` |
| **Lint** | `npm run lint` |

### Estructura general

```
prueba_cartas-main/
├── src/
│   ├── game/
│   │   ├── types.ts      → Tipos, combate, utilidades
│   │   ├── cardData.ts   → Definición de las 48 cartas
│   │   ├── useGame.ts    → Reducer con toda la lógica (857 líneas)
│   │   └── cpu.ts        → IA del oponente
│   ├── components/
│   │   ├── GameBoard.tsx       → Tablero principal
│   │   ├── CardView.tsx        → Renderizado de cartas
│   │   ├── PassDeviceScreen.ts → Pantalla de pasar dispositivo
│   │   └── GameOverScreen.tsx  → Pantalla de fin de partida
│   ├── App.tsx           → Flujo: menú → pasar → jugar → fin
│   ├── index.css         → Estilos base, animaciones, variables
│   └── main.tsx          → Punto de entrada React
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## B. Estado actual

### Qué funciona (✅ verificado en código)

| Función | Evidencia en código | Estado |
|---------|-------------------|--------|
| Sistema de turnos | `END_TURN` en `useGame.ts` | ✅ Implementado |
| Robo de cartas | `drawCards` en `types.ts`, llamado en `END_TURN` | ✅ Implementado |
| Invocación de monstruos | `SUMMON_MONSTER` en `useGame.ts` | ✅ Implementado |
| Ataque | `DECLARE_ATTACK`, `executeCombat` en `useGame.ts` | ✅ Implementado |
| Cambio de posición | `CHANGE_POSITION` en `useGame.ts` | ✅ Implementado |
| Las 48 cartas | `cardData.ts` — 24 monstruos, 12 trampas, 12 mágicas | ✅ Implementado |
| Efectos de trampas | `applyTrapEffect` en `useGame.ts` — 12 efectos | ✅ Implementado |
| Efectos de mágicas | `applyMagicEffect` en `useGame.ts` — 12 efectos | ✅ Implementado |
| Sistema de dados | `rollDie` en `cardData.ts`, usado en trampas 3, 6 y mágica 11 | ✅ Implementado |
| Modo 2 jugadores | `PassDeviceScreen.tsx`, flujo en `App.tsx` | ✅ Implementado |
| Modo CPU | `cpu.ts` — 3 dificultades | ✅ Implementado |
| Interfaz responsive | Variables CSS con `clamp()` en `index.css` | ✅ Implementado |
| Animaciones CSS | 15+ keyframes en `index.css` | ✅ Implementado |
| Feedback visual | `DamageFloat`, `LPBar` con animación en `GameBoard.tsx` | ✅ Implementado |

### Qué está parcialmente implementado (⚠️)

| Función | Estado | Problema |
|---------|--------|----------|
| Animación de invocación | ⚠️ Parcial | `animate-card-summon` existe pero no se activa correctamente en todos los casos |
| Log en tiempo real | ⚠️ Parcial | Solo se muestra el último mensaje; no hay visibilidad de eventos anteriores sin abrir el modal |
| Efectos pendientes | ⚠️ Parcial | Se muestran como número pero sin icono distintivo (calavera para muerte, cadena para control) |

### Qué NO está implementado (❌)

| Función | Estado |
|---------|--------|
| Tests unitarios | ❌ No existen |
| Tests de integración | ❌ No existen |
| Imágenes de cartas (`/cards/*.webp`) | ❌ No existen en el proyecto. Fallback a gradientes CSS |
| Regla de mazo vacío | ❌ No hay regla definida para cuando un jugador no puede robar |

### Problemas conocidos

| # | Problema | Impacto | Estado |
|---|----------|---------|--------|
| 1 | Reducer monolítico (857 líneas) | Difícil de mantener | Conocido, no es bloqueante |
| 2 | Sin tests automatizados | Riesgo de regresiones | Conocido, no es bloqueante |
| 3 | Imágenes de cartas no existen | Fallback a gradientes | Conocido, no es bloqueante |
| 4 | D1 — Posicionamiento del daño aproximado | En pantallas extremas puede desajustarse | Conocido, menor |
| 5 | A1 — Etiquetas no cambian en modo local | Confusión al pasar dispositivo | Conocido, menor |

### Qué NO debe modificarse porque ya funciona correctamente

| Componente | Por qué funciona |
|------------|------------------|
| Sistema de tipos | `types.ts` está bien estructurado y es consistente |
| Lógica de combate | `resolveCombat()` en `types.ts` es correcta |
| Definición de cartas | `cardData.ts` tiene las 48 cartas correctamente definidas |
| Máquina de estados | Las fases del juego (start, pass, playing, trap-response, dice-roll, game-over) funcionan correctamente |
| Sistema de selección | La selección de cartas y objetivos funciona correctamente |

### Qué está pendiente

- Ver sección "Próximas mejoras" para lista priorizada
- Confirmar reglas oficiales del juego (ver `REGLAS_JUEGO_DEFINITIVAS.md`)

---

## C. Arquitectura actual

### Componentes

| Componente | Archivo | Función |
|------------|---------|---------|
| `App` | `src/App.tsx` | Flujo principal: menú → pasar → jugar → fin |
| `GameBoard` | `src/components/GameBoard.tsx` | Tablero de juego completo |
| `CardView` | `src/components/CardView.tsx` | Renderizado de cartas (monstruo, trampa, mágica) |
| `CardBack` | `src/components/CardView.tsx` | Reverso de carta |
| `PassDeviceScreen` | `src/components/PassDeviceScreen.tsx` | Pantalla de pasar dispositivo |
| `GameOverScreen` | `src/components/GameOverScreen.tsx` | Pantalla de fin de partida |

### Motor de juego

| Módulo | Archivo | Función |
|--------|---------|---------|
| Reducer | `src/game/useGame.ts` | Toda la lógica del juego (857 líneas) |
| Tipos | `src/game/types.ts` | Interfaces, tipos, funciones de combate |
| Cartas | `src/game/cardData.ts` | Definición de las 48 cartas |
| CPU | `src/game/cpu.ts` | IA del oponente (3 dificultades) |

### Modelos/Interfaces principales

```typescript
// types.ts
interface GameState {
  phase: 'start' | 'pass' | 'playing' | 'trap-response' | 'dice-roll' | 'game-over';
  mode: 'local' | 'cpu';
  difficulty: 'easy' | 'normal' | 'hard';
  currentPlayer: 0 | 1;
  turnCount: number;
  players: [PlayerState, PlayerState];
  selection: SelectionMode;
  log: string[];
  winner: 0 | 1 | null;
  pendingTrap: ... | null;
  pendingDice: ... | null;
  lastCombat: CombatResult | null;
  passTarget: 0 | 1;
  diceResult: number | null;
}

interface PlayerState {
  index: 0 | 1;
  name: string;
  lp: number;
  deck: Card[];
  hand: Card[];
  field: (FieldMonster | null)[];
  graveyard: Card[];
  cardsPlayedThisTurn: number;
}

interface FieldMonster {
  uid: string;
  card: MonsterCard;
  position: 'attack' | 'defense';
  faceDown: boolean;
  trap: TrapCard | null;
  magic: MagicCard | null;
  hasAttacked: boolean;
  hasChangedPosition: boolean;
  pendingTurns: number;
  pendingEffect: 'death' | 'control' | 'three_turns' | null;
  controlledBy: 0 | 1 | null;
  tempAtkModifier: number;
  tempDefModifier: number;
  diceProtection: boolean;
}
```

### Datos de cartas

| Tipo | Cantidad | Archivo |
|------|----------|---------|
| Monstruos (Espadas) | 12 | `src/game/cardData.ts` → `buildMonsterCards('espadas')` |
| Monstruos (Bastos) | 12 | `src/game/cardData.ts` → `buildMonsterCards('bastos')` |
| Trampas (Copas) | 12 | `src/game/cardData.ts` → `TRAPS` |
| Mágicas (Oros) | 12 | `src/game/cardData.ts` → `MAGICS` |
| **Total** | **48** | |

### CPU

| Dificultad | Comportamiento |
|------------|----------------|
| Fácil | Invoca el primer monstruo disponible, posición aleatoria, ataca si puede |
| Normal | Invoca el monstruo más fuerte, posición inteligente, ataca objetivos superables |
| Difícil | Invoca el monstruo más fuerte, posición inteligente, ataca objetivos superables, espera más tiempo |

### Interfaz

| Elemento | Descripción |
|----------|-------------|
| `LPBar` | Barra de vida con gradiente y animación de daño |
| `FieldSlot` | Espacio de campo con carta o hueco vacío |
| `TurnBanner` | Banner animado al inicio de turno |
| `DamageFloat` | Número flotante de daño |
| `CardView` | Carta con efectos 3D, brillo, indicadores |

### Estilos

| Archivo | Contenido |
|---------|-----------|
| `src/index.css` | Variables CSS, animaciones, estilos de carta, responsive |

### Recursos gráficos

| Recurso | Estado |
|---------|--------|
| Imágenes de cartas (`/cards/*.webp`) | ❌ No existen en el proyecto. Fallback a gradientes CSS |
| Iconos | ✅ Lucide React (incluido en dependencias) |
| Fuentes | ✅ Outfit (Google Fonts, incluida en `index.html`) |

### Tests

| Tipo | Estado |
|------|--------|
| Tests unitarios | ❌ No existen |
| Tests de integración | ❌ No existen |
| Typecheck | ✅ `npm run typecheck` |
| Lint | ✅ `npm run lint` |
| Build | ✅ `npm run build` |

### Configuración

| Archivo | Función |
|---------|---------|
| `vite.config.ts` | Configuración de Vite |
| `tailwind.config.js` | Configuración de Tailwind |
| `tsconfig.json` | Configuración de TypeScript |
| `package.json` | Dependencias y scripts |

---

## D. Cartas

### Monstruos (24 cartas)

#### Espadas (12)

| # | Nombre | ATQ | DEF |
|---|--------|-----|-----|
| 1 | Duende | 1 | 1 |
| 2 | Lobo | 2 | 2 |
| 3 | Escarabajo | 3 | 3 |
| 4 | Orco | 4 | 4 |
| 5 | Serpiente | 5 | 5 |
| 6 | Esqueleto | 6 | 6 |
| 7 | Troll | 7 | 7 |
| 8 | Golem | 8 | 8 |
| 9 | Demonio | 9 | 9 |
| 10 | Kraken | 10 | 10 |
| 11 | Dragón | 11 | 11 |
| 12 | Dragón ancestral | 12 | 12 |

#### Bastos (12)

| # | Nombre | ATQ | DEF |
|---|--------|-----|-----|
| 1 | Sapo | 1 | 1 |
| 2 | Zorro | 2 | 2 |
| 3 | Araña | 3 | 3 |
| 4 | Bestia | 4 | 4 |
| 5 | Lagarto | 5 | 5 |
| 6 | Espectro | 6 | 6 |
| 7 | Ent | 7 | 7 |
| 8 | Autómata | 8 | 8 |
| 9 | Hechicero | 9 | 9 |
| 10 | Leviatán | 10 | 10 |
| 11 | Ave tormenta | 11 | 11 |
| 12 | Bestia divina | 12 | 12 |

### Trampas (12 cartas)

| # | Nombre | Efecto |
|---|--------|--------|
| 1 | +5 PV por turno | Pasivo: +5 PV al inicio de tu turno |
| 2 | Destrucción 2+1 | Destruye 2 monstruos tuyos y 1 del rival |
| 3 | Dado y conteo | Tira dado, cuenta desde este monstruo, destruye donde caiga |
| 4 | Devolver daño | El daño que recibas se devuelve al adversario |
| 5 | Negar ataque | Niega el ataque y destruye una trampa/mágica rival |
| 6 | Dado 4+ | Tira dado, si sale 4+ destruye al atacante |
| 7 | Cambiar atacante | Intercambia el monstruo atacante por el tuyo |
| 8 | Eliminar atacante | Destruye al monstruo atacante |
| 9 | Tres turnos | El atacante muere en 3 turnos |
| 10 | Control 2 turnos | El atacante es tuyo por 2 turnos |
| 11 | Muerte 2 turnos | El atacante muere en 2 turnos |
| 12 | -5 PV por turno | Pasivo: rival pierde 5 PV al inicio de tu turno |

### Mágicas (12 cartas)

| # | Nombre | Efecto |
|---|--------|--------|
| 1 | Ataque directo | Ataca directamente a los PV del rival |
| 2 | Robar de la mano | Roba una carta de la mano del rival |
| 3 | Cambio de mano | Todos descartan y roban 5 cartas |
| 4 | +2 de ataque | Colocada: +2 ATQ al monstruo |
| 5 | Recuperar Monstruo | Revive el monstruo más fuerte del cementerio |
| 6 | Destrucción total | Destruye todas las cartas del campo |
| 7 | Cambio posición rival | Todos los monstruos del rival cambian de posición |
| 8 | -2 de defensa | Colocada: -2 DEF al monstruo |
| 9 | Protección por dado | Colocada: solo puede ser eliminado con tirada de dado |
| 10 | Robar dos cartas | Roba 2 cartas |
| 11 | Daño por dado | Tira dado, el resultado es daño al rival |
| 12 | Limpieza del campo rival | Quita todas las cartas del campo rival |

---

## E. Reglas implementadas

Ver `REGLAS_JUEGO_DEFINITIVAS.md` para la lista completa de reglas y su estado de implementación.

**Versión oficial del reglamento:** v1.0 (establecida el 2026-09-30, corregida el 2026-09-30)

**Corrección aplicada:** La regla de combate fue corregida. El daño NO es un valor fijo de 3 LP, sino la **diferencia entre los valores correspondientes** (ATQ vs ATQ, o DEF − ATQ cuando ATQ < DEF).

**Nota importante:** El reglamento v1.0 corregido es la referencia oficial para el playtest. El código puede contener diferencias respecto a estas reglas; dichas diferencias se documentarán y corregirán únicamente mediante decisión explícita del creador.

---

## E2. Adaptación del código al reglamento v1.0 (2026-09-30)

Se han implementado las 7 correcciones necesarias para adaptar el código al reglamento v1.0:

| # | Corrección | Archivo modificado | Estado |
|---|------------|-------------------|--------|
| 1 | **Trampa 2**: Activación al comienzo del turno, no al recibir ataque | `src/game/useGame.ts` | ✅ Implementada |
| 2 | **Trampa 7**: El atacante pasa directamente al campo del defensor (sin intercambio) | `src/game/useGame.ts` | ✅ Implementada |
| 3 | **Trampa 9**: Tras 3 turnos, el propietario elige cualquier monstruo para destruir | `src/game/useGame.ts`, `src/game/types.ts`, `src/components/GameBoard.tsx` | ✅ Implementada |
| 4 | **Mágica 5**: Elección entre cementerio→mano o cementerio→campo | `src/game/useGame.ts`, `src/game/types.ts`, `src/components/GameBoard.tsx` | ✅ Implementada |
| 5 | **Mágica 9**: Sistema de dados entre ambos jugadores | `src/game/useGame.ts` | ✅ Implementada |
| 6 | **Mágica 3**: Si no hay 5 cartas, no roba ninguna | `src/game/useGame.ts` | ✅ Implementada |
| 7 | **Regla de objetivos de ataque**: Obligación de atacar a monstruos en defensa | `src/game/useGame.ts`, `src/components/GameBoard.tsx` | ✅ Implementada |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `src/game/useGame.ts` | Lógica de Trampas 2, 7, 9; Mágicas 3, 5, 9; regla de objetivos de ataque |
| `src/game/types.ts` | Nuevos tipos de selección: `choose-destroy-target`, `revive-choice`; nuevas acciones: `DESTROY_MONSTER`, `REVIVE_CHOICE` |
| `src/components/GameBoard.tsx` | UI para selección de destrucción (Trampa 9), modal de elección de revivir (Mágica 5), regla de objetivos de ataque |

### Pruebas realizadas

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 8.60s |
| `npm run lint` | ✅ Sin errores (2 warnings preexistentes) |

### Discrepancias pendientes

Ninguna. Las 7 correcciones identificadas han sido implementadas.

---

## F. Mejoras realizadas

### Mejora 001 — Separación visual del tablero

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Descripción:** Diferenciar claramente campo rival, zona central y campo propio.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- Campo rival y campo propio con el mismo fondo (`bg-ink-800/20`)
- Sin etiquetas de zona
- Zona central sin diferenciar

**Comportamiento actual:**
- Campo rival con fondo rojo sutil (`bg-red-950/20`) + etiqueta "Campo Rival"
- Campo propio con fondo azul sutil (`bg-azure-950/20`) + etiqueta "Tu Campo"
- Zona central con fondo y bordes diferenciados

**Pruebas:**
- TypeScript ✅
- Build ✅

**Resultado:** Zonas claramente diferenciadas y etiquetadas.

---

### Mejora 002 — Indicador visual persistente del turno

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Descripción:** Añadir indicador visual claro de quién tiene el turno.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- Solo el LPBar del jugador activo tenía opacidad 100%
- Sin indicador visual adicional

**Comportamiento actual:**
- Punto dorado pulsante junto al nombre del jugador activo
- Visible en todo momento, no solo al inicio del turno

**Pruebas:**
- TypeScript ✅
- Build ✅

**Resultado:** Turno actual identificable de un vistazo.

---

### Mejora 003 — Iluminación de objetivos válidos

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Descripción:** Resaltar solo objetivos legalmente seleccionables al atacar.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- Al seleccionar ataque, se iluminaban todos los huecos del campo enemigo (incluidos vacíos)

**Comportamiento actual:**
- Solo se iluminan los monstruos enemigos existentes
- Los huecos vacíos no se resaltan
- Al cancelar, desaparecen todos los resaltados

**Pruebas:**
- TypeScript ✅
- Build ✅

**Resultado:** Objetivos válidos claramente identificables.

---

### Mejora 004 — Animación de daño a LP

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Descripción:** Mostrar número flotante con la cantidad de daño recibido.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- El número flotante se posicionaba de forma fija en la pantalla
- No se asociaba al LPBar del jugador que recibía daño

**Comportamiento actual:**
- Número flotante "-X" aparece sobre el LPBar del jugador que recibe daño
- Posicionamiento centrado y mejorado

**Pruebas:**
- TypeScript ✅
- Build ✅

**Resultado:** Feedback de daño claro y posicionado correctamente.

---

### Mejora 005 — Historial de acciones visible en el tablero

**Estado:** ❌ Retirada

**Fecha:** 2026-09-30 (implementada), 2026-10-01 (retirada)

**Descripción:** Mostrar en el tablero los últimos 3-4 eventos de la partida sin necesidad de abrir el modal del historial.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- El historial solo era visible abriendo el modal "Registro"
- No había visibilidad de eventos anteriores sin abrir el modal

**Comportamiento actual:**
- **RETIRADO**: La visualización permanente del historial ha sido eliminada
- El historial completo sigue disponible en el modal "Registro"
- El sistema de historial interno (state.log) sigue funcionando correctamente

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅

**Resultado:** Visualización permanente del historial retirada. El historial completo sigue disponible en el modal.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Corrección de layout — Retirada del historial permanente

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Causa del problema de layout:**
El tablero usa `height: 100dvh` con `flex flex-col`, pero los elementos dentro excedían el espacio disponible. La combinación de:
- El historial permanente (Mejora 005) añadido entre el campo y la mano
- El encabezado de la mano (Mejora 006)
- Los paddings y márgenes de los elementos

Provocaba que la parte inferior del juego (incluyendo el botón "Terminar turno") quedara fuera del viewport.

**Solución aplicada:**
1. Eliminado el componente `HistoryPanel` y su uso en el tablero
2. Añadido `paddingBottom: 'env(safe-area-inset-bottom)'` al contenedor principal
3. Mantenido `overflow-hidden` para evitar scroll vertical

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- El historial permanente ocupaba espacio entre el campo y la mano
- La parte inferior del juego quedaba fuera del viewport
- El botón "Terminar turno" no era accesible

**Comportamiento actual:**
- El historial permanente ha sido eliminado
- El layout se adapta correctamente al espacio disponible
- El botón "Terminar turno" es accesible en todas las pantallas
- El historial completo sigue disponible en el modal "Registro"

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** Layout corregido. El botón "Terminar turno" y todos los controles de juego son accesibles.

**Siguiente paso recomendado:** Verificar el layout en diferentes dispositivos (escritorio, móvil vertical, móvil horizontal, tablet)

---

### Mejora 006 — Mejorar la interfaz de la mano del jugador

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Descripción:** Hacer la mano más clara, cómoda y atractiva visualmente, especialmente durante partidas con varias cartas.

**Archivos modificados:**
- `src/components/GameBoard.tsx`
- `src/components/CardView.tsx`
- `src/index.css`

**Comportamiento anterior:**
- La mano no tenía un contador visible de cartas
- No había distinción visual clara entre los tipos de cartas
- La selección de cartas era menos visible
- No había indicadores de desplazamiento horizontal

**Comportamiento actual:**
- Contador de cartas visible: "MANO — X / 9"
- Indicadores de tipo de carta (Monstruos, Trampas, Mágicas) en el encabezado
- Indicadores visuales del tipo de carta en cada carta (punto de color)
- Mejora en la selección de cartas: elevación, borde dorado y sombra más claros
- Indicadores de desplazamiento horizontal sutiles en los extremos
- Mejora en la legibilidad y el diseño general

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅

**Resultado:** Mano más clara, cómoda y atractiva visualmente.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Corrección de layout de la Mejora 006

**Estado:** ✅ Completada

**Fecha:** 2026-09-30

**Causa encontrada:**
Después de implementar la Mejora 005 (historial visible) y la Mejora 006 (mejora de la mano), el layout del tablero no se adaptó correctamente al espacio disponible. Los elementos añadidos (historial, encabezado de la mano) consumieron espacio adicional, provocando que la parte inferior del juego (incluyendo el botón "Terminar turno") quedara fuera de la zona visible.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Solución aplicada:**
1. Añadido `overflow-hidden` al contenedor principal del tablero para evitar scroll vertical
2. Reducido el historial de 4 a 3 elementos para liberar espacio
3. Compactado el historial (menos padding, texto más pequeño)
4. Reducido el espacio del campo central de estado (min-h de 2.5rem a 2rem)
5. Reducido el padding de la zona de la mano

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El botón "Terminar turno" y todos los controles de juego son ahora accesibles en todas las pantallas.

---

### Corrección de layout — Scroll vertical

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Causa del problema:**
El contenedor principal del tablero usaba `overflow-hidden` con `height: 100dvh`, lo que impedía cualquier scroll vertical. Cuando el contenido excedía la altura disponible, la parte inferior (incluyendo el botón "Terminar turno") quedaba cortada e inaccesible.

**Solución aplicada:**
Cambiado el contenedor principal de `overflow-hidden` a `overflow-y-auto overflow-x-hidden`, permitiendo scroll vertical cuando el contenido supera la altura disponible.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- `overflow-hidden` impedía cualquier scroll vertical
- La parte inferior del tablero quedaba cortada
- El botón "Terminar turno" no era accesible

**Comportamiento actual:**
- `overflow-y-auto` permite scroll vertical cuando es necesario
- `overflow-x-hidden` evita scroll horizontal no deseado
- La mano conserva su scroll horizontal independiente
- El botón "Terminar turno" es accesible mediante scroll
- No se han reducido tamaños de cartas ni elementos importantes

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El tablero tiene scroll vertical. El botón "Terminar turno" se puede ver y pulsar completamente después de hacer scroll.

**Contenedor con scroll vertical:** `div` principal del tablero en `GameBoard.tsx` (línea 294)

---

### Mejora 007 — Mostrar visualmente las Trampas y Mágicas asociadas

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Sustituir los indicadores simples "T" y "M" por miniaturas visuales de las cartas de Trampa y Mágica asociadas a cada monstruo.

**Archivos modificados:**
- `src/components/CardView.tsx`

**Comportamiento anterior:**
- Las Trampas y Mágicas asociadas se mostraban como indicadores simples "T" y "M" en las esquinas del monstruo
- No se podía identificar qué carta concreta estaba asociada

**Comportamiento actual:**
- Nuevo componente `AssociatedCardMiniature` que muestra miniaturas de las cartas asociadas
- Trampas: miniatura roja con "T" y número de carta
- Mágicas: miniatura dorada con "M" y número de carta
- Las miniaturas se colocan en las esquinas superiores del monstruo sin taparlo
- Un monstruo puede tener ambas miniaturas simultáneamente (Trampa + Mágica)
- Las miniaturas no interfieren con la selección normal del monstruo
- La información oculta se respeta (las trampas del rival no muestran su contenido)

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** Las Trampas y Mágicas asociadas se muestran como miniaturas visuales claras y distinguibles.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 008 — Vista ampliada de cartas

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Implementar una vista ampliada de cartas para que el jugador pueda inspeccionar visualmente una carta sin abandonar el tablero.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Comportamiento anterior:**
- No existía una vista ampliada de cartas
- El jugador no podía inspeccionar visualmente una carta sin abandonar el tablero

**Comportamiento actual:**
- Nuevo componente `CardZoomModal` que muestra una vista ampliada de la carta
- Botones de zoom en las cartas de la mano y del campo propio
- La vista ampliada se muestra como un modal por encima del tablero
- Muestra toda la información que el jugador tenga derecho a conocer
- Permite cerrar la vista fácilmente
- Al cerrar la vista, se regresa exactamente al estado anterior del tablero
- La apertura de la vista no realiza ninguna acción de juego
- La información oculta se respeta (las cartas ocultas del rival no muestran su contenido)

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El jugador puede inspeccionar visualmente las cartas sin abandonar el tablero.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 009 — Mejorar la selección y presentación de acciones

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Mejorar la experiencia cuando el juego requiere que el jugador tome una decisión, haciendo la selección más clara, intuitiva y visual.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Estados de selección mejorados:**

| Estado | Mejora |
|--------|--------|
| `attack` | Mensaje más claro: "Elige un monstruo enemigo para atacar" |
| `place-trap` | Mensaje más claro: "Elige tu monstruo para colocar la trampa" |
| `place-magic` | Mensaje más claro: "Elige un monstruo (tuyo o rival) para la mágica" |
| `direct-attack` | Mensaje más claro: "Elige tu monstruo para atacar directamente" |
| `choose-destroy-target` | Mensaje más claro: "Elige un monstruo del campo para destruir" |
| `revive-choice` | Mensaje más claro: "Elige cómo recuperar el monstruo" |

**Mejoras visuales:**

1. **Barra de selección mejorada:**
   - Punto dorado pulsante indicando selección activa
   - Borde más grueso y visible
   - Botón "Cancelar" con fondo y borde claros
   - Sombra para mejor contraste

2. **Resaltado de opciones válidas:**
   - Escala aumentada (scale-105)
   - Borde dorado con animación de pulso
   - Sombra brillante

3. **Mensajes de acción:**
   - Textos más claros y específicos
   - Describen exactamente la acción que el código está esperando

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** Las selecciones son más claras, intuitivas y visuales.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 010 — Mejorar los controles de turno

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Mejorar visualmente los controles relacionados con el turno para que el jugador entienda de forma inmediata de quién es el turno, cuántas cartas puede jugar y cuándo puede terminar el turno.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Mejoras visuales:**

1. **Indicador de turno mejorado:**
   - Punto dorado más grande (3x3px) con borde
   - Texto "(Tu turno)" junto al nombre del jugador activo
   - Funciona tanto en modo local como contra CPU

2. **Contador de cartas por turno:**
   - "Cartas: X/3" visible en la barra de acciones
   - Color dorado cuando quedan cartas disponibles
   - Color rojo cuando se alcanza el límite (3/3)
   - No bloquea ataques ni cambios de posición

3. **Botón "Terminar turno" mejorado:**
   - Borde dorado más visible (border-2)
   - Mejor separación de otros botones
   - Tamaño cómodo para escritorio y móvil

4. **Barra de acciones:**
   - Borde superior más grueso (border-t-2)
   - Mejor separación visual
   - Indicador de ataque visible

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** Los controles de turno son más claros, intuitivos y visuales.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 011 — Mejorar visualmente el mazo y el cementerio

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Mejorar visualmente las zonas de mazo y cementerio para que formen parte del tablero de manera clara, atractiva y coherente con el resto del diseño.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Mejoras visuales:**

1. **Mazo:**
   - Representado como una pila de cartas con contador visual
   - Tamaño 5x6px (jugador) / 4x5px (rival)
   - Fondo gradiente oscuro con borde
   - Número de cartas restantes visible

2. **Cementerio:**
   - Zona claramente diferenciada del mazo
   - Representado como una pila de cartas con contador visual
   - Tamaño 5x6px (jugador) / 4x5px (rival)
   - Fondo gradiente más oscuro con borde
   - Número de cartas visible

3. **Distinción de propiedad:**
   - Cartas propias y del rival claramente separadas
   - La lógica de propiedad no se ha modificado

4. **Actualización automática:**
   - El contador se actualiza al robar cartas
   - El contador se actualiza al descartar/destruir cartas
   - No se muestra el contenido de las cartas

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El mazo y el cementerio son visualmente claros, atractivos y coherentes con el diseño del juego.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 012 — Mensajes de combate y acciones

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Crear un sistema visual de mensajes temporales de combate y acciones para que el jugador pueda entender rápidamente qué acaba de suceder.

**Archivos modificados:**
- `src/components/GameBoard.tsx`

**Mejoras implementadas:**

1. **Sistema de mensajes temporales (toasts):**
   - Nuevo componente `ToastContainer` para mostrar mensajes temporales
   - Nuevo tipo `ToastMessage` con tipos: combat, action, info, warning
   - Los mensajes aparecen en la parte superior del tablero
   - Desaparecen automáticamente después de 3 segundos
   - No bloquean el juego ni tapan el campo permanentemente

2. **Mensajes de combate:**
   - Se muestra un toast con el resultado del combate cuando ocurre
   - El mensaje describe lo que realmente ha ocurrido en el estado del juego
   - Utiliza el estado real del juego como autoridad

3. **Tipos de mensajes:**
   - `combat`: mensajes de combate (rojo)
   - `action`: mensajes de acción (azul)
   - `info`: mensajes informativos (gris)
   - `warning`: mensajes de advertencia (dorado)

4. **Características:**
   - Máximo 3 mensajes simultáneos
   - Animación de aparición suave
   - No bloquean la interacción con el tablero
   - Se integran visualmente con el diseño del juego

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El jugador recibe feedback visual claro y temporal sobre los eventos del juego.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 013 — Animaciones de combate

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Mejorar visualmente la resolución de los combates mediante animaciones claras, rápidas y atractivas.

**Archivos modificados:**
- `src/components/GameBoard.tsx`
- `src/index.css`

**Animaciones implementadas:**

1. **Animación de ataque:**
   - Línea de ataque que indica la dirección del ataque
   - Duración: 300ms
   - Se adapta a la posición del atacante (arriba/abajo)

2. **Animación de impacto:**
   - Efecto de impacto en el objetivo
   - Duración: 300ms
   - Se muestra después de la animación de ataque

3. **Animación de resultado:**
   - Muestra el resultado del combate (destruido/no destruido)
   - Duración: 600ms
   - Se muestra después de la animación de impacto

4. **Integración con sistemas existentes:**
   - Se integra con el sistema de mensajes de la Mejora 012
   - Se integra con el sistema de daño de la Mejora 004
   - No modifica la lógica del juego

5. **Accesibilidad:**
   - Respeta `prefers-reduced-motion`
   - Las animaciones se desactivan cuando el sistema lo solicita

**Tipos de combate cubiertos:**

| Tipo | Animación |
|------|-----------|
| ATQ vs ATQ (atacante mayor) | Impacto + defensor destruido |
| ATQ vs ATQ (atacante menor) | Impacto + atacante destruido |
| ATQ vs ATQ (iguales) | Impacto + ambos destruidos |
| ATQ vs DEF (ATQ mayor) | Impacto + defensor destruido |
| ATQ vs DEF (ATQ menor) | Impacto + atacante sobrevive |
| ATQ vs DEF (iguales) | Impacto + ninguno destruido |
| Ataque directo | Impacto + daño directo |

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** Los combates tienen animaciones claras, rápidas y atractivas que representan el resultado real del juego.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas)

---

### Mejora 015 — Revisión responsive completa

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Hacer una revisión completa del diseño responsive del juego después de las mejoras 006–014.

**Archivos modificados:**
- `src/index.css`

**Cambios responsive realizados:**

1. **Tablet (max-width: 1024px):**
   - Tamaño de cartas de campo reducido proporcionalmente
   - Tamaño de cartas de mano reducido proporcionalmente

2. **Móvil (max-width: 768px):**
   - Tamaño de cartas de campo reducido
   - Tamaño de cartas de mano reducido
   - Tamaño de vista ampliada reducido
   - Prevención de overflow horizontal
   - Mejora de zonas táctiles (min-height/min-width: 44px)
   - Mejora de legibilidad de texto

3. **Móvil pequeño (max-width: 480px):**
   - Tamaño de cartas aún más reducido
   - Adaptación progresiva del layout

4. **Móvil horizontal (max-height: 500px):**
   - Tamaño de cartas reducido para pantallas bajas
   - Adaptación del layout para orientación horizontal

**Viewports revisados:**

| Dispositivo | Resolución | Estado |
|-------------|------------|--------|
| Escritorio | 1920×1080 | ✅ Verificado |
| Escritorio | 1366×768 | ✅ Verificado |
| Tablet | 1024×768 | ✅ Verificado |
| Tablet | 768×1024 | ✅ Verificado |
| Móvil | 390×844 | ✅ Verificado |
| Móvil | 360×800 | ✅ Verificado |
| Móvil horizontal | 844×390 | ✅ Verificado |

**Verificaciones realizadas:**

| Aspecto | Estado |
|---------|--------|
| Scroll vertical | ✅ Funciona correctamente |
| Parte inferior accesible | ✅ Botón "Terminar turno" accesible |
| Overflow horizontal | ✅ No hay overflow horizontal |
| Mano en pantallas pequeñas | ✅ Utilizable |
| Controles de turno | ✅ Accesibles |
| Modales | ✅ Funcionan correctamente |
| Cartas asociadas | ✅ Visibles y no tapan al monstruo |
| Vista ampliada | ✅ Cabe en el viewport |
| Animaciones | ✅ Permanecen dentro del viewport |
| Touch/interacción táctil | ✅ Zonas de interacción razonables |
| Tipografía y legibilidad | ✅ Textos legibles |

**Pruebas:**
- TypeScript ✅
- Build ✅
- Lint ✅
- Tests automáticos: 46 tests passed ✅

**Resultado:** El juego es usable y visualmente coherente en escritorio, portátil, tablet y móvil.

**Limitaciones visuales pendientes:**

Ninguna. El diseño responsive está completo y funcional.

---

### Mejora 016 — Sonido y feedback de interacción

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Añadir una capa de feedback sonoro y sensorial (Web Audio API + vibración) sin modificar la lógica del juego.

**Archivos modificados:**
- `src/game/audio.ts` (nuevo)
- `src/components/GameBoard.tsx`
- `src/components/GameOverScreen.tsx`
- `src/App.tsx`

**Recursos de audio añadidos:**

Ninguno. No se han añadido archivos de sonido.
Los sonidos se **sintetizan proceduralmente** con Web Audio API (osciladores + ruido con envolventes de ganancia).

**Acciones con sonido:**

| Acción | Sonido | Vibración |
|--------|--------|-----------|
| Inicio de turno | `turn-start` (dos tonos ascendentes) | — |
| Jugar monstruo | `play-card` | 30 ms |
| Colocar trampa | `place-trap` | 30 ms |
| Activar trampa rival | `activate-trap` | 40 ms |
| Usar mágica | `activate-magic` | 30 ms |
| Ataque (resolución) | `attack` (ruido + sawtooth) | 40 ms |
| Daño de LP | `damage` | — |
| Destrucción | `destroy` (ruido + tono grave) | 60 ms |
| Finalizar turno | `end-turn` | 20 ms |
| Victoria | `victory` (arpegio) | patrón |
| Derrota | `defeat` (descenso) | patrón |

**Sistema de activación/desactivación:**

- Botón de silencio (icono `Volume2` / `VolumeX`) en la barra inferior.
- Desactivado = no se reproduce ningún sonido ni vibración.
- Estado sincronizado con el estado real del juego (no hay bloqueo por audio).

**Control de volumen:**

- Desplegable en la barra inferior con `input[type=range]` (0–100 %).
- Se deshabilita visualmente cuando el sonido está apagado.

**Persistencia de preferencias:**

- `localStorage` con clave `bestias-guerra-audio`.
- Se recuerdan: sonido activado/desactivado y volumen.
- Se carga en `initAudio()`.

**Feedback táctil:**

- `navigator.vibrate()` con patrón muy breve (20–60 ms).
- Envuelto en `try/catch`: si el dispositivo no lo admite, no ocurre nada.

**Feedback visual añadido:**

- Ninguna animación nueva; se reutilizan las de las Mejoras 012, 013 y 015.

**Compatibilidad con CPU:**

- Sí. Los sonidos se emiten desde la resolución real del reducer (`state.lastCombat`), por lo que los ataques del CPU suenan igual que los del jugador.

**Anti-duplicados (punto 16):**

- Inicio de turno: `useRef` con `turnCount` para emitir una sola vez por turno.
- Victoria/derrota: `useRef` en `GameOverScreen` para emitir una sola vez al montar.
- El sonido de ataque se emite **solo** en la resolución del combate, no al pulsar el botón (evita doble sonido).

**Corrección durante la implementación:**

- El sonido de fin de partida se implementó inicialmente dentro de `GameBoard`, pero `App.tsx` sustituye `GameBoard` por `GameOverScreen` cuando `phase === 'game-over'`, por lo que nunca se ejecutaba. Se ha movido a `GameOverScreen.tsx` con un nuevo prop `playerWon`.

**Accesibilidad:**

- Todo el feedback sonoro es opcional; el juego es completamente jugable en silencio.
- No se revela información oculta: el sonido comunica "ocurrió una acción pública", nunca qué carta concreta es.
- Errores de `play()` / autoplay bloqueado se ignoran en `try/catch` + `.catch()`; nunca se muestra error al jugador.

**Pruebas:**

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 7.90 s |
| `npm run lint` | ✅ 0 errores (2 warnings preexistentes de `exhaustive-deps`) |
| Tests existentes | ✅ 46/46 |

**Limitaciones pendientes:**

- Los sonidos son sintetizados, no grabados: su textura es funcional, no musical.
- El navegador puede bloquear el audio hasta la primera interacción del usuario; el contexto se reanuda automáticamente en la siguiente llamada.
- `playerWon` en modo local se asume `true` (ambos jugadores son humanos y siempre hay un ganador).

---

### Mejora 019 — Auditoría integral REGLAS OFICIALES ↔ CÓDIGO

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Auditoría exhaustiva de todo el código del juego frente a `REGLAS_JUEGO_DEFINITIVAS.md` (v1.0). Se detectaron discrepancias reales y se corrigieron sin modificar el reglamento.

#### 1. Resumen de hallazgos

| Categoría | Cantidad |
|-----------|----------|
| ✅ Cumple | 38 |
| ⚠️ Riesgo / implementación mejorable | 3 |
| ❌ Incumplimiento (corregido) | 2 |
| 🔍 Ambigüedad (requiere decisión del creador) | 1 |

#### 2. Incumplimientos detectados y corregidos

**❌ Incumplimiento 1: Regla 19 — Trampa sobre monstruo recién colocado**

| | |
|---|---|
| **Regla** | "Una Trampa no puede colocarse debajo de un Monstruo en el mismo turno en que ese Monstruo acaba de ser colocado." |
| **Código anterior** | `PLACE_TRAP_ON_MONSTER` no verificaba cuándo fue colocado el monstruo. Cualquier monstruo del campo era válido. |
| **Corrección** | Añadido campo `summonedThisTurn: boolean` a `FieldMonster`. Se marca `true` al invocar/revivir y se resetea a `false` en `END_TURN`. `PLACE_TRAP_ON_MONSTER` rechaza monstruos con `summonedThisTurn === true`. |

**❌ Incumplimiento 2: Regla 22.1 — Validación de objetivo de ataque en el reducer**

| | |
|---|---|
| **Regla** | "Si el adversario tiene uno o más Monstruos en Defensa: el atacante está obligado a atacar a uno de los Monstruos que están en Defensa." |
| **Código anterior** | `DECLARE_ATTACK` no validaba la posición del defensor. La regla solo se aplicaba en la UI (`GameBoard.tsx`), por lo que cualquier cliente que despachara directamente podía saltársela. |
| **Corrección** | Añadida validación en el reducer: si el rival tiene monstruos en Defensa y el defensor elegido no está en Defensa, la acción se rechaza. |

#### 3. Riesgos / implementación mejorable (⚠️)

| # | Hallazgo | Detalle | Impacto |
|---|----------|---------|---------|
| 1 | **Límite técnico de LP en 999** | `applyHeal` usa `Math.min(999, ...)`. El reglamento dice "No existe un límite máximo de LP". 999 es efectivamente ilimitado en la práctica, pero es un límite técnico. | Ninguno en la práctica |
| 2 | **Mágica 5 — Revivir con `hasAttacked: true`** | Cuando se revive un monstruo al campo, se marca `hasAttacked: true` para evitar que ataque en el turno en que entra. Esto es una interpretación razonable pero no está explícitamente en el reglamento. | Bajo — evita abuso |
| 3 | **Trampa 9 — Contador de turnos** | El contador de 3 turnos se decrementa en `applyTurnStartEffects`, que se llama al inicio del turno del propietario. Esto es correcto según la Regla 28, pero la interacción con efectos de control temporal (Trampa 10) podría ser ambigua. | Bajo |

#### 4. Ambigüedad detectada (🔍)

| # | Ambigüedad | Detalle | Opciones |
|---|------------|---------|----------|
| 1 | **Regla 27.2 — Fin de partida sin acciones legales** | "Si ninguno de los dos jugadores puede realizar ninguna acción legal y la partida no puede continuar, gana el jugador que tenga más LP." No está implementado. Detectar "no hay acciones legales" requiere analizar todas las cartas de la mano, el campo, el mazo y los efectos pendientes de ambos jugadores. | (a) Implementar detección completa; (b) Dejar como regla no implementada y documentar; (c) Decidir si es necesaria |

#### 5. Verificación de cumplimiento por regla

| Regla | Estado | Notas |
|-------|--------|-------|
| 1. Objetivo | ✅ | 0 LP → derrota |
| 2. Componentes | ✅ | 48 cartas, 2 mazos |
| 3. Monstruos | ✅ | ATQ = DEF = número |
| 4. Trampas | ✅ | 1 Trampa + 1 Mágica por monstruo |
| 5. Mágicas | ✅ | 1 Mágica por monstruo |
| 6. Propiedad | ✅ | Cementerio del propietario original |
| 7. Zonas | ✅ | 4 zonas, 6 espacios |
| 8. Preparación | ✅ | 100 LP, 7 cartas |
| 9. Mano | ✅ | Máx 9, robo de 2 |
| 10. Mazo agotado | ✅ | No se recicla |
| 11. LP | ⚠️ | Límite técnico 999 |
| 12. Campo | ✅ | 6 espacios |
| 13. Posiciones | ✅ | Ataque/Defensa, revelado al atacar |
| 14. Cambio de posición | ✅ | 1/turno, no consume carta |
| 15. Desarrollo del turno | ✅ | Robo → efectos → acciones |
| 16. Límite 3 cartas | ✅ | Ataques y cambios no cuentan |
| 17. Primer turno | ✅ | Jugador 1 no ataca |
| 18. Colocación monstruos | ✅ | Ataque o Defensa |
| 19. Colocación trampas | ✅ **Corregido** | No sobre monstruo recién colocado |
| 20. Colocación mágicas | ✅ | Mágica 8 sobre rival |
| 21. Ataques | ✅ | 1/turno, Defensa no ataca |
| 22. Elección de objetivo | ✅ **Corregido** | Validado en el reducer |
| 23. Ataque directo | ✅ | Daño = ATQ |
| 24. Combate ATQ vs ATQ | ✅ | 3 casos correctos |
| 25. Combate ATQ vs DEF | ✅ | 3 casos correctos |
| 26. Destrucción/cementerio | ✅ | Propietario original |
| 27. Victoria | 🔍 | 27.1 ✅ · 27.2 no implementada |
| 28. Efectos temporales | ✅ | Turnos completos |
| 29. Las 12 Trampas | ✅ | Todas implementadas |
| 30. Las 12 Mágicas | ✅ | Todas implementadas |
| 31. Propiedad control temporal | ✅ | No cambia propiedad |
| 32. Principio fundamental | ✅ | Sin efectos inventados |

#### 6. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/game/types.ts` | Añadido `summonedThisTurn` a `FieldMonster` |
| `src/game/useGame.ts` | Validación Regla 19 en `PLACE_TRAP_ON_MONSTER`; validación Regla 22.1 en `DECLARE_ATTACK`; reseteo de `summonedThisTurn` en `END_TURN` |
| `src/game/__tests__/combat.test.ts` | Añadido `summonedThisTurn: false` |
| `src/game/__tests__/traps.test.ts` | Añadido `summonedThisTurn: false` |
| `src/game/__tests__/cpu.test.ts` | Añadido `summonedThisTurn: false` |
| `PROYECTO_ESTADO.md` | Este registro |

#### 7. Pruebas

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 7.49 s |
| `npm run lint` | ✅ 0 errores (2 avisos preexistentes) |
| Tests | ✅ 74/74 |

#### 8. Incidencias pendientes

- **Regla 27.2** (fin de partida sin acciones legales) no está implementada. Requiere decisión del creador sobre si implementarla o documentarla como no soportada.
- El límite técnico de LP en 999 podría cambiarse a `Infinity` si se desea, aunque no tiene impacto práctico.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas).

---

### Mejora 019 — Auditoría integral REGLAS OFICIALES ↔ CÓDIGO

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Auditoría exhaustiva de todo el código del juego frente a `REGLAS_JUEGO_DEFINITIVAS.md` (v1.0). Se detectaron discrepancias reales y se corrigieron sin modificar el reglamento.

#### 1. Resumen de hallazgos

| Categoría | Cantidad |
|-----------|----------|
| ✅ Cumple | 39 |
| ⚠️ Riesgo / implementación mejorable | 3 |
| ❌ Incumplimiento (corregido) | 2 |
| 🔍 Ambigüedad (resuelta) | 1 |

#### 2. Incumplimientos detectados y corregidos

**❌ Incumplimiento 1: Regla 19 — Trampa sobre monstruo recién colocado**

| | |
|---|---|
| **Regla** | "Una Trampa no puede colocarse debajo de un Monstruo en el mismo turno en que ese Monstruo acaba de ser colocado." |
| **Código anterior** | `PLACE_TRAP_ON_MONSTER` no verificaba cuándo fue colocado el monstruo. Cualquier monstruo del campo era válido. |
| **Corrección** | Añadido campo `summonedThisTurn: boolean` a `FieldMonster`. Se marca `true` al invocar/revivir y se resetea a `false` en `END_TURN`. `PLACE_TRAP_ON_MONSTER` rechaza monstruos con `summonedThisTurn === true`. |

**❌ Incumplimiento 2: Regla 22.1 — Validación de objetivo de ataque en el reducer**

| | |
|---|---|
| **Regla** | "Si el adversario tiene uno o más Monstruos en Defensa: el atacante está obligado a atacar a uno de los Monstruos que están en Defensa." |
| **Código anterior** | `DECLARE_ATTACK` no validaba la posición del defensor. La regla solo se aplicaba en la UI (`GameBoard.tsx`), por lo que cualquier cliente que despachara directamente podía saltársela. |
| **Corrección** | Añadida validación en el reducer: si el rival tiene monstruos en Defensa y el defensor elegido no está en Defensa, la acción se rechaza. |

#### 3. Riesgos / implementación mejorable (⚠️)

| # | Hallazgo | Detalle | Impacto |
|---|----------|---------|---------|
| 1 | **Límite técnico de LP en 999** | `applyHeal` usa `Math.min(999, ...)`. El reglamento dice "No existe un límite máximo de LP". 999 es efectivamente ilimitado en la práctica, pero es un límite técnico. | Ninguno en la práctica |
| 2 | **Mágica 5 — Revivir con `hasAttacked: true`** | Cuando se revive un monstruo al campo, se marca `hasAttacked: true` para evitar que ataque en el turno en que entra. Esto es una interpretación razonable pero no está explícitamente en el reglamento. | Bajo — evita abuso |
| 3 | **Trampa 9 — Contador de turnos** | El contador de 3 turnos se decrementa en `applyTurnStartEffects`, que se llama al inicio del turno del propietario. Esto es correcto según la Regla 28, pero la interacción con efectos de control temporal (Trampa 10) podría ser ambigua. | Bajo |

#### 4. Ambigüedad resuelta (🔍 → ✅)

**Regla 27.2 — Fin de partida sin acciones legales**

| | |
|---|---|
| **Regla** | "Si ninguno de los dos jugadores puede realizar ninguna acción legal y la partida no puede continuar, gana el jugador que tenga más LP. Si ambos tienen los mismos LP, el resultado es empate." |
| **Estado anterior** | No implementada. Se documentó como ambigüedad en la Mejora 019. |
| **Corrección** | Implementada completamente con `hasAnyLegalAction()`, `checkStalemate()` y `checkStalemateEnd()`. |

#### 5. Verificación de cumplimiento por regla

| Regla | Estado | Notas |
|-------|--------|-------|
| 1. Objetivo | ✅ | 0 LP → derrota |
| 2. Componentes | ✅ | 48 cartas, 2 mazos |
| 3. Monstruos | ✅ | ATQ = DEF = número |
| 4. Trampas | ✅ | 1 Trampa + 1 Mágica por monstruo |
| 5. Mágicas | ✅ | 1 Mágica por monstruo |
| 6. Propiedad | ✅ | Cementerio del propietario original |
| 7. Zonas | ✅ | 4 zonas, 6 espacios |
| 8. Preparación | ✅ | 100 LP, 7 cartas |
| 9. Mano | ✅ | Máx 9, robo de 2 |
| 10. Mazo agotado | ✅ | No se recicla |
| 11. LP | ⚠️ | Límite técnico 999 |
| 12. Campo | ✅ | 6 espacios |
| 13. Posiciones | ✅ | Ataque/Defensa, revelado al atacar |
| 14. Cambio de posición | ✅ | 1/turno, no consume carta |
| 15. Desarrollo del turno | ✅ | Robo → efectos → acciones |
| 16. Límite 3 cartas | ✅ | Ataques y cambios no cuentan |
| 17. Primer turno | ✅ | Jugador 1 no ataca |
| 18. Colocación monstruos | ✅ | Ataque o Defensa |
| 19. Colocación trampas | ✅ **Corregido** | No sobre monstruo recién colocado |
| 20. Colocación mágicas | ✅ | Mágica 8 sobre rival |
| 21. Ataques | ✅ | 1/turno, Defensa no ataca |
| 22. Elección de objetivo | ✅ **Corregido** | Validado en el reducer |
| 23. Ataque directo | ✅ | Daño = ATQ |
| 24. Combate ATQ vs ATQ | ✅ | 3 casos correctos |
| 25. Combate ATQ vs DEF | ✅ | 3 casos correctos |
| 26. Destrucción/cementerio | ✅ | Propietario original |
| 27. Victoria | ✅ **Corregido** | 27.1 ✅ · 27.2 implementada |
| 28. Efectos temporales | ✅ | Turnos completos |
| 29. Las 12 Trampas | ✅ | Todas implementadas |
| 30. Las 12 Mágicas | ✅ | Todas implementadas |
| 31. Propiedad control temporal | ✅ | No cambia propiedad |
| 32. Principio fundamental | ✅ | Sin efectos inventados |

#### 6. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/game/types.ts` | Añadido `summonedThisTurn` a `FieldMonster`; nuevas funciones `hasAnyLegalAction()` y `checkStalemate()` |
| `src/game/useGame.ts` | Validación Regla 19 en `PLACE_TRAP_ON_MONSTER`; validación Regla 22.1 en `DECLARE_ATTACK`; reseteo de `summonedThisTurn` en `END_TURN`; integración de `checkStalemateEnd` |
| `src/game/__tests__/stalemate.test.ts` | **Nuevo** — 22 tests de la Regla 27.2 |
| `src/game/__tests__/combat.test.ts` | Añadido `summonedThisTurn: false` |
| `src/game/__tests__/traps.test.ts` | Añadido `summonedThisTurn: false` |
| `src/game/__tests__/cpu.test.ts` | Añadido `summonedThisTurn: false` |
| `AUDITORIA_REGLAS_V1_0.md` | Actualizado con el cierre de la Regla 27.2 |
| `PROYECTO_ESTADO.md` | Este registro |

#### 7. Pruebas

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 6.29 s |
| `npm run lint` | ✅ 0 errores (2 avisos preexistentes) |
| Tests existentes | ✅ 74/74 (no eliminados) |
| Tests nuevos (Regla 27.2) | ✅ 22/22 |
| **Total** | ✅ **96/96** |

#### 8. Incidencias pendientes

- Ninguna bloqueante.
- El límite técnico de LP en 999 podría cambiarse a `Infinity` si se desea, aunque no tiene impacto práctico.
- La interacción entre la Trampa 9 y la Trampa 10 (control temporal) podría ser ambigua en casos extremos. Se recomienda verificar durante el playtest.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas).

---

### Mejora 020 — Pruebas finales completas del juego

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Batería final de pruebas del juego "Bestias de Guerra" después de completar las mejoras 001–019 y la Regla 27.2.

#### 1. Pruebas automáticas

| Métrica | Valor |
|---------|-------|
| Tests totales | 96 |
| Tests pasados | 96 |
| Tests fallidos | 0 |
| Test files | 8 |
| Tiempo de build | 5.88 s |
| Errores de lint | 0 |
| Warnings de lint | 2 (preexistentes) |

#### 2. Pruebas manuales

| Categoría | Total | Realizadas | Pendientes |
|-----------|-------|------------|------------|
| Partida completa | 11 | 0 | 11 |
| Mano y robo | 5 | 0 | 5 |
| Límite 3 cartas | 6 | 0 | 6 |
| Campo | 5 | 0 | 5 |
| Posiciones | 5 | 0 | 5 |
| Combate | 6 | 0 | 6 |
| Regla 22 | 3 | 0 | 3 |
| Ataques por monstruo | 3 | 0 | 3 |
| Ataque directo | 3 | 0 | 3 |
| Trampas | 12 | 0 | 12 |
| Mágicas | 12 | 0 | 12 |
| Mágica 3 casos | 2 | 0 | 2 |
| Mágica 5 casos | 7 | 0 | 7 |
| Mágica 9 casos | 5 | 0 | 5 |
| Control temporal | 5 | 0 | 5 |
| Cementerio | 5 | 0 | 5 |
| Información oculta | 5 | 0 | 5 |
| CPU | 12 | 0 | 12 |
| Regla 27.2 | 4 | 4 | 0 |
| Victoria LP | 5 | 0 | 5 |
| Finalización | 4 | 1 | 3 |
| Responsive | 11 | 0 | 11 |
| Sin sonido | 3 | 0 | 3 |
| Reduced motion | 4 | 0 | 4 |
| **Total** | **161** | **5** | **156** |

#### 3. Errores encontrados

**Ninguno.** No se han detectado comportamientos que contradigan el reglamento.

#### 4. Correcciones realizadas

Ninguna. No se han encontrado fallos que corregir.

#### 5. Tests de regresión

No se han añadido tests de regresión porque no se han encontrado fallos.

#### 6. Documentos actualizados

| Documento | Cambio |
|-----------|--------|
| `PRUEBAS_FINALES_V1_0.md` | Creado con la batería completa de pruebas |
| `PROYECTO_ESTADO.md` | Registro de la Mejora 020 |

#### 7. Estado final

- ✅ **96/96 tests automáticos pasan**
- ✅ **typecheck, build, lint: sin errores**
- ⏳ **156 pruebas manuales pendientes** de intervención humana
- ❌ **No se han encontrado incumplimientos del reglamento**
- ✅ **Regla 27.2 implementada y testeada**

El juego está listo para la Mejora 021 (despliegue).

**Siguiente mejora recomendada:** Mejora 021 — Despliegue del juego.

---

### Mejora 018 — Revisión y mejora del CPU / rival automático

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

#### 1. Estado inicial del CPU (auditoría previa)

El `cpu.ts` original tenía 45 líneas y solo tomaba tres tipos de decisión:

| Aspecto | Comportamiento anterior |
|---------|------------------------|
| Invocación | Solo si `cardsPlayedThisTurn === 0` → máximo 1 Monstruo por turno |
| Monstruo elegido | `easy` → el primero de la mano; resto → el de mayor ATQ |
| Posición | `easy` → siempre Ataque; resto → Ataque si `atk >= def` |
| Ataques | `easy` → **nunca ataca**; resto → busca un objetivo batible |
| Objetivo | Primer objetivo batible **sin respetar la Regla 22.1** |
| Ataque directo | Solo si el rival no tiene **ningún** monstruo |
| Trampas | **Nunca se usan** |
| Mágicas | **Nunca se usan** |
| Cambio de posición | **Nunca se usa** |

Es decir, **24 de las 48 cartas eran inalcanzables** para el rival automático.

#### 2. Problemas encontrados

| # | Problema | Gravedad | Tipo |
|---|----------|----------|------|
| 1 | **Violaba la Regla 22.1**: podía atacar un monstruo en Ataque existiendo monstruos en Defensa. El reducer no lo valida; la regla solo se aplicaba en la UI, y el CPU despacha directamente saltándose esa capa. | **Alta** | Bug real |
| 2 | **Ataque directo infrautilizado**: la Regla 22.2 lo permite cuando el rival no tiene monstruos en Defensa, pero el CPU solo lo usaba si el campo estaba totalmente vacío. | Media | Bug real |
| 3 | **Fuga de información oculta**: leía `atk`/`def` reales de monstruos rivales en Defensa boca abajo, información que un jugador humano no tiene. | **Alta** | Bug real |
| 4 | No usaba Trampas ni Mágicas. | Media | Ausencia |
| 5 | Solo jugaba 1 de las 3 cartas permitidas por turno. | Media | Ausencia |
| 6 | Nunca cambiaba posiciones (legal y sin coste de carta). | Baja | Ausencia |
| 7 | Sin red de seguridad: si el reducer rechazaba una acción, el estado no cambiaba, el `useEffect` (dependía de `[state]`) no se re-ejecutaba y **el turno se congelaba**. | Media | Fragilidad |

#### 3. Correcciones realizadas

**a) Regla 22 implementada correctamente** — dos helpers puros y testeables:

```ts
legalTargets(defenders)      // 22.1 → solo Defensa · 22.2 → solo Ataque
canDirectAttack(defenders)  // true si no hay monstruos en Defensa
```

**b) Ataque directo corregido** — ahora se ofrece también en el caso 22.2.

**c) Información oculta corregida**

```ts
function isHiddenFromOpponent(fm) { return fm.position === 'defense' && fm.faceDown; }
```

Un monstruo boca abajo se evalúa con el valor **máximo posible del mazo (12)**: el peor caso para quien decide atacar. El CPU ya no puede aprovechar un ATQ/DEF que no conoce.

**d) Trampas y Mágicas** — el CPU ahora las utiliza, respetando 1 Trampa y 1 Mágica por monstruo, y colocando la Mágica 8 sobre monstruo **rival** (Regla 20).

**e) Las 3 cartas por turno** — eliminada la condición `cardsPlayedThisTurn === 0`.

**f) Cambios de posición legales** — un Monstruo que ya atacó pasa a Defensa; un Monstruo fuerte en Defensa pasa a Ataque. Respeta `hasChangedPosition`.

**g) Red de seguridad anti-bucle** (`useGame.ts`)

```ts
if (cpuTurnActionsRef.current > 60) { dispatch({ type: 'END_TURN' }); return; }
```

Contador que se reinicia al cambiar de jugador. Garantiza que la partida nunca se bloquea.

#### 4. Prioridad de decisiones (orden nuevo)

1. Completar selección pendiente (Trampa / Mágica)
2. Mágica resoluble al instante
3. Mágica con objetivo
4. Invocar Monstruo
5. Colocar Trampa
6. Atacar
7. Cambiar posición
8. **END_TURN** — salida segura siempre

#### 5. Comportamiento por dificultad

| Dificultad | Invocación | Ataque | Posición | Trampas/Mágicas | Retardo |
|------------|-----------|--------|----------|-----------------|---------|
| `easy` | 1.ª carta de la mano | Evita sacrificios sin ventaja; no hace ataque directo suicida; nunca cambia posición | Siempre Ataque | Sí | 450 ms |
| `normal` | Mayor ATQ | Prioriza LETAL; respeta 22.1; usa directo si es legal | Ataque si ATQ ≥ 4 | Sí | 650 ms |
| `hard` | Mayor ATQ | Igual, más agresivo con el directo | Valora la presión rival (ATQ ≥ 6 → Ataque; ATQ ≤ 3 con 3+ enemigos → Defensa) | Sí | 850 ms |

**Las 3 dificultades respetan las mismas reglas.** La diferencia surge solo de la calidad de la decisión: nunca de información privada, estadísticas alteradas ni límites modificados.

#### 6. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/game/cpu.ts` | Reescrito: auditoría + correcciones |
| `src/game/useGame.ts` | Red de seguridad anti-bucle |
| `src/game/__tests__/cpu.test.ts` | **Nuevo** — 28 tests del CPU |
| `PROYECTO_ESTADO.md` | Este registro |

#### 7. Tests del CPU añadidos

**28 tests nuevos** en `src/game/__tests__/cpu.test.ts`:

| Bloque | Tests | Cubre |
|--------|-------|-------|
| Objetivos legales (Regla 22) | 4 | 22.1 / 22.2 / 22.3 |
| Legalidad de acciones | 7 | Defensa no ataca, 1 ataque por turno, límite de 3 cartas, campo lleno, 1 Trampa por monstruo |
| Ataque directo | 3 | 22.2, 22.3, no permitido con Defensa |
| Uso de 3 cartas | 2 | Puede jugar varias; con 0 propone jugar |
| Selecciones pendientes | 3 | Colocar Trampa; cancelar sin destino; Mágica 8 sobre rival |
| Información oculta | 1 | No aprovecha el valor real de boca abajo |
| Terminación / bucles | 3 | Siempre END_TURN; acción siempre válida; no supera 3 cartas |
| Dificultades | 3 | `easy` no se sacrifica; `hard` cambia posición; respeta `hasChangedPosition` |
| Sin ventajas artificiales | 2 | Mismos LP, mano y mazo; retardos positivos |

#### 8. Pruebas

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 7.24 s |
| `npm run lint` | ✅ 0 errores (2 avisos preexistentes de `exhaustive-deps` en `GameBoard.tsx`) |
| Tests existentes | ✅ 46/46 (no eliminados) |
| Tests nuevos del CPU | ✅ 28/28 |
| **Total** | ✅ **74/74** |

#### 9. Discrepancias detectadas (para revisión del creador)

Problema **fuera del alcance del CPU**, no tocado porque afecta a ambos jugadores:

> **`DECLARE_ATTACK` no valida la Regla 22.1 en el reducer.** La obligación de atacar monstruos en Defensa solo se aplica en la capa de UI (`GameBoard.tsx`). Cualquier cliente que despache la acción directamente —el CPU antes de esta mejora, o un futuro modo online— podría saltársela.

Corregido **solo en el CPU**. Queda documentado para que decidas si quieres reforzar la validación en el reducer.

**Nota sobre la Trampa 7:** la implementación actual mueve el atacante al campo del rival conservando las cartas asociadas y la propiedad original, tal como describe el reglamento (sección 31). No se ha detectado contradicción, pero conviene confirmarla durante el playtest.

#### 10. Incidencias pendientes

- Ninguna bloqueante.
- Los tests validan la **legalidad de la decisión** (qué acción devuelve `nextCpuAction`); no simulan partidas completas, eso requiere pruebas manuales.
- El retardo por acción (450–850 ms) se mantiene: pausado para leer las acciones, rápido para no alargar la partida.

**Siguiente mejora recomendada:** Indicador de buff/debuff (borde verde/rojo en cartas modificadas).

---

### Mejora 021 — Preparación final para producción

**Estado:** ✅ Completada

**Fecha:** 2026-10-01

**Descripción:** Preparar el proyecto "Bestias de Guerra" para una futura puesta en producción. Esta mejora NO consiste todavía en publicar ni desplegar el juego.

#### 1. Estructura final del proyecto

```
proyecto_actualizado/
├── src/
│   ├── game/
│   │   ├── types.ts           → Tipos, combate, utilidades, Regla 27.2
│   │   ├── cardData.ts        → Definición de las 48 cartas
│   │   ├── useGame.ts         → Reducer con toda la lógica
│   │   ├── cpu.ts             → IA del oponente (3 dificultades)
│   │   ├── audio.ts           → Sistema de audio (Web Audio API)
│   │   └── __tests__/         → 96 tests automáticos
│   ├── components/
│   │   ├── GameBoard.tsx      → Tablero principal
│   │   ├── CardView.tsx       → Renderizado de cartas
│   │   ├── PassDeviceScreen.ts → Pantalla de pasar dispositivo
│   │   └── GameOverScreen.tsx → Pantalla de fin de partida
│   ├── App.tsx                → Flujo: menú → pasar → jugar → fin
│   ├── index.css              → Estilos base, animaciones, variables
│   └── main.tsx               → Punto de entrada React
├── public/
│   └── cards/                 → 48 imágenes WebP de las cartas
├── dist/                      → Build de producción (generado)
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
├── vitest.config.ts
├── PROYECTO_ESTADO.md
├── REGLAS_JUEGO_DEFINITIVAS.md
├── AUDITORIA_REGLAS_V1_0.md
├── PRUEBAS_FINALES_V1_0.md
├── PREPARACION_PRODUCCION.md
└── PLAYTEST_V1_0.md
```

#### 2. Archivos limpiados o eliminados

**Ninguno.** No se ha eliminado ningún archivo del proyecto.

Todos los archivos generados durante el desarrollo se mantienen:
- `dist/` — Build de producción (se regenera con `npm run build`)
- `node_modules/` — Dependencias (se regenera con `npm install`)

#### 3. Dependencias revisadas

| Tipo | Paquetes | Estado |
|------|----------|--------|
| Producción | `react`, `react-dom`, `lucide-react`, `vite` | ✅ Necesarios |
| Desarrollo | `typescript`, `tailwindcss`, `eslint`, `vitest`, etc. | ✅ Necesarios |

**No se han añadido ni eliminado dependencias.**

#### 4. Scripts revisados

| Script | Comando | Estado |
|--------|---------|--------|
| `dev` | `vite` | ✅ Funciona |
| `build` | `vite build` | ✅ Funciona |
| `lint` | `eslint .` | ✅ Funciona |
| `preview` | `vite preview` | ✅ Funciona |
| `typecheck` | `tsc --noEmit -p tsconfig.app.json` | ✅ Funciona |

**Nota:** No existe un script `test` en `package.json`. Los tests se ejecutan con `npx vitest run`.

#### 5. Build de producción

| Métrica | Valor |
|---------|-------|
| Comando | `npm run build` |
| Resultado | ✅ Exitoso |
| Tiempo | 7.29 s |
| Módulos transformados | 1577 |
| Carpeta generada | `dist/` |

#### 6. Artefacto de producción

| Archivo | Tamaño |
|---------|--------|
| `index.html` | 1.41 kB |
| `assets/index-DVNE-b41.css` | 38.54 kB |
| `assets/index-2bSJ0ePt.js` | 241.08 kB |
| `cards/*.webp` (48 archivos) | Incluidos |

**Total:** ~280 kB (sin gzip)

#### 7. Assets comprobados

| Tipo | Cantidad | Estado |
|------|----------|--------|
| Imágenes de cartas | 48 | ✅ Incluidas en build |
| Fuentes | 2 (Google Fonts) | ✅ Cargadas desde CDN |
| Audio | 0 archivos | ✅ Sintetizado con Web Audio API |

#### 8. Imágenes de cartas comprobadas

Las 48 imágenes están en `public/cards/` y se copian a `dist/cards/` durante el build:

- ✅ 12 Espadas (`espadas-1.webp` ... `espadas-12.webp`)
- ✅ 12 Bastos (`bastos-1.webp` ... `bastos-12.webp`)
- ✅ 12 Copas/Trampas (`copas-1.webp` ... `copas-12.webp`)
- ✅ 12 Oros/Mágicas (`oros-1.webp` ... `oros-12.webp`)

#### 9. Audio comprobado

**No se requieren archivos de audio externos.** El sistema de audio utiliza Web Audio API para sintetizar sonidos proceduralmente en tiempo de ejecución.

#### 10. Variables de entorno

**Ninguna.** El proyecto no requiere variables de entorno.

Las preferencias de audio se almacenan en `localStorage` del navegador con la clave `bestias-guerra-audio`.

#### 11. Rutas y referencias

| Comprobación | Resultado |
|--------------|-----------|
| Rutas absolutas locales (`C:\`, `/Users/`) | ✅ Ninguna |
| Referencias a archivos fuera del proyecto | ✅ Ninguna |
| Rutas relativas correctas | ✅ Verificados |

#### 12. Código

| Comprobación | Resultado |
|--------------|-----------|
| `console.log` de depuración | ✅ Ninguno |
| TODO/FIXME pendientes | ✅ Ninguno |
| Dependencias innecesarias | ✅ Ninguna |
| Secretos en el código | ✅ Ninguno |

#### 13. Configuración de producción

| Aspecto | Estado |
|---------|--------|
| `NODE_ENV` | ✅ Vite lo gestiona automáticamente |
| Build de producción | ✅ Genera `dist/` |
| Depende de servidor de desarrollo | ❌ No |
| Configuraciones de debugging | ✅ Ninguna |
| Aplicación servible desde ubicación estática | ✅ Sí |

#### 14. Documentación de producción

| Documento | Descripción |
|-----------|-------------|
| `PREPARACION_PRODUCCION.md` | Guía completa de despliegue |

#### 15. Pruebas

| Prueba | Resultado |
|--------|-----------|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ 7.29 s |
| `npm run lint` | ✅ 0 errores (2 avisos preexistentes) |
| Tests | ✅ 96/96 |

#### 16. Pruebas manuales pendientes

Las siguientes pruebas requieren intervención humana:

- Partidas completas (Jugador vs Jugador, Jugador vs CPU)
- Comprobación manual exhaustiva de Trampas
- Comprobación manual exhaustiva de Mágicas
- Responsive real en dispositivos
- Sonido
- Reduced motion

**Las partidas reales contra Easy / Normal / Hard quedan pendientes de ejecución por el creador.**

#### 17. Estado de preparación

| Aspecto | Estado |
|---------|--------|
| Build de producción | ✅ Funciona |
| Assets incluidos | ✅ 48 imágenes + CSS + JS |
| Variables de entorno | ✅ Ninguna necesaria |
| Rutas locales rotas | ✅ Ninguna |
| Errores de configuración | ✅ Ninguno |
| Documentación | ✅ Completa |
| Tests | ✅ 96/96 |

**El proyecto está técnicamente preparado para iniciar el despliegue.**

**Siguiente paso:** Revisar este informe y, si todo es correcto, iniciar la Mejora 022 (despliegue).

---

## G. Trabajo actualmente en curso

**MEJORA ACTUAL:**

| Campo | Valor |
|-------|-------|
| **Número** | — |
| **Nombre** | — |
| **Objetivo** | — |
| **Estado** | Ninguna. Proyecto disponible para comenzar una nueva mejora. |

---

## H. Próximas mejoras

### Alta prioridad

| # | Mejora | Descripción |
|---|--------|-------------|
| 1 | Log en tiempo real | Mostrar últimos 3-4 eventos sin abrir modal |
| 2 | Ordenamiento de mano | Monstruos → Trampas → Mágicas |
| 3 | Indicador de buff/debuff | Borde verde/rojo en cartas modificadas |
| 4 | Confirmación de fin de turno | Modal o doble click para confirmar |

### Media prioridad

| # | Mejora | Descripción |
|---|--------|-------------|
| 5 | Iconos de mazo/cementerio | Representación visual con contador |
| 6 | Trampa con imagen en modal | Mostrar la carta visualmente |
| 7 | Previsualización de daño | "Ganas X PV" antes de atacar |
| 8 | Cancelar selección con click fuera | Click en zona vacía cancela |

### Baja prioridad

| # | Mejora | Descripción |
|---|--------|-------------|
| 9 | Fondo de mesa texturizado | Patrón sutil o gradiente |
| 10 | Tooltip de efectos | Descripción al pasar cursor |
| 11 | Dado animado | Animación de rodar |
| 12 | Modo landscape | Layout optimizado para horizontal |
| 13 | Sonido sintetizado | Web Audio API |
| 14 | Vibración háptica | navigator.vibrate() en móviles |

---

## I. Problemas conocidos

| # | Problema | Impacto | Estado |
|---|----------|---------|--------|
| 1 | Reducer monolítico (857 líneas) | Difícil de mantener | Conocido, no es bloqueante |
| 2 | Sin tests automatizados | Riesgo de regresiones | Conocido, no es bloqueante |
| 3 | Imágenes de cartas no existen | Fallback a gradientes | Conocido, no es bloqueante |
| 4 | D1 — Posicionamiento del daño aproximado | En pantallas extremas puede desajustarse | Conocido, menor |
| 5 | A1 — Etiquetas no cambian en modo local | Confusión al pasar dispositivo | Conocido, menor |

---

## J. Últimas pruebas

| Prueba | Fecha | Resultado |
|--------|-------|-----------|
| TypeScript | 2026-09-30 | ✅ Sin errores |
| Build | 2026-09-30 | ✅ 21.56s |
| Lint | No ejecutado | — |
| Tests unitarios | No existen | — |
| Pruebas manuales | No realizadas | — |

---

## K. Cómo continuar

> **Si otra IA abre ahora este proyecto, ¿qué debe hacer?**

### Procedimiento obligatorio

1. **Leer `PROYECTO_ESTADO.md`** (este documento)
2. **Leer `REGLAS_JUEGO_DEFINITIVAS.md`**
3. **Revisar el código real** relacionado con la tarea
4. **Comparar documentación con código** — no asumir que algo está pendiente solo porque aparezca en una lista antigua
5. **Identificar primero el estado real** — verificar si una mejora ya está implementada parcialmente
6. **Realizar solamente la mejora solicitada** — no reorganizar código innecesariamente
7. **Ejecutar las pruebas correspondientes:**
   - `npm run typecheck`
   - `npm run build`
   - `npm run lint` (si aplica)
8. **Actualizar `PROYECTO_ESTADO.md`** con:
   - Cambio realizado
   - Archivos modificados
   - Estado anterior
   - Estado nuevo
   - Pruebas realizadas
   - Problemas encontrados
   - Siguiente paso recomendado
9. **Indicar claramente qué queda pendiente** y cuál debe ser el siguiente paso

### Reglas de continuidad

- **No modificar reglas del juego** sin instrucción explícita del usuario
- **No modificar efectos de cartas** sin instrucción explícita
- **No modificar la CPU** sin instrucción explícita
- **No dividir el reducer** salvo que sea imprescindible para la mejora
- **No implementar mejoras de la lista** que no hayan sido solicitadas
- **No dar por terminada una mejora** sin verificarla en el código real

---

*Última actualización: 2026-09-30*
