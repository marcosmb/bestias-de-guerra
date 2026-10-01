# PLAYTEST_V1_0.md

> **Documento de pruebas manuales para el reglamento v1.0**
>
> Este documento contiene una lista de pruebas manuales para que el usuario pueda jugar y comprobar el comportamiento del juego.

---

## Instrucciones

Para cada prueba:

1. **Preparación**: Configuración inicial necesaria
2. **Pasos**: Acciones a realizar
3. **Resultado esperado**: Lo que debería ocurrir según el reglamento
4. **Resultado observado**: Lo que realmente ocurrió (a rellenar por el usuario)
5. **Estado**: ✅ (correcto) o ❌ (incorrecto)

---

## 1. Trampa 2 — Destrucción 2+1

### Prueba 1.1: Activación al comienzo del turno

**Preparación:**
- Jugador 1 tiene 2+ monstruos en el campo
- Jugador 1 coloca la Trampa 2 bajo uno de sus monstruos

**Pasos:**
1. Colocar la Trampa 2 bajo un monstruo propio
2. Terminar el turno
3. Comenzar el siguiente turno del Jugador 1

**Resultado esperado:**
- La Trampa 2 se activa automáticamente al comienzo del turno
- Destruye 2 monstruos propios y 1 del rival
- La Trampa 2 se elimina después de activarse

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 1.2: No se activa al recibir un ataque

**Preparación:**
- Jugador 1 tiene la Trampa 2 bajo un monstruo
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo con la Trampa 2

**Resultado esperado:**
- La Trampa 2 NO se activa al recibir el ataque
- El combate se resuelve normalmente

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 1.3: No se activa con solo 1 monstruo propio

**Preparación:**
- Jugador 1 tiene solo 1 monstruo en el campo
- Jugador 1 coloca la Trampa 2 bajo ese monstruo

**Pasos:**
1. Colocar la Trampa 2 bajo el único monstruo
2. Terminar el turno
3. Comenzar el siguiente turno del Jugador 1

**Resultado esperado:**
- La Trampa 2 NO se activa (no hay 2 monstruos propios)
- La Trampa 2 permanece en el campo

**Resultado observado:**

**Estado:** ⬜

---

## 2. Trampa 7 — Cambiar atacante

### Prueba 2.1: El atacante pasa a tu campo

**Preparación:**
- Jugador 1 tiene la Trampa 7 bajo un monstruo
- Jugador 1 tiene espacio libre en el campo
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo con la Trampa 7
2. Activar la Trampa 7

**Resultado esperado:**
- El monstruo atacante pasa directamente al campo del Jugador 1
- NO se intercambia por otro monstruo
- El monstruo mantiene su posición original

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 2.2: No se activa sin espacio libre

**Preparación:**
- Jugador 1 tiene la Trampa 7 bajo un monstruo
- Jugador 1 tiene el campo lleno (6 monstruos)
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo con la Trampa 7
2. Activar la Trampa 7

**Resultado esperado:**
- La Trampa 7 NO se activa (no hay espacio libre)
- El combate se resuelve normalmente

**Resultado observado:**

**Estado:** ⬜

---

## 3. Trampa 9 — Tres turnos

### Prueba 3.1: Cuenta 3 turnos completos

**Preparación:**
- Jugador 1 tiene un monstruo en el campo
- Jugador 1 coloca la Trampa 9 bajo ese monstruo

**Pasos:**
1. Colocar la Trampa 9 bajo un monstruo propio
2. Terminar el turno (turno 1)
3. Comenzar el siguiente turno (turno 2) — la Trampa 9 cuenta 2 turnos restantes
4. Terminar el turno (turno 2)
5. Comenzar el siguiente turno (turno 3) — la Trampa 9 cuenta 1 turno restante
6. Terminar el turno (turno 3)
7. Comenzar el siguiente turno (turno 4) — la Trampa 9 se activa

**Resultado esperado:**
- La Trampa 9 cuenta 3 turnos completos
- Al comienzo del 4º turno, se activa y permite elegir un monstruo para destruir

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 3.2: Destruye el monstruo elegido

**Preparación:**
- La Trampa 9 se ha activado (turno 4)
- Hay varios monstruos en el campo

**Pasos:**
1. Elegir un monstruo del campo para destruir

**Resultado esperado:**
- El monstruo elegido es destruido
- La Trampa 9 se elimina después de resolver su efecto

**Resultado observado:**

**Estado:** ⬜

---

## 4. Trampa 10 — Control durante 2 turnos

### Prueba 4.1: El atacante pasa temporalmente a tu campo

**Preparación:**
- Jugador 1 tiene la Trampa 10 bajo un monstruo
- Jugador 1 tiene espacio libre en el campo
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo con la Trampa 10
2. Activar la Trampa 10

