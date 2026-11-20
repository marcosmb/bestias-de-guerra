# OpenCode — validación final online en dos navegadores

## Objetivo

Validar la rama `v0/card-lost-eslint-release` con dos jugadores reales y dos contextos de navegador aislados antes de integrar el PR #12 en `fusion-de-ramas`.

## Reglas obligatorias

- Trabajar únicamente con el checkout existente y la rama `v0/card-lost-eslint-release`. No crear ramas ni copias del repositorio.
- Confirmar que el HEAD local coincide con el HEAD del PR #12 antes de empezar. Si hay cambios posteriores, hacer fetch y actualizar de forma segura sin descartar cambios.
- No trabajar ni hacer commits en `master` o `fusion-de-ramas`.
- No fusionar el PR #12.
- No desplegar a producción.
- No aplicar migraciones, cambiar ajustes Realtime ni desplegar Edge Functions contra producción.
- No borrar, truncar, recrear ni modificar en bloque filas legacy.
- No exponer tokens, service-role keys ni secretos en logs, capturas o el informe.

## Puerta de seguridad del entorno — antes de abrir la partida

1. Identificar el proyecto Supabase efectivo usado por el navegador y por las Edge Functions (project ref, URL y entorno).
2. Comprobar si es un proyecto de desarrollo/pruebas independiente y no productivo.
3. El proyecto Supabase conocido del proyecto principal contiene 143 salas legacy. Si el navegador o las variables de entorno apuntan a ese proyecto de producción, **detener las pruebas que escriban datos**. No crear salas de prueba, no aplicar migraciones y no desplegar funciones allí.
4. Si no hay un backend no productivo ya disponible, informar del bloqueo con el project ref y continuar únicamente con comprobaciones locales/mock que no escriban en Supabase. No crear otro proyecto ni solicitar gasto sin autorización.
5. Verificar que `APP_ALLOWED_ORIGIN` coincide exactamente con el origen HTTPS del frontend de pruebas. Auth anónimo debe estar activado en el entorno de pruebas.

## Comprobaciones automatizadas

Ejecutar en el checkout de la rama:

```bash
npm ci
npm run typecheck
npm run lint -- --max-warnings=0
npx vitest run
npm run build
deno check supabase/functions/room-lifecycle/index.ts supabase/functions/validate-action/index.ts
```

Registrar salida, número de pruebas, commit exacto y versiones de Node/Deno.

## Prueba funcional en dos navegadores

Usar dos perfiles/contextos independientes (A y B), cada uno con una identidad Supabase Auth anónima diferente. No compartir almacenamiento local, cookies ni sesión.

1. A crea una sala; verificar código de seis caracteres y que queda esperando.
2. B se une con el código; ambos reciben el mismo estado de partida, cada uno con su vista filtrada.
3. Un tercer usuario C no puede entrar en una sala ocupada ni leer su estado.
4. Verificar que A no recibe cartas de mano/mazo de B y viceversa.
5. Verificar monstruos boca abajo, Trampas no reveladas, Mágicas asociadas y selecciones pendientes (incluida `revive-choice`): el rival no debe recibir nombre, ID, instanceId, descripción ni efecto real.
6. Verificar que el dueño sí conserva los datos completos de sus propias cartas.
7. Comprobar que `log` y `lastCombat` no filtran nombres de cartas que continúan ocultas.
8. Probar Trampa 5: el jugador que debe elegir las cartas asociadas puede actuar aunque no coincida temporalmente con `currentPlayer`; el otro jugador no puede enviar esa acción.
9. Probar Mágica 5 y las reglas de cartas modificadas, confirmando que las acciones válidas siguen funcionando y las inválidas se rechazan.
10. Manipular desde el cliente un `instanceId`, una carta, un objetivo, el lado de objetivo mágico, el jugador, el turno y el resultado del dado. El servidor debe resolver cartas desde el estado canónico y rechazar acciones ilegales; el dado debe generarlo el servidor.
11. Enviar dos acciones concurrentes con el mismo `expectedVersion`: como máximo una debe confirmarse; la otra debe recibir conflicto y recuperar el estado autoritativo.
12. Recargar ambos navegadores y comprobar reconexión, sincronización de versión y presencia.
13. Probar salida de B y de A. La sala y su estado deben conservarse según las reglas de lifecycle; nunca eliminar filas legacy.
14. Completar una partida hasta game-over y comprobar estado final, ganador y rechazo de nuevas acciones.

## Realtime y RLS

Solo en el proyecto de pruebas no productivo:

- Verificar que ambos usuarios pueden suscribirse a su propio topic `room:<id>:player:<uid>`.
- Verificar que cada usuario y C reciben rechazo al intentar suscribirse al topic privado del otro jugador.
- Verificar que solo miembros pueden suscribirse al topic `room-presence:<id>`.
- Verificar que los clientes no pueden publicar estado de juego ni acciones directamente por Realtime.
- Verificar canales privados y las políticas sobre `realtime.messages`.
- Desactivar `Allow public access` únicamente después de confirmar las políticas y la compatibilidad del cliente.

## Migraciones

Solo en un proyecto de pruebas no productivo y con autorización de entorno confirmada:

1. Ejecutar primero `20261119000000_online_private_state_stage1.sql`.
2. Comprobar que el total de filas de `game_rooms` no disminuye, que las salas existentes conservan sus datos y que el backfill no duplica estados.
3. Ejecutar `20261119010000_private_realtime_authorization.sql` y probar las políticas.
4. Desplegar las Edge Functions en ese entorno con `APP_ALLOWED_ORIGIN` y secretos configurados desde el entorno seguro.
5. Ejecutar la prueba completa de dos navegadores.
6. Ejecutar `20261119020000_private_online_cutover.sql` solo tras pasar todas las pruebas anteriores. Volver a verificar que las filas legacy siguen presentes.
7. No aplicar nunca el archivo histórico de `docs/archive/DRAFT_20260119_private_online_state.md`.

## Criterios de aceptación

- Todas las comprobaciones automatizadas pasan en el HEAD final.
- Dos identidades reales completan una partida en navegadores aislados.
- No hay filtración de cartas ocultas en ningún payload, historial, combate o selección.
- No es posible suplantar jugador, carta, objetivo, turno o dado.
- La concurrencia no sobrescribe acciones.
- RLS impide acceso a estado y topics ajenos.
- Las 143 salas legacy se conservan intactas.
- No hay errores de consola, errores de red ni fallos de sincronización sin explicar.

## Informe final requerido

Entregar:
- Rama y SHA exactos probados.
- Entorno y project ref (sin secretos).
- Resultado por cada prueba anterior.
- Evidencia de dos perfiles de navegador e identidades diferentes.
- Conteo de salas antes/después y evidencia de conservación.
- Estado de migraciones, Edge Functions, RLS, Realtime y Auth.
- Capturas/logs sin credenciales.
- Defectos encontrados, commits de corrección y nueva ejecución CI.
- Dictamen claro: LISTA PARA INTEGRAR o BLOQUEADA, con motivos.

No declarar privacidad online lista para producción si no se han completado las pruebas reales descritas.
