# Progreso

## Estado por fase

| Fase | Estado |
|------|--------|
| 0 — Setup | ✅ completa |
| 1 — Ingesta y mapeo estructural | ✅ completa |
| 2 — Motor de hallazgos | ✅ completa (los 12 chequeos) |
| 3 — Configurador de fondo + GP economics / NPV | ✅ funcional |
| 4 — Dashboard consolidado y export | ✅ funcional, con una parte manual |

Verificado: `npm test` → **94 tests en verde**. `npm run build` → build de producción OK.
`npm run lint` → limpio. Probado además en navegador de punta a punta (cargar archivo → ver
estructura → ver hallazgos → mapear fondo → generar memo).

---

## Resumen para Stephanie

### ✅ Completado

- **Parser universal**: lee cualquier `.xlsx`/`.xlsm` en el navegador, clasifica cada celda como
  fórmula / valor digitado / etiqueta / error, guarda el string de la fórmula y el valor cacheado,
  y arma el grafo de qué hoja referencia a cuál. Detecta hojas huérfanas y la columna de etiquetas
  (C primero, luego A–E, como pediste).
- **Los 12 chequeos del checklist**, cada uno en su propio archivo y con tests. H1, H2, H4, H6, H8,
  H9 y H10 corren automáticos; H3, H5, H7, H11 y H12 salen como candidatos que confirmás o
  descartás con un click.
- **Impacto cuantificado** en H1, H2, H7, H8 y H9, siempre con la base de cálculo impresa al lado.
  El H2 del fixture reproduce el caso real: total mostrado 59.034 vs. real 86.916, subestimación
  del 32.1%, con la fila C1/C2/C3 identificada por nombre.
- **Lenguaje de junta generado por default** en un solo módulo (`boardLanguage.ts`), con la
  estructura observación → ubicación → impacto → recomendación. Hay un test que verifica que nunca
  aparezca lenguaje que señale a una persona.
- **Motor financiero en TypeScript**: pref yield simple vs. EA compuesta, NPV con la convención
  validada (recibido sin descontar + futuro a valor presente), IRR y XIRR propias, cascada de
  distribución y tiers de carry por TIR, GP economics por año.
- **Configurador de fondo**: mapeás las celdas una vez, se guardan por nombre de fondo y se
  reutilizan con la próxima versión del mismo modelo. Muestra la tabla lado a lado Excel cacheado
  vs. motor.
- **Memo exportable** a Word (`.doc`) y a texto plano, más copiar al portapapeles. Los hallazgos
  descartados no entran.
- **Fixtures sintéticos** que replican los 12 patrones a propósito, más un modelo limpio de control
  que hoy produce **cero** hallazgos (medida de falsos positivos).

### 🆕 Rediseño de la presentación (agosto 2026)

Después de usar la app por primera vez me dijiste que el resumen y los hallazgos eran difíciles de
entender. Esto es lo que cambió:

- **Tildes.** Todo el texto que ves estaba escrito sin tildes por comodidad técnica mía. Un texto
  así no se puede pegar en un memo de junta. Corregido en toda la app y en el memo.
- **Escala de las cifras.** Arriba de todo hay ahora un selector: *las cifras del Excel están en
  unidades / miles / millones, de pesos o de dólares*. La app no puede adivinar si un 27.882 es
  27 mil pesos o 27 mil millones, así que lo pregunta una vez y lo recuerda. Toda cifra en pantalla
  y en el memo lleva la unidad escrita: **$27.882 millones COP**, nunca un número suelto.
- **Hallazgos como lista, no como muro de texto.** Antes cada hallazgo repetía tres veces lo mismo
  (descripción, impacto, borrador de memo). Ahora es una línea por hallazgo — qué pasa, dónde,
  cuánto vale — agrupada por prioridad, y el detalle se abre solo si lo pedís.
- **Cada hallazgo explica qué significa.** Los doce chequeos tienen ahora una pregunta en castellano
  llano ("¿El total suma todas las filas que debería sumar?") y una frase de riesgo, que aparecen al
  abrir el hallazgo y también en el memo.
- **Títulos que se distinguen entre sí.** Los cinco hallazgos H2 de una misma serie decían
  exactamente lo mismo; ahora dicen *"Total ingresos" de 2024 no suma una fila del bloque*.
- **Resumen que abre con una frase.** La vista de Resumen empieza con algo que se puede leer en voz
  alta en junta, sigue con "Lo primero que hay que mirar" (los tres de mayor efecto) y deja las
  gráficas abajo, plegadas.
- **Memo con forma de documento.** La vista previa dejó de ser un cuadro de texto monoespaciado:
  ahora tiene títulos, ficha de datos, cifras destacadas y tablas. Es el mismo documento que sale a
  Word y a texto plano, renderizado.

### ⚠️ Pendiente

- **Validar contra los archivos reales.** No estaban en la carpeta, así que el motor está probado
  contra fixtures sintéticos, no contra `C4_v3_Etapa2_v2.xlsx` ni `HV_ATK_20260716.xlsx`. En cuanto
  los pongas en `fixtures/`, los tests se cambian por comparaciones con tolerancia <1% contra los
  benchmarks (NAV $223,433M, Pref Yield $97,005M, Portafolio Vigente $306,143M, Caja $14,295M).
