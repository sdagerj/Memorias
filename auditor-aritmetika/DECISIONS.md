# Decisiones técnicas

Registro de las decisiones que tomé sin preguntar, con el porqué. Todas son reversibles.

---

## Ubicación en el repo

La app vive en `auditor-aritmetika/`, un subdirectorio del repo `Memorias`. La raíz del repo es
otra app (PWA vanilla de libro de recuerdos) sin `package.json` propio, así que un subdirectorio
con su propio `package.json` no interfiere con nada y mantiene los dos proyectos separables.

## Stack

Tal cual el prompt: React 18 + TypeScript + Vite, Tailwind, Zustand, SheetJS, Recharts, Vitest,
ESLint + Prettier. Sin backend.

## shadcn/ui sin Radix

`npx shadcn-ui@latest init` es interactivo (no corre desatendido) y cada componente arrastra su
paquete de Radix. La superficie de UI aquí es acotada — formularios, tablas, tabs, acordeón — así
que escribí las primitivas en `src/components/ui/primitives.tsx` **en el estilo de shadcn**
(`cva` + tokens de Tailwind + `cn`), sobre elementos nativos.

Se conserva lo que importa para converger después con el simulador de C4: los mismos tokens de
tema (`--primary`, `--muted`, …), las mismas variantes y la misma API de props. Si en algún punto
se quiere el shadcn "de verdad", se corre el CLI y se reemplazan los archivos uno a uno sin tocar
las vistas.

## Tailwind v3, no v4

v4 cambia la configuración a CSS-first y rompe la compatibilidad con las convenciones de shadcn
que usa el simulador de C4. Se quedó en v3 para que ambos proyectos compartan configuración.

## El parser no re-ejecuta fórmulas

SheetJS lee `.f` (el string) y `.v` (el último valor que Excel cacheó), pero no recalcula. Ese es
exactamente el diseño que sirve aquí:

- Los chequeos H1–H12 trabajan sobre el **string de la fórmula** — el error está en cómo está
  escrita, no en el resultado.
- Para la Fase 3 la lógica de negocio está **reimplementada en TypeScript** (`core/finance/`). La
  diferencia entre lo cacheado y lo que calcula el motor es el hallazgo cuantificado.

No construí un motor genérico de fórmulas de Excel: no hace falta y sería una fuente enorme de
bugs silenciosos.

## Detección de la columna de etiquetas

Se prueba primero la columna C (donde casi siempre están en los archivos de Nicolás). Si tiene al
menos 3 etiquetas reales, se usa. Si no, se evalúan A–E y gana la de mayor puntaje. Además, cuando
una fila no tiene texto en la columna elegida, se cae a la primera celda de texto de A–E de esa
misma fila — en la práctica esto recupera muchas filas que si no quedarían sin etiqueta.

## Cabecera temporal

Varios chequeos necesitan saber qué columnas son "periodos". Se detecta la fila con más celdas que
parezcan año (entero 1990–2100) o fecha, con mínimo 4. Esto habilita H6 (parámetro plano) y evita
un falso positivo importante en H2: **sin esta detección, la fila de años se cuenta como fila de
datos** y todo total sale reportado como incompleto. Lo encontré con el fixture limpio.

## H2 — cómo se decide qué es "el bloque"

Desde la fila de total se sube por la misma columna recogiendo filas con valor numérico. El bloque
se cierra al llegar a la cabecera temporal, a otra fila de total, o tras 2 filas seguidas sin dato.
Se excluyen de "lo omitido" las filas que son subtotales del propio bloque (fórmulas de suma) y las
que valen 0. Además se exige que la fórmula toque **al menos una** fila del bloque: si no toca
ninguna, es un total de otra cosa, no una omisión.

## Cuantificación de H1

Cuando la fórmula compuesta referencia una celda con un valor grande (≥ 1000), se toma como saldo y
el impacto se expresa en pesos: `saldo × (tasa_simple − tasa_compuesta)`. Si no hay saldo
identificable, el impacto se reporta en puntos básicos de tasa. La base de cálculo siempre se
imprime junto al número — nada de cajas negras.

## Tiers de carry por defecto

El prompt da dos puntos del caso de C4: TIR pagadas 34.06% → "Higher Catch-Up" (72/28); TIR de
portafolio 22.63% → "Discounted" (75/25). El umbral exacto entre ambos no está en el documento.

Asumí **30%** como frontera y agregué un tier "Base" 80/20 desde 0%, que es el split base que
menciona el prompt. Los tres tiers son **editables en la UI** por fondo. **Esto hay que validarlo
contra el Side Letter de cada vehículo antes de usar el número en junta** — está anotado en
PROGRESS.md como pregunta abierta.

## Persistencia

Solo se guarda en `localStorage` la **configuración**: mapeos de celdas por fondo, parámetros del
auditor y el fondo activo. El workbook parseado nunca se persiste — vive en memoria mientras dura
la sesión. Son datos no públicos de un family office.

## Un detector que falla no tumba la corrida

`runAudit` corre cada chequeo dentro de un try/catch y reporta el error en `byCheck`. Un archivo
raro que rompa un detector no puede dejar la auditoría entera sin resultados.

## Límites de tamaño

- Tope defensivo de 400.000 celdas por hoja en el parser.
- Tope de 40 hallazgos por chequeo, para que un archivo patológico no inunde la UI.
- El tiempo de parseo se muestra en la UI (`parseMs`) para ver si algún archivo real se vuelve lento.