**Resultado esperado:**
- El monstruo atacante pasa al campo del Jugador 1
- Queda bajo el control del Jugador 1
- Puede utilizarse como un monstruo propio durante el control

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 4.2: Dura exactamente 2 turnos

**Preparación:**
- La Trampa 10 ha sido activada
- El monstruo está bajo el control del Jugador 1

**Pasos:**
1. Terminar el turno del Jugador 1 (turno 1 de control)
2. Comenzar el turno del Jugador 2
3. Terminar el turno del Jugador 2
4. Comenzar el turno del Jugador 1 (turno 2 de control)
5. Terminar el turno del Jugador 1

**Resultado esperado:**
- El monstruo permanece bajo el control del Jugador 1 durante 2 turnos completos
- Después vuelve a su propietario original (Jugador 2)

**Resultado observado:**

**Estado:** ⬜

---

## 5. Trampa 11 — Muerte después de 2 turnos

### Prueba 5.1: El monstruo muere cuando corresponde

**Preparación:**
- Jugador 1 tiene la Trampa 11 bajo un monstruo
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo con la Trampa 11
2. Activar la Trampa 11
3. Terminar el turno del Jugador 2 (turno 1)
4. Comenzar el turno del Jugador 1
5. Terminar el turno del Jugador 1
6. Comenzar el turno del Jugador 2 (turno 2)
7. Terminar el turno del Jugador 2

**Resultado esperado:**
- El monstruo queda marcado por la Trampa 11
- Se cuentan 2 turnos del jugador que controla el monstruo
- Al finalizar el segundo turno, el monstruo es destruido

**Resultado observado:**

**Estado:** ⬜

---

## 6. Mágica 3 — Cambio de mano

### Prueba 6.1: Ambos jugadores tienen 5+ cartas

**Preparación:**
- Ambos jugadores tienen al menos 5 cartas en el mazo
- Jugador 1 tiene la Mágica 3 en la mano

**Pasos:**
1. Usar la Mágica 3

**Resultado esperado:**
- Ambos jugadores descartan su mano
- Ambos jugadores roban 5 cartas

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 6.2: Un jugador tiene menos de 5 cartas

**Preparación:**
- Jugador 1 tiene al menos 5 cartas en el mazo
- Jugador 2 tiene menos de 5 cartas en el mazo
- Jugador 1 tiene la Mágica 3 en la mano

**Pasos:**
1. Usar la Mágica 3

**Resultado esperado:**
- Jugador 1 descarta su mano y roba 5 cartas
- Jugador 2 descarta su mano y NO roba ninguna carta

**Resultado observado:**

**Estado:** ⬜

---

## 7. Mágica 5 — Recuperar Monstruo

### Prueba 7.1: Recuperar a la mano

**Preparación:**
- Jugador 1 tiene un monstruo en el cementerio
- Jugador 1 tiene espacio en la mano (menos de 9 cartas)
- Jugador 1 tiene la Mágica 5 en la mano

**Pasos:**
1. Usar la Mágica 5
2. Elegir "A la mano"

**Resultado esperado:**
- El monstruo más fuerte del cementerio pasa a la mano
- La Mágica 5 se consume

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 7.2: Recuperar al campo en posición Ataque

**Preparación:**
- Jugador 1 tiene un monstruo en el cementerio
- Jugador 1 tiene espacio en el campo
- Jugador 1 tiene la Mágica 5 en la mano

**Pasos:**
1. Usar la Mágica 5
2. Elegir "Al campo (Ataque)"

**Resultado esperado:**
- El monstruo más fuerte del cementerio pasa al campo en posición Ataque
- La Mágica 5 se consume

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 7.3: Recuperar al campo en posición Defensa

**Preparación:**
- Jugador 1 tiene un monstruo en el cementerio
- Jugador 1 tiene espacio en el campo
- Jugador 1 tiene la Mágica 5 en la mano

**Pasos:**
1. Usar la Mágica 5
2. Elegir "Al campo (Defensa)"

**Resultado esperado:**
- El monstruo más fuerte del cementerio pasa al campo en posición Defensa (boca abajo)
- La Mágica 5 se consume

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 7.4: Sin espacio en el campo ni en la mano

**Preparación:**
- Jugador 1 tiene un monstruo en el cementerio
- Jugador 1 tiene el campo lleno (6 monstruos)
- Jugador 1 tiene 9 cartas en la mano
- Jugador 1 tiene la Mágica 5 en la mano

**Pasos:**
1. Intentar usar la Mágica 5

**Resultado esperado:**
- La Mágica 5 no se puede utilizar
- Se muestra un mensaje de error

**Resultado observado:**

**Estado:** ⬜

---

## 8. Mágica 9 — Protección por dado

### Prueba 8.1: Sistema de dados

**Preparación:**
- Jugador 1 tiene un monstruo con la Mágica 9 asociada
- Jugador 2 tiene un monstruo en ataque

**Pasos:**
1. Jugador 2 ataca al monstruo protegido
2. Se lanzan dos dados (uno para cada jugador)

