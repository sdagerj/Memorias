# Enfoque

Aplicación de entrenamiento cognitivo dirigido, para una sola usuaria.

No es una app de juegos mentales. Los ejercicios salen de una evaluación
neuropsicológica concreta y trabajan tres déficits específicos: memoria de
trabajo auditivo-verbal, fluidez verbal con recuperación lexical lenta, y
control atencional con perseveraciones. Lo que ya está preservado —memoria
episódica, atención sostenida, funciones ejecutivas superiores— no se entrena,
porque sería tiempo perdido.

> **Advertencia.** Esta herramienta es un apoyo de práctica personal. No es un
> instrumento diagnóstico. Sus puntajes no equivalen a los de las pruebas
> normalizadas aplicadas por un profesional, y no reemplaza la rehabilitación
> neuropsicológica supervisada ni el seguimiento médico.

---

## Los tres principios que gobiernan el código

**1. Los estímulos se escuchan, nunca se leen.** El déficit es
auditivo-verbal. Una serie de dígitos mostrada en pantalla entrenaría memoria
visual, que está preservada. Por eso el ejercicio muestra puntos de avance y
jamás los elementos dictados. Hay una prueba automatizada que lo verifica en
cada ejecución.

**2. La aplicación no puede hacer sentir mal.** No existe el rojo, ni la equis,
ni el sonido de error, ni el lenguaje de fracaso. No hay rachas, ni vidas, ni
comparación con promedios. Los errores se registran en silencio y aparecen solo
como datos en el panel de progreso. Si se deja de entrenar una semana, la
aplicación no lo menciona.

**3. Los ejercicios son cortos y la sesión termina sola.** Cada ejercicio tiene
su propio tope y ninguno pasa de cuatro minutos. La sesión avisa a los quince
minutos y corta en firme a los dieciocho, aunque quede un ejercicio sin
empezar. Si el rendimiento se desploma dentro de la sesión, propone parar.

---

## Qué hace

### Ejercicios

| Ejercicio | Qué mide | Duración |
|---|---|---|
| **Al revés** | Amplitud de dígitos inversos, escalera adaptativa | hasta 4 min |
| **De menor a mayor** | Manipulación mental de la secuencia | hasta 3 min |
| **Números y letras** | Doble criterio de ordenamiento simultáneo | hasta 4 min |
| **En orden alfabético** | Ordenamiento mental estilo BANFE-2 | hasta 4 min |
| **Fluidez semántica** | Acceso léxico por categoría | 2 min |
| **Fluidez fonológica** | Acceso léxico por letra inicial | 2 min |

Las tres primeras y el ordenamiento alfabético se presentan **por audio**,
con velocidad de dictado ajustable. Las respuestas van por voz o por teclado.

### Lo que calcula la fluidez verbal

- Palabras válidas
- **Perseveraciones** (repeticiones) — el marcador clínico principal, con
  gráfica propia
- Intrusiones
- Agrupamiento semántico: racimos, tamaño medio y saltos entre racimos
- Distribución temporal en bloques de quince segundos

Las palabras que el corpus no reconoce **no se descartan solas**: al terminar
los sesenta segundos aparece una pantalla donde se aprueban o rechazan con una
pulsación cada una. Ninguna lista del español está completa, y un descarte
automático produciría un puntaje más bajo que el real.

### Panel de progreso

Gráficas de línea con el eje en fechas reales, no en número de sesión, y con
**líneas de referencia de la evaluación de septiembre de 2025**: fluidez
semántica 18, fluidez fonológica 14, dígitos inversos 3,5. La comparación es
contra el propio punto de partida; no hay percentiles ni baremos, porque esta
herramienta no los tiene y presentarlos sería inventarlos.

Registro diario opcional de energía, calidad de sueño y niebla mental en escala
de 1 a 5, para cruzar el rendimiento con cómo se sentía ese día.

### Exportación

- **PDF** para consulta: tabla resumen por dominio, gráficas y rango de fechas.
- **CSV**: resultados, registro diario, y el detalle de fluidez **palabra por
  palabra** con su clasificación y el segundo en que se dijo. Ese último
  archivo permite auditar el conteo de perseveraciones en vez de tener que
  creerle a la aplicación.
- **JSON** de respaldo completo, para exportar e importar.

---

## Privacidad

Todo se guarda en el dispositivo con IndexedDB. No hay servidor, no hay nube,
no hay analítica, no hay fuentes ni recursos remotos.

**Con una excepción, que conviene tener clara:** si se activa responder por voz,
el reconocimiento de habla del navegador envía el audio a servidores de Apple o
de Google para transcribirlo. El texto resultante sí se guarda solo en el
dispositivo, pero el audio viaja. Se puede desactivar desde **Ajustes**, y
entonces las respuestas van por teclado y nada sale del dispositivo. El dictado
de los estímulos usa la síntesis local y nunca sale a internet.

IndexedDB no es almacenamiento permanente: el navegador puede vaciarlo si
necesita espacio, y se pierde al cambiar de teléfono. **Conviene exportar el
respaldo JSON de vez en cuando.**

---

## Instalación para desarrollo

Requiere Node 20 o superior.

```bash
cd enfoque
npm install
npm run dev          # servidor de desarrollo en http://localhost:5173
```