- **GP economics por año en el dashboard es captura manual.** Extraer AUM y carry por año
  automáticamente exige un mapeo por modelo que varía mucho entre vehículos; preferí dejarlo
  explícito y honesto antes que inventar una heurística frágil. La estructura del mapeo ya existe
  (`FundCellMap`), solo hay que extenderla con rangos por año.
- **Compras de sentencias por fondo por año** (la otra tabla que mencionás para el memo) no está:
  depende de la base de sentencias, que no tiene una estructura estable entre archivos.
- **Tipos de modelo no-fondo.** El parser y H1–H12 funcionan sobre cualquier archivo (la nota
  offshore ya está cubierta por el chequeo de composición multiplicativa de tasas). Pero la Fase 3
  asume estructura de fondo; para hedging (TRM, NDF, collar, SBLC) no hay todavía una vista propia
  que calcule retorno neto en USD por escenario de devaluación.
- **Lógica CPACA/CCA de valoración de sentencias** (fases DTF de 304 y 182 días, ponderación por
  días con MIN/MAX tipo SUMPRODUCT) no está implementada. Es la lógica más compleja del negocio y
  preferí no tocarla sin poder validarla contra una sentencia calculada a mano, tal como pediste.

### 🐛 Issues conocidos

- El bundle pesa ~967 KB (305 KB gzip), casi todo SheetJS y Recharts. Funciona bien, pero si
  molesta el arranque en frío se puede cargar Recharts con `import()` dinámico.
- H7 compara parámetros por etiqueta normalizada. Si dos hojas usan la misma etiqueta para dos
  conceptos distintos, va a reportar un falso positivo. Por eso queda como candidato de revisión y
  no como automático.
- H10 marca la variante *menos frecuente* como sospechosa. Si un typo aparece más veces que la
  grafía correcta, señalaría la correcta. Mitigado con una lista de términos canónicos del negocio
  (CPACA, SOFR, DTF, TRM, NDF, SBLC, IBR, APD) que nunca se reportan como error.
- La detección de fecha en `toIsoDate` solo interpreta un número como serial de Excel si la celda
  tiene formato de fecha. Si un modelo trae fechas como números sin formato, el rango de fechas no
  se va a leer; se reporta como mapeo pendiente en vez de fallar en silencio.

### ❓ Preguntas para Stephanie

1. **Umbral de TIR entre tiers de carry.** Sé que 34.06% activa "Higher Catch-Up" (72/28) y que
   22.63% caería en "Discounted" (75/25), pero no el punto de corte exacto. Asumí 30% y lo dejé
   editable. ¿Cuál es el umbral del Side Letter?
2. **Tier base.** ¿El 20% GP / 80% LP aplica desde TIR cero, o hay un piso de TIR por debajo del
   cual no hay carry del todo?
3. **Catch-up al GP.** El orden de la cascada lo tengo, pero no la fórmula del catch-up (¿qué
   porcentaje, sobre qué base?). Hoy está parametrizado con default 0 para no inventar un número.
4. **Umbrales de CD por fondo.** Los defaults 90/95/97.5/100 son los de C4. ¿Querés que la app
   guarde un juego de umbrales distinto por fondo (Alianza, Dianthus, SURA…)? El modelo de datos ya
   lo permite; solo falta cargarlos.
5. **Management fee.** ¿Corre sobre capital comprometido o sobre capital aportado/AUM? Hoy el
   dashboard usa la base que le des a mano; para automatizarlo necesito saber cuál es.

---

## Bitácora

- **Fase 0** — Scaffolding Vite + React 18 + TS, Tailwind v3 con tokens de tema, ESLint/Prettier,
  Vitest. Primitivas de UI en estilo shadcn sin Radix (ver DECISIONS.md).
- **Fase 1** — Modelo de datos, utilidades de referencias A1 y disección de fórmulas (rangos,
  celdas sueltas, funciones, literales, hojas mencionadas, con manejo de comillas y de literales de
  texto), parser de SheetJS, detección de columna de etiquetas y de cabecera temporal, grafo de
  referencias y hojas huérfanas. Explorador navegable con buscador.
- **Fase 2** — Los 12 detectores, el runner tolerante a fallos, el generador de lenguaje de junta y
  el panel de hallazgos con confirmar/descartar. Generador de fixtures sintéticos.
- **Fase 3** — Motor financiero (rates, npv, irr, waterfall), lector de celdas y rangos mapeados,
  evaluación del fondo con tabla comparativa Excel vs. motor, y persistencia del mapeo por fondo.
- **Fase 4** — Dashboard con gráficas de hallazgos e impacto, captura de GP economics por año, y
  generador de memo en texto y Word.
- **Rediseño de presentación** — Tildes en todo el texto, escala de cifras explícita y global,
  hallazgos plegables agrupados por prioridad, explicación en castellano llano por chequeo, y memo
  como documento estructurado (`buildMemoDocument`) del que salen texto, Word y vista previa.

### Falsos positivos encontrados y corregidos durante el desarrollo

- **H2 contaba la fila de años como fila de datos**, lo que hacía que *todo* total apareciera
  incompleto — incluyendo los del modelo limpio. Se corrigió cerrando el bloque en la cabecera
  temporal. Sin el fixture de control esto habría pasado desapercibido.
- **H12 duplicaba lo que ya reportaba H3** en filas rotuladas como obsoletas con etiquetas de costo.
  Ahora H12 se salta las filas obsoletas.
