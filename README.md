# 📖 Memorias — Tu libro de recuerdos

Una aplicación para tu celular donde puedes guardar todo lo que vives —
**escribiendo o hablando**— con fotos y tu ubicación, y convertirlo en un
**libro de memorias** que puedes exportar a PDF para imprimir o guardar.

Pensada para que no se te olvide nada: cada recuerdo queda guardado con su
fecha, su lugar y, si quieres, una foto.

---

## ✨ Qué puedes hacer

- 📝 **Escribir** tus recuerdos con teclado.
- 🎙️ **Dictar por voz**: habla y la app lo convierte en texto (en español).
- 📷 **Agregar fotos** desde la cámara o la galería.
- 📍 **Guardar tu ubicación**: la app detecta dónde estás y le pone el nombre
  del lugar.
- 😀 **Marcar cómo te sentías** con un emoji.
- 📚 **Ver tus recuerdos** en una línea de tiempo y **buscar** entre ellos.
- 🗺️ **Ver los lugares** donde has guardado recuerdos.
- 📖 **Generar un libro** con todos tus recuerdos y **exportarlo a PDF**.
- 💾 **Copia de seguridad**: exporta e importa todos tus datos en un archivo.
- 📴 **Funciona sin conexión** una vez instalada.

> Tus recuerdos se guardan **solo en tu dispositivo** (no hay servidor ni
> nube). Por eso conviene hacer copias de seguridad de vez en cuando, desde
> **Ajustes → Exportar copia de seguridad**.

---

## 📱 Cómo instalarla en tu celular

La app es una **PWA** (aplicación web instalable). Para instalarla, primero
hay que **publicarla** en una dirección web con HTTPS. La forma más fácil y
gratuita es **GitHub Pages**. Solo se hace **una vez** y desde la computadora.

### Paso 1 — Publicar la app (una sola vez, desde la computadora)

1. Entra a tu repositorio en GitHub:
   `https://github.com/sdagerj/Memorias`
2. Arriba, toca **Settings** (Ajustes).
3. En el menú de la izquierda, toca **Pages**.
4. En **Source** (Origen) elige **Deploy from a branch** (Desplegar desde una
   rama).
5. En **Branch** (Rama) elige **`claude/memory-book-app-10p7j3`** y la carpeta
   **`/ (root)`**. Toca **Save** (Guardar).
6. Espera **1 o 2 minutos** y recarga la página de **Pages**. Aparecerá un
   recuadro verde con tu dirección:

   **`https://sdagerj.github.io/Memorias/`**

> No hace falta fusionar nada: la app ya está en esa rama, así que se publica
> tal cual.

### Paso 2 — Instalarla en el celular

1. Abre esa dirección (`https://sdagerj.github.io/Memorias/`) **en el navegador
   de tu celular**. Lo más fácil: envíate el enlace por WhatsApp o correo y
   ábrelo desde ahí.
2. Instálala:
   - **Android (Chrome):** menú **⋮** (arriba a la derecha) →
     *Agregar a pantalla de inicio* / *Instalar aplicación*.
   - **iPhone (Safari):** botón **compartir** (el cuadrito con la flecha hacia
     arriba) → *Añadir a pantalla de inicio*.
3. ¡Listo! Tendrás el icono de **Memorias** en tu pantalla, como una app
   normal, y funcionará incluso sin internet.

### Opción B — Probarla en tu computadora

Como usa módulos de JavaScript, ábrela con un pequeño servidor local
(no con doble clic):

```bash
# Con Python (ya viene en Mac/Linux)
python3 -m http.server 8000
# Luego abre http://localhost:8000 en el navegador
```

---

## 🎙️ Sobre el dictado por voz y la ubicación

- El **dictado por voz** usa el reconocimiento del navegador. Funciona en
  Chrome, Edge y Safari (iPhone con iOS 14.5 o más nuevo). La primera vez te
  pedirá permiso para usar el **micrófono**.
- La **ubicación** te pedirá permiso para acceder a tu GPS. El nombre del lugar
  se obtiene de OpenStreetMap; si no tienes internet en ese momento, se guardan
  las coordenadas igualmente.

---

## 📖 Cómo hacer el libro

1. Ve a la pestaña **Libro**.
2. Revisa la vista previa (la portada usa el título y tu nombre, que puedes
   cambiar en **Ajustes**).
3. Toca **Exportar / Imprimir libro (PDF)** y elige **"Guardar como PDF"**.

---

## 🛠️ Detalles técnicos

- HTML, CSS y JavaScript puro — **sin dependencias ni paso de compilación**.
- Almacenamiento local con **IndexedDB** (incluye las fotos).
- **Service worker** para uso sin conexión.
- Estructura:

```
index.html              · interfaz
css/styles.css          · estilos
js/app.js               · lógica principal
js/db.js                · almacenamiento (IndexedDB) y copias de seguridad
js/geo.js               · ubicación y nombre del lugar
js/voice.js             · dictado por voz
js/book.js              · generación del libro
sw.js                   · funcionamiento sin conexión
manifest.webmanifest    · datos para instalar la app
icons/                  · iconos de la app
```

Hecho con cariño para que no se te olvide nada. ❤️
