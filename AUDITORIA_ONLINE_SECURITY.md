# Auditoría de seguridad online — estado histórico y situación consolidada

> Este documento conserva hallazgos históricos de la auditoría original. No debe utilizarse como descripción del estado actual sin contrastarlo con el código de `fusion-de-ramas` y el informe de validación más reciente.

## Rama y consolidación

- Rama única de trabajo: `fusion-de-ramas`.
- El PR #12 (`v0/card-lost-eslint-release` → `fusion-de-ramas`) fue fusionado el 20 de noviembre de 2026.
- Commit de fusión: `39972d733a1fb5a0fc22cb80fa9ba6097bdc0df8`.
- Los hallazgos de las secciones siguientes describen una auditoría histórica y no prueban por sí mismos que el defecto siga presente o que esté resuelto en producción.

## Hallazgos históricos

La auditoría previa identificó problemas graves en el primer diseño online: exposición de estados privados por broadcast compartido, identidad de jugador insuficientemente protegida, ausencia de validación autoritativa, políticas RLS permisivas y falta de canales privados separados.

Se añadieron posteriormente:
- Autenticación Supabase en las Edge Functions.
- Validación de pertenencia a sala y de turno.
- Resolución de cartas desde el estado canónico del servidor.
- Generación del dado en el servidor.
- Persistencia con control optimista de versión.
- Filtrado separado de estado por jugador y topics privados.
- Migraciones aditivas para estado privado, conservando las filas existentes.

## Estado actual del código — no equivale a validación de producción

El código actual contiene las funciones:
- `supabase/functions/room-lifecycle/index.ts`
- `supabase/functions/validate-action/index.ts`
- `src/game/onlineState.ts`
- `src/hooks/useOnlineGame.ts`

La presencia de estas implementaciones y el éxito de `deno check` no demuestran que el backend esté configurado o desplegado, que las migraciones estén aplicadas, ni que RLS/Realtime funcionen con identidades reales.

La migración `20261119000000_online_private_state_stage1.sql` es aditiva y copia estados existentes sin sobrescribir filas privadas existentes. Las migraciones siguientes deben revisarse y validarse en el proyecto de pruebas antes de cualquier cutover. No ejecutar ninguna migración contra producción como parte de esta auditoría.

## Funcionalidad pendiente identificada

En `src/hooks/useOnlineGame.ts`, `sendRematch` actualmente devuelve un mensaje de que la revancha online está pendiente de implementar. No debe presentarse como funcional.

La revancha segura requiere coordinación autoritativa entre ambos jugadores, control de concurrencia/versión, autorización de ambos participantes y creación de un estado nuevo. No sustituirlo por un reinicio local del cliente.

## Restricciones operativas

- Reutilizar el proyecto Supabase independiente de pruebas si ya existe y está correctamente configurado. No crear otro.
- Si no hay un entorno de pruebas independiente disponible, detener cualquier prueba que escriba datos.
- No tocar el proyecto Supabase principal ni sus 143 salas legacy.
- No desplegar Edge Functions ni aplicar migraciones contra producción.
- No exponer secretos ni credenciales.

## Dictamen

**Motor de juego y CI:** la ejecución de GitHub Actions sobre el commit de consolidación completó TypeScript, ESLint, Deno check, 477 pruebas y build correctamente.

**Online:** no declarar listo para producción hasta verificar con dos identidades reales y dos navegadores aislados: autenticación, RLS, Realtime privado, acciones concurrentes, filtrado de datos, reconexión, ciclo de vida y conservación de salas legacy.

**Revancha:** pendiente de implementación y validación end-to-end.
