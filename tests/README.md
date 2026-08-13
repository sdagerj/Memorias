# Pruebas de Memorias

Pruebas de extremo a extremo que abren la app real en un navegador real y
comprueban los caminos que, si se rompen, le cuestan trabajo a quien la usa.

## Por qué existen

Todos los fallos que llegaron a producción eran de los que una prueba caza en
segundos:

| Fallo | Qué pasó |
|---|---|
| Comillas tipográficas en atributos HTML | El PDF de un recuerdo congelaba la app entera |
| `mergeBackup` ignoraba `data.books` | Un libro creado en otro dispositivo nunca llegaba |
| El recorte de la corrección devolvía vacío | Sustituía un editorial entero por nada |
| El portapapeles falla en Safari tras un `await` | Los botones de Claude dejaban la caja vacía |
| El editorial solo vivía en pantalla | Se perdía al recargar sin haber guardado |

Cada uno de ellos tiene ahora su prueba. **Ejecutar esto antes de desplegar es
la diferencia entre encontrarlos aquí o que los encuentre ella.**

## Cómo ejecutarlas

```bash
node tests/run.js
```

Salida: una línea por comprobación, y al final el recuento. Sale con código 1 si
algo falla, así que sirve tal cual en un gancho de despliegue.

### Requisitos

- **Node** 18 o superior.
- **playwright-core**: `npm install playwright-core` (no hace falta guardarlo en
  el repositorio; la app no tiene dependencias y conviene que siga así).
- **Chromium**. Por defecto busca `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Con otra ruta:

  ```bash
  CHROMIUM=/ruta/a/chrome node tests/run.js
  ```

El servidor de archivos lo levanta el propio script en el puerto 8123; no hace
falta arrancar nada aparte.

## Qué cubren

- **Arranque**: la app carga sin errores de JavaScript y las cinco pestañas abren.
- **Recuerdos**: se guardan y sobreviven a recargar.
- **Protección del editor**: avisa antes de descartar cambios; Escape cierra.
- **Búsqueda**: sin resultados explica qué pasa en vez de quedarse en blanco.
- **Memoria**: las fotos de la lista se liberan al buscar (había una fuga).
- **El Número**: el borrador se guarda solo y se recupera tras recargar.
- **Corrección**: cuatro formas de respuesta de Claude, ninguna vacía el editorial.
- **Botones de Claude**: siempre dejan texto copiable, aunque el portapapeles falle.
- **Copia y fusión**: recuerdos, libros y entregas viajan entre dispositivos, y
  fusionar dos veces no duplica.
- **Copias automáticas**: recuperan un recuerdo borrado.
- **Diagnóstico**: Ajustes avisa si el navegador tiene el almacenamiento bloqueado.
- **API key**: se limpia de guiones tipográficos y caracteres invisibles.
- **PDF**: abre y cierra sin dejar la app atascada.
- **Código**: no quedan comillas tipográficas dentro de atributos HTML.

## Al añadir una función

Añade su prueba en `run.js` con `prueba('nombre', async (navegador) => {...})` y
usa `comprobar('qué se espera', condición)`. Y cuando aparezca un fallo nuevo,
escribe primero la prueba que lo reproduce: así no puede volver.
