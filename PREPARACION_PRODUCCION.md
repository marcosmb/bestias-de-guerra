# PREPARACION_PRODUCCION.md

> **Documento de preparación técnica para el despliegue en producción**
>
> Fecha: 2026-10-01
> Proyecto: Bestias de Guerra
> Versión del reglamento: v1.0
> Estado: ✅ Técnicamente preparado

---

## 1. Requisitos

### 1.1 Entorno de ejecución

| Requisito | Versión mínima | Notas |
|-----------|----------------|-------|
| Node.js | 18.x o superior | Para desarrollo y build |
| npm | 9.x o superior | Gestión de dependencias |
| Navegador | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ | Web Audio API y ES2020 |

### 1.2 Dependencias de producción

| Paquete | Versión | Uso |
|---------|---------|-----|
| react | ^18.3.1 | Framework UI |
| react-dom | ^18.3.1 | Renderizado DOM |
| lucide-react | ^0.446.0 | Iconos |

### 1.3 Dependencias de desarrollo

| Paquete | Versión | Uso |
|---------|---------|-----|
| vite | ^5.4.2 | Build y dev server |
| typescript | ^5.5.3 | Tipado estático |
| tailwindcss | ^3.4.1 | Estilos |
| eslint | ^9.9.1 | Linting |
| vitest | ^1.6.1 | Tests unitarios |

---

## 2. Comandos de instalación

```powershell
# Instalar dependencias
npm install

# Verificar tipos
npm run typecheck

# Ejecutar tests
npx vitest run

# Build de producción
npm run build

# Linting
npm run lint

# Servidor de desarrollo
npm run dev

# Preview de producción
npm run preview
```

---

## 3. Comando de build

```powershell
npm run build
```

**Resultado:**
- Carpeta generada: `dist/`
- Tiempo aproximado: 6-8 segundos
- Módulos transformados: 1577

---

## 4. Ubicación del artefacto generado

```
dist/
├── index.html
├── assets/
│   ├── index-DVNE-b41.css    (38.54 kB)
│   └── index-2bSJ0ePt.js     (241.08 kB)
└── cards/
    ├── espadas-1.webp ... espadas-12.webp
    ├── bastos-1.webp ... bastos-12.webp
    ├── copas-1.webp ... copas-12.webp
    └── oros-1.webp ... oros-12.webp
```

**Total de assets:** 48 imágenes de cartas + 2 archivos de código + 1 HTML

---

## 5. Estructura necesaria para servirlo

El contenido de `dist/` debe servirse como sitio estático. No requiere servidor de aplicaciones ni backend.

### 5.1 Estructura de despliegue

```
servidor-estatico/
├── index.html
├── assets/
│   ├── index-DVNE-b41.css
│   └── index-2bSJ0ePt.js
└── cards/
    ├── espadas-1.webp
    ├── espadas-2.webp
    ├── ... (48 imágenes)
    └── oros-12.webp
```

### 5.2 Requisitos del servidor

| Requisito | Descripción |
|-----------|-------------|
| Servidor estático | Cualquier servidor que sirva archivos estáticos |
| MIME types | `.webp`, `.js`, `.css`, `.html` |
| Compresión | Gzip o Brotli recomendado |
| HTTPS | Recomendado para producción |
| SPA fallback | `index.html` para todas las rutas (si se usa routing) |

---

## 6. Variables de entorno necesarias

**Ninguna.** El proyecto no utiliza variables de entorno.

Las preferencias de audio se almacenan en `localStorage` del navegador con la clave `bestias-guerra-audio`.

---

## 7. Assets requeridos

### 7.1 Imágenes de cartas (48 archivos)

| Tipo | Cantidad | Formato | Ruta en build |
|------|----------|---------|---------------|
| Espadas | 12 | WebP | `dist/cards/espadas-{1-12}.webp` |
| Bastos | 12 | WebP | `dist/cards/bastos-{1-12}.webp` |
| Copas (Trampas) | 12 | WebP | `dist/cards/copas-{1-12}.webp` |
| Oros (Mágicas) | 12 | WebP | `dist/cards/oros-{1-12}.webp` |

