# Privacidad del multijugador online

## Estado de implementación

Esta rama sustituye el modelo anterior (estado completo en `game_rooms.game_state` y Broadcast compartido) por un servidor autoritativo y estado privado por jugador.

- `room-lifecycle`: crear, unirse, recuperar y abandonar salas.
- `validate-action`: valida y ejecuta acciones sobre el estado completo del servidor.
- `room_private_state`: almacena el estado completo de la partida.
- `game_rooms`: conserva solo metadatos de sala para el cliente; las salas nuevas escriben `game_state = {}`.
- Realtime: un canal privado por jugador (`room:<codigo>:player:<uid>`) y un canal privado de presencia (`room-presence:<codigo>`).
- El cliente no lee ni escribe directamente `game_rooms` o `room_private_state`.

**No desplegar ni ejecutar las migraciones en producción hasta que pasen las pruebas de dos usuarios descritas abajo.** Las migraciones están ordenadas y versionadas, pero todavía deben aplicarse en un entorno de pruebas primero.

## Orden de migraciones

1. `20261119000000_online_private_state_stage1.sql`
   - Añade `player1_uid` y `player2_uid`.
   - Crea `room_private_state`.
   - Copia los estados existentes sin borrar ni sobrescribir filas privadas.
   - Conserva `game_rooms.game_state` para compatibilidad y rollback de datos.
2. `20261119010000_private_realtime_authorization.sql`
   - Autoriza recibir broadcasts únicamente a miembros de la sala.
   - Un jugador solo puede leer su propio topic privado.
   - Autoriza presencia compartida, sin permitir broadcasts de acciones desde clientes.
3. `20261119020000_private_online_cutover.sql`
   - Instala la función de comprobación de membresía.
   - Reemplaza las policies Realtime para usar esa función.
   - Retira el acceso directo de `anon` y `authenticated` a `game_rooms` y `room_private_state`.
   - No borra salas ni estados.

El paso de corte es intencionadamente posterior a las pruebas: después de aplicarlo, el cliente antiguo ya no podrá acceder directamente a `game_rooms`.

## Configuración manual de Realtime

Después de desplegar el cliente y las Edge Functions nuevas y antes de activar el corte:

1. Abrir Supabase Dashboard → Realtime → Settings.
2. Desactivar **Allow public access**.
3. Forzar que los clientes vuelvan a conectar (recargar las dos sesiones de prueba), porque la autorización se evalúa al conectarse y se mantiene en caché durante esa conexión.

No crear policies generales como `USING (true)` ni `WITH CHECK (true)` en `realtime.messages`.

## Despliegue de funciones

Desplegar ambas funciones con verificación JWT activada:

- `room-lifecycle`
- `validate-action`

Ambas verifican el usuario autenticado. La service-role key solo se usa dentro de las Edge Functions y nunca en el navegador.

No desplegar una sola función de forma aislada: el cliente nuevo depende del ciclo de vida y del endpoint de acciones.

## Pruebas de aceptación para dos usuarios

Usar dos perfiles de navegador independientes (A y B), con identidades anónimas distintas.

### Ciclo de sala

- A crea una sala y recibe un código de seis caracteres.
- Antes de que B se una, A ve la sala en espera y no puede ejecutar acciones.
- B se une con el código; ambos ven el mismo turno, nombres y tablero.
- Un tercer usuario C no puede unirse a la sala completa ni consultar su estado.
- Si B abandona, A ve que el rival se desconectó; B puede reconectarse con la misma identidad. Un usuario diferente no puede ocupar su asiento ni heredar su estado.
- Si A abandona, la sala queda cerrada, pero su fila y estado no se borran.

### Privacidad

- En la tabla `game_rooms`, las salas nuevas no contienen el estado completo ni cartas: `game_state` es un objeto vacío.
- El estado completo solo existe en `room_private_state`, sin permisos directos para `anon` o `authenticated`.
- A recibe su mano y mazo reales; B recibe su propia mano y mazo reales.
- A nunca recibe nombres, IDs de instancia ni datos de las cartas de la mano o mazo de B, y viceversa.
- Los monstruos boca abajo, trampas no reveladas y selecciones de cartas pendientes permanecen ocultos.
- Durante una respuesta de Trampa, el atacante no recibe la carta del defensor si sigue boca abajo.
- A no puede suscribirse al topic privado de B; C no puede suscribirse a ninguno de los topics de la sala.
- Los dos usuarios pueden recibir únicamente metadatos de presencia del canal compartido.

### Autoridad del servidor

- Una acción fuera de turno se rechaza.
- Una acción no legal se rechaza.
- Modificar en el navegador el nombre, efecto, ATQ/DEF o tipo de una carta no cambia la carta canónica usada por el motor.
- Un `instanceId` inexistente o perteneciente a una carta que no puede jugarse se rechaza.
- Una tirada enviada por el navegador no determina el resultado: el servidor genera el dado.
- Dos acciones simultáneas con la misma versión no pueden sobrescribirse; una de ellas recibe conflicto y el cliente recupera el estado actualizado.
- Tras terminar la partida, el servidor marca la sala como finalizada y no acepta nuevas acciones.

### Compatibilidad legacy

Antes de aplicar migraciones, se verificó en la base de datos conectada:

- 143 filas en `game_rooms`: 94 en `playing` y 49 en `waiting`.
- Las 143 filas tienen un UUID válido en `player1.id`; 94 tienen UUID válido en `player2.id`.
- Los objetos de carta encontrados en mano, mazo, cementerio y campo tienen `instanceId` y `owner`.

Después de ejecutar la primera migración, comprobar que:

- Siguen existiendo exactamente las mismas 143 filas legacy.
- Hay una fila privada por cada sala legacy que tenía `game_state` no nulo.
- No se ha sobrescrito ningún estado privado preexistente.
- Los usuarios originales pueden recuperar su sala por código con la misma identidad anónima.
- Las salas legacy sin estado privado no se deben reclamar: la función las rechaza de forma segura.

## Comprobaciones automatizadas

La workflow `.github/workflows/game-engine-checks.yml` ejecuta:

- `npm run typecheck`
- `deno check supabase/functions/room-lifecycle/index.ts supabase/functions/validate-action/index.ts`
- `npm test`
- `npm run build`

## Límites y precauciones

- No ejecutar el corte de RLS hasta completar las pruebas en staging.
- No borrar `game_rooms.game_state`, columnas UID, filas legacy ni `room_private_state`.
- No volver a habilitar acceso público a `game_rooms`: ese campo legacy contiene estados completos y su lectura pública vuelve a exponer información privada.
- La revancha online no se ha implementado en este cambio; el hook informa de ello en vez de fingir que se ha reiniciado una partida.
- La rama no debe considerarse lista para producción hasta verificar los dos navegadores, las políticas aplicadas y la configuración privada de Realtime.
