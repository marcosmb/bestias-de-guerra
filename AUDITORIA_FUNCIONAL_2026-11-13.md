# Auditoría funcional y técnica — 2026-11-13

## Estado y alcance

- Rama revisada: `fusion-de-ramas`
- Commit de referencia: `78faba8a67dd5295c74cd77ee423894e922b4cf7`
- Fuente funcional: `REGLAS_JUEGO_DEFINITIVAS_v1.0_OFICIAL_CORREGIDA.md`
- Alcance realizado: revisión estática de reglas, flujo del reducer, efectos de cartas, propiedad/control, selección de acciones, pruebas de regresión y simulaciones.
- **No equivale a una prueba manual completa del navegador.** Esa fase queda pendiente para OpenCode.

## Correcciones integradas

| Área | Corrección |
|---|---|
| Trampa 4 | Reflejo de daño cuando muere el Monstruo asociado, tanto si era atacante como defensor. |
| Trampa 5 | La elección corresponde al propietario de la Trampa; el turno pasa temporalmente a ese jugador y vuelve al atacante después. Puede elegir Trampa o Mágica cuando ambas están asociadas al objetivo. |
| Trampa 7 | Solo se traslada el Monstruo atacante al campo del defensor. No se intercambia por el Monstruo defensor. Sin espacio libre, la Trampa no se activa. |
| Trampa 9 | Permite elegir cualquier Monstruo de cualquiera de los dos campos. El efecto y su contador siguen al propietario original de la Trampa aunque el portador cambie de controlador. |
| Trampa 10 | Cuenta dos turnos completos al final de los turnos del controlador temporal y devuelve el Monstruo a su propietario original. |
| Trampa 11 | Destruye al Monstruo al finalizar el segundo turno del jugador que lo controla. |
| Trampa 12 | Aplica -5 LP al comienzo del turno del propietario original, no en ambos turnos. |
| Trampas 1 y 2 | Sus efectos de inicio de turno se resuelven según el propietario original de la Trampa aunque el portador haya cambiado de campo. |
| Mágica 5 | Se respeta el límite específico de 9 cartas para recuperar a la mano. |
| Puntos de vida | Se elimina el límite artificial de 999 LP; el reglamento no establece un máximo. |

## Integraciones

- [PR #5 — Trampa 7 y fallos iniciales de CI](https://github.com/marcosmb/bestias-de-guerra/pull/5)
- [PR #6 — Trampas 4, 7, 10, 11, 12 y Mágica 5](https://github.com/marcosmb/bestias-de-guerra/pull/6)
- [PR #7 — Trampa 9: cualquier Monstruo del campo](https://github.com/marcosmb/bestias-de-guerra/pull/7)
- [PR #8 — Trampa 5: elección del propietario](https://github.com/marcosmb/bestias-de-guerra/pull/8)
- [PR #9 — Trampa 10: retorno y límite de LP](https://github.com/marcosmb/bestias-de-guerra/pull/9)
- [PR #10 — Trampas 2 y 9: propiedad original](https://github.com/marcosmb/bestias-de-guerra/pull/10)

## Validación automática

Ejecución de GitHub Actions sobre el commit integrado en `fusion-de-ramas`:

[Run #43486230437](https://github.com/marcosmb/bestias-de-guerra/actions/runs/43486230437)

- Typecheck: correcto.
- Tests: **427 de 427 superados** en 20 archivos.
- Build de producción: correcto.
- Las pruebas de simulación ejecutan torneos de referencia de 60 partidas con el arnés y 45 partidas con la CPU.
- Rechazos de acciones de la CPU en la referencia: 0.

La red de simulación todavía registra el hallazgo conocido `CARD_LOST`. Por tanto, que los tests pasen significa que el hallazgo está documentado y estable, no que la conservación de todas las cartas esté resuelta.

## Pendientes y decisiones necesarias

### 1. Seguridad del modo online — prioridad alta

[Issue #11](https://github.com/marcosmb/bestias-de-guerra/issues/11).

El estado completo de ambos jugadores se guarda y se transmite desde el cliente; además, las políticas RLS de la tabla de salas son permisivas. Marcar cartas como ocultas en la interfaz no protege sus datos. Hace falta una arquitectura con autoridad de servidor, credenciales por jugador, RLS restrictivo y vistas privadas separadas. No se ha intentado una mitigación parcial que dé una falsa sensación de seguridad.

### 2. Conservación de cartas (`CARD_LOST`)

La simulación detecta cartas que dejan de aparecer en mazo, mano, campo o cementerio. Antes de cambiar el motor hay que fijar el destino de las Mágicas instantáneas después de usarse: cementerio, zona de retiradas o eliminación definitiva. El reglamento actual no deja suficientemente clara esa política.

### 3. Mazo vacío

El reglamento no define una derrota por quedarse sin cartas y el motor no aplica una derrota automática por agotamiento del mazo. Hace falta una decisión de diseño antes de implementar una condición de derrota.

### 4. Trampa 10 cuando el campo original está lleno

Si el periodo termina y el propietario original no tiene hueco, el motor mantiene pendiente el retorno y lo reintenta en un turno posterior del controlador. El reglamento no define este caso límite.

### 5. Trampa 4 y propiedad frente a control

La redacción habla del daño que recibiría el «propietario» del Monstruo. Conviene confirmar si se refiere al propietario original de la carta o al controlador actual cuando el Monstruo ha sido tomado temporalmente. No se ha cambiado esta interpretación sin confirmación.

### 6. Pruebas manuales del navegador

Quedan por ejecutar las pruebas de `PLAYTEST_V1_0.md`, además de probar las correcciones nuevas de Trampa 5, Trampa 9, Trampa 10 y los efectos pasivos cuando cambia el control. Esta fase corresponde a OpenCode actuando únicamente mediante la interfaz como jugador, sin modificar código.

## Conclusión

Las correcciones funcionales identificadas durante esta revisión están integradas en `fusion-de-ramas` y la CI del commit actual pasa. No se declara el juego libre de errores: siguen pendientes la validación real en navegador, la seguridad del modo online y las decisiones de reglas enumeradas arriba.
