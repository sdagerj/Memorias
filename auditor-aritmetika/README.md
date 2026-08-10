# Auditor Universal de Modelos Económicos — Aritmetika

App web para auditar cualquier modelo Excel que llegue de Aritmetika (un fondo, una nota
offshore, un buyout de tramo, un análisis de cobertura cambiaria) sin tener que rehacer a mano
el mismo análisis cada vez.

La app:

1. **Mapea la estructura** del archivo — hojas, fórmulas, valores digitados, etiquetas, hojas huérfanas.
2. **Corre un checklist de doce puntos** (H1–H12) con los patrones de error ya confirmados en modelos reales.
3. **Recalcula la economía del GP** (Preferred Yield, NPV, split de carry) con las convenciones validadas, no con las que trae el Excel.
4. **Arma un memo listo para junta**, con cada hallazgo cuantificado y redactado como "oportunidad de mejora identificada".

Todo corre en el navegador. **El archivo nunca se sube a un servidor** — son datos no públicos de
un family office y se quedan del lado del cliente.

## Cómo correrla

```bash
cd auditor-aritmetika
npm install
npm run dev          # http://localhost:5173
```

Otros comandos:

```bash
npm test             # suite de Vitest (80 tests)
npm run build        # build de producción a dist/
npm run preview      # sirve el build
npm run lint         # ESLint
npm run format       # Prettier
npm run fixtures     # regenera los .xlsx sintéticos de prueba
```

## Cómo se usa

1. **Arrastra el modelo** (`.xlsx` / `.xlsm`) a la zona de carga.
2. **Hallazgos** — la pestaña que abre por defecto. Cada tarjeta trae qué se encontró, dónde
   (`Hoja!Celda`), el impacto cuantificado cuando aplica, la evidencia cruda (la fórmula tal cual)
   y el borrador de texto para el memo. Los hallazgos que dependen de criterio de negocio salen
   como *pendiente de confirmar*: se confirman o se descartan con un click.
3. **Estructura** — árbol navegable de hojas → filas con etiqueta detectada → celdas, con buscador
   por etiqueta, referencia, fórmula o valor.
4. **Fondo / GP economics** — se mapean una sola vez las celdas clave del fondo (saldo LP, rangos
   de flujos y fechas, TIRs) y la app muestra **lado a lado lo que el Excel trae cacheado vs. lo
   que calcula el motor** con la convención correcta. El mapeo queda guardado por nombre de fondo
   para la próxima versión del mismo modelo.
5. **Resumen y memo** — gráficas de hallazgos e impacto, captura de GP economics por año, y el memo
   completo para copiar o descargar (`.doc` que Word abre, o texto plano).

## El checklist

| ID | Qué busca | Modo |
|----|-----------|------|
| H1 | Pref Yield con tasa EA compuesta donde va tasa simple; composición multiplicativa de tasas donde va aditiva | automático |
| H2 | Fila de "Total" cuyo rango omite filas del bloque que agrega | automático |
| H3 | Bloques rotulados como obsoletos ("VIEJO", "OLD") que quedaron en $0 | candidato |
| H4 | Umbrales de Calculation Date que no están en el Side Letter | automático |
| H5 | TIR que alimenta el split de carry corriendo sobre portafolio total en vez de sentencias pagadas | candidato |
| H6 | Parámetros que deberían tener curva pero están planos en toda la serie | automático |
| H7 | El mismo parámetro con valores distintos entre el dashboard y el motor de cálculo | candidato |
| H8 | Errores de fórmula, separando hojas de producción de ruido en hojas huérfanas | automático |
| H9 | Bloat de versiones abandonadas dentro del archivo | automático |
| H10 | Terminología inconsistente (SOFR/SORF, CPACA/CPCA) | automático |
| H11 | Inconsistencias lógicas entre celdas relacionadas | candidato |
| H12 | Líneas de costo sin definir o sospechosamente en cero | candidato |

*Automático* corre solo y se reporta como detectado. *Candidato* se señala pero requiere
confirmación de negocio antes de entrar al memo como definitivo.

**Regla transversal:** cuando un hallazgo tiene impacto numérico, la app siempre muestra el impacto
cuantificado y la base de cálculo. Nunca "encontré un error" a secas.

## Convenciones implementadas

- **Preferred Yield:** 15% EA por Side Letter pero liquidado como **tasa simple mensual**
  (`saldo × 15%/12 = 1.25%`), no como EA compuesta (`(1.15)^(1/12)−1 = 1.171%`).
- **NPV:** los flujos ya recibidos hasta el corte se suman **sin descontar**; solo los futuros se
  traen a valor presente. Nunca se mezclan las dos convenciones en el mismo cálculo. Tasa de
  descuento editable (default 15% EA).
- **Split de carry:** escalonado por TIR, calculada sobre **sentencias pagadas** ("paid rights"),
  nunca sobre el portafolio completo.
- **Composición de tasas** (notas offshore): aditiva (`SOFR + Spread`), nunca multiplicativa.
- **Calculation Dates:** umbrales por defecto 90% / 95% / 97.5% / 100%, editables por fondo.

Todos estos son parámetros editables en la UI, no constantes en el código.

## Datos de prueba

No hay modelos reales de Aritmetika en el repo. `fixtures/` contiene dos `.xlsx` sintéticos:

- `modelo_demo_con_hallazgos.xlsx` — replica los doce patrones a propósito.
- `modelo_demo_limpio.xlsx` — las mismas estructuras con las convenciones correctas; sirve de
  control de falsos positivos (hoy el motor no reporta nada sobre él).

Se regeneran con `npm run fixtures`.

## Arquitectura

```
src/
  core/
    types.ts              modelo de datos (ParsedCell, Finding, FundConfig, ...)
    parser/               SheetJS → modelo plano; disección de fórmulas y refs A1
    findings/             un archivo por chequeo (h1.ts … h12.ts) + runner
    finance/              pref yield, NPV, IRR/XIRR, cascada, GP economics
    fund/                 evaluación del fondo mapeado (Excel cacheado vs motor)
    export/               memo de junta en texto y en HTML/Word
  features/               UI por fase (upload, structure, findings, fund, dashboard)
  store/                  Zustand + persistencia solo de configuración
```

Ver [DECISIONS.md](./DECISIONS.md) para las decisiones técnicas y [PROGRESS.md](./PROGRESS.md) para
el estado de las fases y lo que queda pendiente.
