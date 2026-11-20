# OpenCode — validación funcional online en dos navegadores

## Estado y rama de trabajo

- Rama única de trabajo: `fusion-de-ramas`.
- No usar `v0/card-lost-eslint-release`, `master` ni crear ramas/copias.
- El PR #12 ya está fusionado. No intentar fusionarlo de nuevo.
- Validar el HEAD actual de `fusion-de-ramas` y registrar su SHA exacto.
- No hacer push a `master` ni desplegar producción.

## Supabase: puerta de seguridad

1. Comprobar si ya existe un proyecto Supabase independiente destinado a desarrollo/pruebas.
2. Si existe y está configurado, reutilizarlo. **No crear otro proyecto.**
3. Si no existe, detener las pruebas que escriban datos y comunicar el bloqueo; no crear proyectos ni incurrir en costes.
4. Nunca ejecutar pruebas de escritura, migraciones ni despliegues contra el proyecto Supabase principal.
5. El proyecto principal conserva 143 salas legacy. No borrar, truncar, recrear ni modificar en bloque esas filas.
6. No mostrar tokens, service-role keys ni secretos en logs o capturas.
7. Confirmar que `APP_ALLOWED_ORIGIN` coincide exactamente con el origen del frontend de pruebas.

## Comprobaciones automatizadas

Ejecutar sobre `fusion-de-ramas`:

```bash
npm ci
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
deno check supabase/functions/room-lifecycle/index.ts supabase/functions/validate-action/index.ts
```

Registrar salida, número de pruebas, versiones de Node/Deno y SHA probado.

## Prueba funcional en dos navegadores

Usar dos perfiles/contextos aislados (A y B), con dos identidades Supabase Auth distintas.

1. A crea una sala; comprobar código y estado de espera.
2. B se une; ambos reciben el estado correcto y su vista filtrada.
3. Un tercer usuario C no puede unirse a una sala ocupada ni leer su estado.
4. Verificar que cada jugador no recibe la mano ni el mazo del rival.
5. Verificar monstruos boca abajo, Trampas no reveladas, Mágicas asociadas y selecciones pendientes (incluido `revive-choice`): no deben filtrarse nombre, ID, instanceId, descripción ni efecto.
6. Comprobar que el propietario sí conserva sus datos completos.
7. Revisar `log` y `lastCombat` para detectar filtraciones de cartas ocultas.
8. Probar Trampa 5 y confirmar que solo el jugador autorizado puede completar la selección.
9. Probar Mágica 5 y las reglas de cartas modificadas.
10. Manipular en el cliente carta, instanceId, objetivo, jugador, turno y dado. El servidor debe resolver datos canónicos y rechazar acciones ilegales; el dado debe generarlo el servidor.
11. Enviar acciones concurrentes con el mismo `expectedVersion`: solo una puede confirmarse.
12. Recargar ambos navegadores y comprobar reconexión y sincronización.
13. Probar salida/reconexión de ambos jugadores sin eliminar filas.
14. Completar una partida y comprobar resultado final y rechazo de acciones posteriores.
15. Comprobar la revancha: debe ser una operación coordinada y autoritativa del servidor, con aceptación de ambos jugadores, nueva baraja/estado y control de versión. Si el endpoint o la migración necesarios no están desplegados en el entorno de pruebas, marcarla como pendiente; no simular que funciona.

## Realtime, RLS, migraciones y Edge Functions

Solo en el proyecto de pruebas ya existente y después de confirmar su identidad:

- Comprobar topics privados por jugador y topic de presencia.
- Verificar que un usuario no puede suscribirse al topic privado del otro.
- Verificar que clientes no pueden publicar estado de juego ni acciones directamente por Realtime.
- Comprobar políticas RLS y Auth anónimo.
- Revisar el estado de las migraciones y de las Edge Functions.
- Aplicar o desplegar cambios únicamente con autorización expresa y nunca contra producción.
- Antes y después de cualquier prueba de migración, comparar el número de filas de `game_rooms` y verificar conservación de las 143 salas legacy.

## Criterios de aceptación

- Todas las comprobaciones automáticas pasan en el SHA final.
- Dos identidades reales completan una partida en navegadores aislados.
- No hay filtración de cartas ocultas ni posibilidad de suplantar jugador, carta, objetivo, turno o dado.
- La concurrencia no sobrescribe acciones.
- RLS bloquea datos y topics ajenos.
- La revancha se valida de extremo a extremo o queda explícitamente marcada como pendiente.
- No hay errores de consola/red sin explicar.
- Las salas legacy permanecen intactas.

## Informe final

Entregar rama y SHA, entorno Supabase y project ref (sin secretos), resultados por prueba, evidencia de dos identidades, estado de migraciones/Edge Functions/RLS/Realtime/Auth, conteo de salas antes/después, defectos y commits de corrección.

No declarar privacidad online lista para producción sin completar las pruebas reales descritas.