**Resultado esperado:**
- Si gana el Jugador 2 (rival), el monstruo es eliminado
- Si gana el Jugador 1 (propietario), el monstruo sobrevive
- En caso de empate, se repite la tirada

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 8.2: La Mágica permanece si el monstruo sobrevive

**Preparación:**
- El monstruo protegido ha sobrevivido a un ataque

**Pasos:**
1. Verificar que la Mágica 9 sigue asociada al monstruo

**Resultado esperado:**
- La Mágica 9 permanece asociada al monstruo
- El monstruo sigue protegido

**Resultado observado:**

**Estado:** ⬜

---

## 9. Ataques directos y prioridades de objetivos

### Prueba 9.1: Rival con monstruos en Defensa

**Preparación:**
- Jugador 2 tiene monstruos en Defensa
- Jugador 1 tiene un monstruo en ataque

**Pasos:**
1. Intentar atacar con el monstruo de Jugador 1

**Resultado esperado:**
- Solo se pueden seleccionar los monstruos en Defensa del rival
- No se puede realizar ataque directo

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 9.2: Rival con solo monstruos en Ataque

**Preparación:**
- Jugador 2 tiene solo monstruos en Ataque
- Jugador 1 tiene un monstruo en ataque

**Pasos:**
1. Intentar atacar con el monstruo de Jugador 1

**Resultado esperado:**
- Se puede elegir entre atacar a un monstruo en Ataque o realizar ataque directo

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 9.3: Rival sin monstruos

**Preparación:**
- Jugador 2 no tiene monstruos en el campo
- Jugador 1 tiene un monstruo en ataque

**Pasos:**
1. Intentar atacar con el monstruo de Jugador 1

**Resultado esperado:**
- Se realiza un ataque directo automáticamente

**Resultado observado:**

**Estado:** ⬜

---

## 10. Comportamiento visual de Defensa

### Prueba 10.1: Monstruo en Defensa boca abajo

**Preparación:**
- Jugador 1 tiene un monstruo en posición Defensa

**Pasos:**
1. Verificar la visualización del monstruo

**Resultado esperado:**
- El monstruo se muestra boca abajo (horizontal)
- El monstruo muestra su DEF en lugar de su ATQ

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 10.2: Cambio de posición

**Preparación:**
- Jugador 1 tiene un monstruo en posición Ataque

**Pasos:**
1. Cambiar el monstruo a posición Defensa

**Resultado esperado:**
- El monstruo cambia a posición Defensa (boca abajo)
- No consume una de las 3 cartas del turno

**Resultado observado:**

**Estado:** ⬜

---

## 11. Interacción entre cartas asociadas y control temporal

### Prueba 11.1: Propiedad durante control temporal

**Preparación:**
- Jugador 1 usa la Trampa 10 para tomar control del monstruo de Jugador 2
- El monstruo de Jugador 2 tiene una Trampa asociada

**Pasos:**
1. Verificar la propiedad de la Trampa asociada

**Resultado esperado:**
- La Trampa sigue perteneciendo a Jugador 2 (propietario original)
- Si la Trampa es destruida, va al cementerio de Jugador 2

**Resultado observado:**

**Estado:** ⬜

---

### Prueba 11.2: Cartas asociadas durante control temporal

**Preparación:**
- Jugador 1 usa la Trampa 10 para tomar control del monstruo de Jugador 2
- El monstruo de Jugador 2 tiene una Mágica asociada

**Pasos:**
1. Verificar el comportamiento de la Mágica asociada

**Resultado esperado:**
- La Mágica sigue perteneciendo a Jugador 2 (propietario original)
- El efecto de la Mágica sigue aplicándose normalmente

**Resultado observado:**

**Estado:** ⬜

---

## Resumen de resultados

| Prueba | Estado | Notas |
|--------|--------|-------|
| 1.1 | ⬜ | |
| 1.2 | ⬜ | |
| 1.3 | ⬜ | |
| 2.1 | ⬜ | |
| 2.2 | ⬜ | |
| 3.1 | ⬜ | |
| 3.2 | ⬜ | |
| 4.1 | ⬜ | |
| 4.2 | ⬜ | |
| 5.1 | ⬜ | |
| 6.1 | ⬜ | |
| 6.2 | ⬜ | |
| 7.1 | ⬜ | |
| 7.2 | ⬜ | |
| 7.3 | ⬜ | |
| 7.4 | ⬜ | |
| 8.1 | ⬜ | |
| 8.2 | ⬜ | |
| 9.1 | ⬜ | |
| 9.2 | ⬜ | |
| 9.3 | ⬜ | |
| 10.1 | ⬜ | |
| 10.2 | ⬜ | |
| 11.1 | ⬜ | |
| 11.2 | ⬜ | |

---

*Documento creado el 2026-09-30 para la validación del reglamento v1.0*
