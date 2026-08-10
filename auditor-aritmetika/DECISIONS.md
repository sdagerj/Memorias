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
