# Auditoría de seguridad online — v0/card-lost-eslint-release

## Estado de Git

- Rama: `v0/card-lost-eslint-release` (detached HEAD).
- SHA inicial y final: `c0be229034b131bc0d769dbd9ad1546d800c80a4`.
- Árbol de trabajo limpio.
- Base de fusión: `fusion-de-ramas` @ `8b9202722f61c0f44c3ed0ae4516dfc862753af1`.

## PR #12

- Estado: open.
- Título: "Fix CARD_LOST and correct game rules".
- Head: `v0/card-lost-eslint-release` @ `c0be229`.
- Base: `fusion-de-ramas`.
- Sin conflictos detectados (merge-base = 8b92027, v0 añade 8 commits encima).

## Verificaciones ejecutadas

- `npm run test`: ✅ 472/472 superados (29 archivos).
- `npm run typecheck`: ✅ sin errores.
- `npm run lint`: ✅ 0 errores.
- `npm run build`: ✅ `✓ built in 17.74s`.

## Archivos revisados

- `src/hooks/useOnlineGame.ts` — hook online (single channel `game-room:<id>`, broadcast `game-sync` con ambas vistas filtradas, `realGameStateRef` como fuente de verdad, host procesa acciones).
- `src/game/onlineState.ts` — filtrado client-side de mano/mazo/campo/trampas/mágicas/selecciones pendientes del rival.
- `supabase/schema.sql` — RLS permisivo ("Anyone can ...").
- `supabase/migrations/DRAFT_20260119_private_online_state.sql` — borrador con mejoras de RLS pero con defectos.
- `src/game/__tests__/onlineState.test.ts` — 10 tests de filtrado.

## Problemas encontrados

1. **Filtrado solo client-side.** `filterOnlineState` oculta cartas del rival en la vista, pero el host envía `gameStateP1` y `gameStateP2` por el mismo canal `game-sync`. Un cliente malicioso puede leer la vista del rival del payload. **Severidad: Alta.**
2. **Sin autenticación real.** Se usa `crypto.randomUUID()` como `playerId` sin Supabase Auth. Cualquiera puede suplantar. **Severidad: Crítica.**
3. **Sin validación autoritativa.** El host aplica el reducer localmente y difunde el resultado; el servidor no valida acciones, turno ni legalidad. **Severidad: Crítica.**
4. **RLS permisivo en `schema.sql`.** "Anyone can view/create/update/delete" sin auth. **Severidad: Crítica.**
5. **Borrador SQL: borrado indiscriminado.** `delete from game_rooms where player1_uid is null` elimina todas las salas antiguas. **Severidad: Alta.** (Corregido en el borrador: estrategia de cuarentena.)
6. **Borrador SQL: `split_part(realtime.topic(), ':', 2)`** asume que el id de sala no contiene `:`. Los códigos son alfanuméricos de 6 caracteres, así que es seguro, pero frágil si cambia el formato.
7. **`lastCombat`, `log`, `diceResult`** se transmiten sin filtrar; pueden filtrar nombres de cartas ocultas. **Severidad: Media.**
8. **Sin Edge Function.** No existe validación en servidor. **Severidad: Crítica.**
9. **Sin canales privados separados.** Un solo canal `game-room:<id>` para ambos jugadores. **Severidad: Alta.**

## Correcciones realizadas

1. **SQL draft:** reemplazado el borrado indiscriminado por estrategia de conservación/cuarentena/migración/eliminación selectiva con copia de seguridad y reversión.
2. **Edge Function skeleton:** creado `supabase/functions/validate-action/index.ts` (no desplegado). Incluye verificación de JWT, carga de estado privado, validación de pertenencia y turno, persistencia y placeholder de validación de acción.
3. **Documentación:** este archivo.

## Lo que NO se ha implementado (requiere proyecto Supabase de desarrollo)

- Activación de Supabase Auth anónimo (configuración del proyecto).
- Aplicación de migraciones (RLS, `room_private_state`).
- Implementación completa de la Edge Function (importar el motor de juego para validación autoritativa; Deno no puede importar directamente el reducer de TS sin empaquetado).
- Canales privados separados por jugador (`room:<id>:p1`, `room:<id>:p2`) con RLS.
- Pruebas de RLS y Realtime con dos identidades reales.
- Pruebas de privacidad end-to-end (dos navegadores).

## Estado de seguridad online

**NO LISTO para producción.** La privacidad sigue dependiendo del filtrado client-side. El borrador SQL y el skeleton de Edge Function están preparados pero no aplicados ni probados.

## Pruebas que faltan

- Proyecto Supabase de desarrollo con Auth anónimo activo.
- Aplicar el borrador (revisado) y probar RLS con dos usuarios.
- Probar Realtime privado con dos clientes.
- Desplegar y probar la Edge Function.
- Pruebas de suplantación (playerId falso, acción fuera de turno, manipulación de estado).

## Recomendación

La rama `v0/card-lost-eslint-release` NO está lista para fusionarse en `fusion-de-ramas` hasta que:
1. Se complete la implementación de autenticación anónima + RLS + Edge Function.
2. Se pruebe con un proyecto Supabase de desarrollo.
3. Se verifique la privacidad con dos navegadores reales.

El código de juego (reglas, tests) está en buen estado (472 tests, typecheck, lint, build verdes). El trabajo de seguridad online está en fase de diseño/preparación.