Otros comandos:

```bash
npm test             # pruebas del núcleo de puntuación (184 pruebas)
npm run test:watch   # las mismas, en modo continuo
npm run build        # compila a dist/
npm run preview      # sirve dist/ en http://localhost:4173
npm run recorrido    # recorrido completo en un navegador (ver más abajo)
```

---

## Cómo probar cada ejercicio

### Pruebas automáticas del núcleo

```bash
npm test
```

Cubren lo que produce los números que van al médico: el detector de
perseveraciones (incluida la normalización de plurales, con sus excepciones:
`jueves` no se convierte en `juev`), la escalera adaptativa, la calificación de
las tres variantes de amplitud, el orden alfabético del español con `ñ` y
tildes, los racimos semánticos, los bloques de quince segundos y las reglas de
fatiga.

### Recorrido completo en un navegador

En dos terminales:

```bash
npm run build && npm run preview
npm run recorrido
```

Abre un Chromium del tamaño de un iPhone 14 y recorre la aplicación entera:
guarda el registro diario, completa el ejercicio de dígitos inversos, hace una
prueba de fluidez con una repetición deliberada, clasifica las pendientes,
comprueba lo que quedó en IndexedDB y descarga el informe en PDF y el CSV.
Verifica en particular que **el estímulo dictado no aparezca escrito en ninguna
parte de la tarjeta del ejercicio**, que es el principio del que depende todo
lo demás. Deja las capturas y el PDF en `capturas/`.

### A mano, en el teléfono

1. **Dígitos inversos.** Pulsar «Escuchar la serie». Deben oírse los números
   uno a uno sin que aparezcan en pantalla. Responder al revés. Dos aciertos
   seguidos alargan la serie; un fallo la acorta.
2. **Velocidad del dictado.** En **Ajustes**, mover el control y pulsar
   «Escuchar una prueba». El cambio se aplica al ejercicio siguiente.
3. **Fluidez y perseveraciones.** En la prueba de fluidez, decir a propósito
   una palabra dos veces (por ejemplo `perro` y después `perros`). No debe
   preguntar por ella en la revisión, y debe aparecer como una perseveración en
   el panel de progreso.
4. **Corte por tiempo.** Dejar correr una sesión sin responder. A los quince
   minutos aparece el aviso; a los dieciocho se cierra sola y guarda.
5. **Respaldo.** Exportar el JSON desde **Ajustes**, borrar los datos del sitio
   en el navegador, y volver a importarlo.

---

## Despliegue

La aplicación es estática: sirve desde cualquier alojamiento con HTTPS. Hace
falta HTTPS porque el micrófono y el service worker no funcionan sin él.

### GitHub Pages

Si el repositorio sirve la aplicación desde su raíz, no hay que configurar
nada. Si se sirve desde un subdirectorio, hay que indicar la ruta base al
compilar:

```bash
BASE_PATH=/nombre-del-repositorio/ npm run build
```

Después, en **Settings → Pages** del repositorio, elegir *Deploy from a branch*,
la rama correspondiente y la carpeta que contenga el resultado de la
compilación.

### Instalar en el iPhone o el iPad

1. Abrir la dirección en **Safari** (no en Chrome: en iOS solo Safari puede
   instalar aplicaciones web).
2. Botón **compartir** → **Añadir a pantalla de inicio**.
3. Queda como una aplicación normal y funciona sin conexión.

La primera vez pedirá permiso para el micrófono si está activado responder por
voz.

---

## Mover esto a su propio repositorio

Esta carpeta nació dentro del repositorio `Memorias` por una limitación de
permisos en la sesión donde se construyó. Es autónoma y se puede mudar
conservando el historial:

```bash
# En una copia del repositorio, no en la que se usa a diario
git subtree split --prefix=enfoque -b solo-enfoque

# En el repositorio nuevo, ya creado y vacío
git init
git pull /ruta/al/repositorio/Memorias solo-enfoque
git remote add origin git@github.com:usuario/enfoque.git
git push -u origin main
```

---

## Estructura

```
src/
├─ nucleo/       lógica pura de puntuación. Sin React, sin base de datos,
│                sin leer el reloj. Todo esto lleva pruebas.
├─ contenido/    corpus en español de Colombia y reglas de las consignas
├─ datos/        Dexie, valores basales y respaldo
├─ audio/        síntesis de voz y reconocimiento de habla
├─ ejercicios/   los tres ejercicios de la fase 1
├─ sesion/       plan de la sesión y motor que la conduce
├─ progreso/     series, gráficas y exportación a PDF y CSV
├─ rutas/        inicio, progreso y ajustes
└─ ui/           componentes compartidos
```

La separación importante es `nucleo/`: ninguna función de esa carpeta lee el
reloj, la base de datos ni el DOM, y el tiempo entra siempre como parámetro.
De ahí salen los números que van al informe médico, y por eso están aislados y
se pueden probar de forma determinista.

---

## Pendiente: fase 2

- N-back auditivo verbal con letras habladas, niveles 1 a 3
- Stroop digital, para mantener lo que ya está fuerte
- Retomar tareas tras interrupción, midiendo el costo de la interrupción
- Memoria prospectiva con instrucción diferida