En los fixtures el parseo es de milisegundos. Si un modelo real de Aritmetika resulta lento en el
navegador, se documenta acá antes de considerar un backend — el prompt es explícito en no agregar
uno sin preguntar.

## Export a Word

Se genera un HTML con los namespaces de Office y se descarga con extensión `.doc` y MIME
`application/msword`. Word lo abre directamente conservando títulos y párrafos, sin sumar una
dependencia de generación de `.docx`. También se puede copiar el memo como texto plano.

## Benchmarks de C4

Los archivos `C4_v3_Etapa2_v2.xlsx` y `HV_ATK_20260716.xlsx` no están en el repo, así que no se
pudo validar el motor contra los benchmarks reales (NAV $223,433M, Pref Yield $97,005M, etc.).

En su lugar, los fixtures sintéticos reproducen la **estructura** de esos hallazgos: el fixture de
H2 usa 27.882 / 31.500 / 27.534 de modo que el total incompleto da exactamente 59.034 y el completo
86.916 — las mismas cifras del caso real de 2024. Y hay un test que verifica la consistencia del
motor despejando el saldo-mes implícito en la brecha de $6,631M de C4.

En cuanto los archivos reales estén en `fixtures/`, esos tests se cambian por comparaciones
directas con tolerancia <1%.

## La escala de las cifras se pregunta, no se adivina

Un modelo puede expresar $6.631 millones como `6631000000`, como `6631000` o como `6631`, y el
archivo no dice cuál. Intentar inferirlo por el orden de magnitud de las celdas funciona hasta que
un modelo mezcla escalas entre hojas, y cuando falla lo hace en silencio y por un factor de mil.

Por eso hay un selector explícito (unidades / miles / millones, COP o USD) que se guarda con el
resto de la configuración y se aplica a toda la app y al memo. Toda cifra en pantalla lleva la
unidad escrita — `$27.882 millones COP`, nunca `27.882`.

Consecuencia de diseño: el texto de junta de cada hallazgo no se puede congelar en el momento de la
detección, porque las cifras que lleva dependen de una escala que se elige después. Cada `Finding`
guarda las piezas del párrafo (`boardInput`) y `renderBoardText` lo rearma con la escala vigente.
`boardLanguage` sigue existiendo con la escala por defecto para que nada dependa del orden de carga.

Los impactos que no son dinero (puntos básicos, porcentajes, conteos de hojas o celdas) no se
reescalan nunca. Y los conteos no se muestran como cifra destacada del hallazgo: "1" al lado de
"1 fórmula rota" no agrega nada y ocupa el lugar de una cifra que sí importa.

## El memo es un documento, no un string

`buildMemoDocument` arma secciones y bloques tipados; `buildMemoText`, `buildMemoHtml` y el
componente `MemoPreview` los recorren. Antes el HTML de Word se generaba re-parseando el texto plano
con expresiones regulares, lo que hacía que cualquier cambio de redacción rompiera el formato.

La sección de trazabilidad se renumera sola según entre o no la de GP economics: un memo con
sección 5 y sin sección 4 se lee como un error.

## Un hallazgo es un patrón, no una celda

Un modelo real copia la misma fórmula a lo ancho de toda la serie temporal. El primer archivo de
verdad que pasó por el auditor traía la composición de tasas replicada en 217 columnas mensuales y
devolvió 837 hallazgos donde había 26.

`groupFindings` agrupa por chequeo + hoja + fila + patrón del título, entendiendo por patrón el
título con los números sustituidos, de modo que "de 2024" y "de 2028" caen en el mismo grupo y se
reportan como rango. El tope por chequeo se aplica **después** de agrupar; antes de agrupar el tope
es alto a propósito, para que el conteo de ocurrencias sea real.

Al fusionar impactos, el dinero se suma y las tasas no: 217 celdas con la misma desviación de 10,9
puntos básicos son 10,9 puntos básicos, no 2.360.

## No se suma lo que no es sumable

La portada mostraba "las diferencias cuantificables suman $X". Con un archivo real eso dio una cifra
absurda, porque una hoja de resumen desactualizada y un total que omite una fila no se suman: miden
cosas distintas. Ahora se cita la **mayor diferencia individual**, con el nombre del hallazgo que la
produce. `totalQuantifiedImpact` sigue existiendo para trazabilidad, pero no va a la portada.

## Elegir no es omitir

H2 asumía que toda fila encima de un total le pertenece. Un modelo real tiene varios totales
solapados sobre el mismo bloque (`TOTAL Fund Profits = GP + Junior`, `Total GP Profits = MF + GP`) y
sumas con tope (`=-MIN(caja, SUM(saldo, catch-up))`). Dos guardas: un SUM envuelto en MIN/MAX/IF no
es un total de bloque, y un total debe cubrir al menos la mitad de su bloque para que las filas
faltantes cuenten como omisión.

## El memo abre por lo que se dice en junta

Un memo que lista veintitantas observaciones en orden de severidad obliga a leerlas todas para
encontrar las tres que importan. La sección 2 es ahora **LO QUE HAY QUE PONER SOBRE LA MESA**: hasta
tres puntos, cada uno con la cifra, qué significa sin jerga, dónde está y qué hacer. Tres es el
máximo que alguien retiene de una lectura.

Lo informativo se va a un anexo como lista de una línea. No compite con lo que mueve cifras, pero
tampoco se pierde: se puede resolver en una sola pasada.

Las secciones se numeran al final del armado, porque GP economics y el anexo entran o no según el
archivo, y un memo con sección 5 sin sección 4 se lee como un error.