### 7.2 Fuentes

| Fuente | Origen | Uso |
|--------|--------|-----|
| Outfit | Google Fonts | Texto general |
| Cinzel | Google Fonts | Títulos y elementos destacados |

**Nota:** Las fuentes se cargan desde Google Fonts CDN. En producción se recomienda:
- Usar `preconnect` para Google Fonts
- O auto-hosting las fuentes para evitar dependencia externa

### 7.3 Audio

**No se requieren archivos de audio externos.** El sistema de audio utiliza Web Audio API para sintetizar sonidos proceduralmente en tiempo de ejecución.

---

## 8. Comprobaciones realizadas

### 8.1 Build

| Comprobación | Resultado |
|--------------|-----------|
| Build completa sin errores | ✅ |
| Genera `dist/` correctamente | ✅ |
| Incluye las 48 imágenes de cartas | ✅ |
| Incluye CSS y JS | ✅ |
| Tamaño total razonable | ✅ (~280 kB gzip) |

### 8.2 Assets

| Comprobación | Resultado |
|--------------|-----------|
| 48 imágenes WebP presentes | ✅ |
| Nombres de archivo correctos | ✅ |
| Rutas relativas en el código | ✅ |
| No hay rutas absolutas locales | ✅ |

### 8.3 Código

| Comprobación | Resultado |
|--------------|-----------|
| Sin `console.log` de depuración | ✅ |
| Sin rutas absolutas (`C:\`, `/Users/`) | ✅ |
| Sin TODO/FIXME pendientes | ✅ |
| Sin dependencias innecesarias | ✅ |
| Sin secretos en el código | ✅ |

### 8.4 Tests

| Métrica | Valor |
|---------|-------|
| Tests totales | 96 |
| Tests pasados | 96 |
| Tests fallidos | 0 |
| Cobertura de reglas | 100% |

---

## 9. Posibles problemas de producción

### 9.1 Fuentes de Google

**Riesgo:** Si el servidor de Google Fonts no está disponible, las fuentes no cargarán.

**Mitigación:** El juego tiene fuentes de fallback (`sans-serif`, `serif`), por lo que sigue siendo usable.

### 9.2 Web Audio API

**Riesgo:** Algunos navegadores bloquean la reproducción de audio hasta que el usuario interactúa con la página.

**Mitigación:** El código ya maneja esto correctamente. El `AudioContext` se reanuda automáticamente en la primera interacción del usuario.

### 9.3 Vibración

**Riesgo:** No todos los dispositivos soportan `navigator.vibrate()`.

**Mitigación:** El código está envuelto en `try/catch`. Si no está disponible, simplemente no ocurre nada.

### 9.4 Imágenes WebP

**Riesgo:** Navegadores muy antiguos no soportan WebP.

**Mitigación:** Todos los navegadores modernos (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+) soportan WebP.

---

## 10. Pasos generales para el futuro despliegue

### 10.1 Preparación

1. Verificar que `npm run build` funciona correctamente
2. Confirmar que `dist/` contiene todos los archivos necesarios
3. Probar el build localmente con `npm run preview`

### 10.2 Despliegue

1. Subir el contenido de `dist/` al servidor estático
2. Configurar MIME types correctos (`.webp`, `.js`, `.css`)
3. Habilitar compresión Gzip/Brotli
4. Configurar HTTPS
5. Configurar headers de cache apropiados

### 10.3 Verificación post-despliegue

1. Acceder a la URL de producción
2. Verificar que el juego carga correctamente
3. Comprobar que las imágenes de las cartas se muestran
4. Verificar que el audio funciona (tras interacción del usuario)
5. Probar en diferentes navegadores y dispositivos

---

## 11. Requisitos específicos de servidor

| Requisito | Descripción |
|-----------|-------------|
| Tipo | Servidor estático (Nginx, Apache, Vercel, Netlify, etc.) |
| Node.js | No requerido en producción |
| Base de datos | No requerida |
| API backend | No requerida |
| Variables de entorno | Ninguna |
| Configuración especial | SPA fallback (si aplica) |

---

## 12. Estado de preparación

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

---

*Documento creado el 2026-10-01*