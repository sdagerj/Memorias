// Módulo "El Número": editor, archivo y asistente editorial con Claude.
import * as db from './db.js';
import { fetchHeadlines, DEFAULT_SOURCES } from './rss.js';
import { callClaude, getApiKey, hasApiKey, describeApiKeyProblem } from './claude-api.js';
import {
  publicarEnLaWeb, construirMarkdown, problemasParaPublicar,
  nombreArchivo, getGithubToken, SITIO_WEB,
} from './publicar.js';
import { descargarDocx, FIRMA } from './word.js';
import { dibujarHistoria, compartirHistoria, PLANTILLAS } from './historia.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentNumero = null;

// ── helpers ──────────────────────────────────────────────────────────────────

function cryptoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'nid-' + Math.abs(Date.now() ^ (performance.now() * 1000 | 0)).toString(36);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2600);
}

function showErrorPanel(msg) {
  let panel = document.getElementById('claudeErrorPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'claudeErrorPanel';
    panel.style.cssText = 'position:fixed;bottom:1rem;left:1rem;right:1rem;background:#7f1d1d;color:#fef2f2;padding:1rem;border-radius:.75rem;z-index:9999;white-space:pre-wrap;font-size:.875rem;line-height:1.4';
    document.body.appendChild(panel);
  }
  panel.innerHTML = `<strong>⚠️ Claude</strong><br>${msg.replace(/</g,'&lt;')}<br><br><button onclick="document.getElementById('claudeErrorPanel').remove()" style="background:#991b1b;border:none;color:white;padding:.25rem .75rem;border-radius:.5rem;cursor:pointer">Cerrar</button>`;
  panel.style.display = 'block';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── portada (previsualización) ────────────────────────────────────────────────

function renderCover(n) {
  const wrap = $('#numCarousel');
  wrap.innerHTML = `
    <div class="num-slide active">
      <div class="num-slide-inner cover">
        <span class="num-hashtag">#</span>
        <div class="num-big">${escHtml(n.numero || '')}</div>
        <div class="num-gancho">${escHtml(n.gancho || '')}</div>
        <div class="num-brand-tag">El Número</div>
      </div>
    </div>`;
  $('#numDots').innerHTML = '';
  $('#numSlideLabel').textContent = 'Portada';
}

// ── archivo de números ────────────────────────────────────────────────────────

async function renderNumerosList() {
  const items = await db.getAllNumbers();
  const grid = $('#numerosGrid');
  const empty = $('#numerosEmpty');
  grid.innerHTML = '';

  if (!items.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach((n) => {
    const card = document.createElement('div');
    card.className = 'num-card';
    card.innerHTML = `
      <div class="num-card-num">#${escHtml(n.numero || '?')}</div>
      <div class="num-card-gancho">${escHtml(n.gancho || '')}</div>
      <div class="num-card-date">${formatDate(n.createdAt)}</div>`;
    card.addEventListener('click', () => openNumero(n.id));
    grid.appendChild(card);
  });
}

// ── editor ────────────────────────────────────────────────────────────────────

function showNumeroScreen() {
  $('#numerosScreen').hidden = false;
  $('#numeroEditor').hidden = true;
}

function showEditorScreen() {
  $('#numerosScreen').hidden = true;
  $('#numeroEditor').hidden = false;
}

async function openNumero(id) {
  currentNumero = id ? await db.getNumber(id) : null;
  if (!currentNumero) {
    currentNumero = {
      id: cryptoId(),
      numero: '',
      gancho: '',
      editorial: '',
      destaque: '',
      resumen: '',
      cantera: '',
      fecha: hoyISO(),
      fuentes: [],
      medioNombre: '',
      medioUrl: '',
      borrador: false,
      createdAt: new Date().toISOString(),
    };
  }
  populateEditor(currentNumero);
  showEditorScreen();
  renderCover(currentNumero);
  clearClaudePanels();
}

function populateEditor(n) {
  $('#numNumero').value = n.numero || '';
  $('#numGancho').value = n.gancho || '';
  $('#numEditorial').value = n.editorial || '';
  $('#numDestaque').value = n.destaque || '';
  $('#numResumen').value = n.resumen || '';
  $('#numCantera').value = n.cantera || '';
  $('#numFecha').value = n.fecha || hoyISO();
  $('#numMedioNombre').value = n.medioNombre || '';
  $('#numMedioUrl').value = n.medioUrl || '';
  $('#numBorrador').checked = Boolean(n.borrador);
  renderFuentes(n.fuentes || []);
  actualizarCuentaResumen();
  mostrarEstadoPublicacion(n);
}

function readEditor() {
  return {
    ...currentNumero,
    numero: $('#numNumero').value.trim(),
    gancho: $('#numGancho').value.trim(),
    editorial: $('#numEditorial').value.trim(),
    destaque: $('#numDestaque')?.value.trim() || '',
    resumen: $('#numResumen')?.value.trim() || '',
    cantera: $('#numCantera')?.value || '',
    fecha: $('#numFecha')?.value || hoyISO(),
    fuentes: leerFuentes(),
    medioNombre: $('#numMedioNombre')?.value.trim() || '',
    medioUrl: $('#numMedioUrl')?.value.trim() || '',
    borrador: Boolean($('#numBorrador')?.checked),
  };
}

function hoyISO() {
  // La fecha local, no la UTC: a partir de las 7 de la tarde en Colombia
  // toISOString() ya devuelve el dia siguiente.
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// ── Las fuentes del editorial ────────────────────────────────────────────────

function filaFuente(f = {}, i = 0) {
  const div = document.createElement('div');
  div.className = 'fuente-item';
  div.innerHTML = `
    <div class="fuente-cabeza">
      <span>Fuente ${i + 1}</span>
      <button type="button" class="link-btn danger quitar-fuente">Quitar</button>
    </div>
    <label class="field">
      <span>Institución</span>
      <input type="text" class="f-nombre" placeholder="Ej: Banco de la República" />
    </label>
    <label class="field">
      <span>Documento</span>
      <input type="text" class="f-documento" placeholder="Ej: Informe de política monetaria" />
    </label>
    <div class="fuente-fila">
      <label class="field">
        <span>Año</span>
        <input type="number" class="f-anio" placeholder="2026" inputmode="numeric" min="1000" max="2999" />
      </label>
      <label class="field">
        <span>Enlace</span>
        <input type="url" class="f-url" placeholder="https://…" inputmode="url" autocapitalize="off" spellcheck="false" />
      </label>
    </div>`;
  div.querySelector('.f-nombre').value = f.nombre || '';
  div.querySelector('.f-documento').value = f.documento || '';
  div.querySelector('.f-anio').value = f.anio || '';
  div.querySelector('.f-url').value = f.url || '';
  div.querySelector('.quitar-fuente').addEventListener('click', () => {
    div.remove();
    renumerarFuentes();
    scheduleDraftSave();
  });
  div.addEventListener('input', scheduleDraftSave);
  return div;
}

function renumerarFuentes() {
  $$('#numFuentesLista .fuente-item').forEach((el, i) => {
    el.querySelector('.fuente-cabeza span').textContent = `Fuente ${i + 1}`;
  });
}

function renderFuentes(fuentes) {
  const cont = $('#numFuentesLista');
  if (!cont) return;
  cont.innerHTML = '';
  fuentes.forEach((f, i) => cont.appendChild(filaFuente(f, i)));
}

function leerFuentes() {
  return $$('#numFuentesLista .fuente-item')
    .map((el) => ({
      nombre: el.querySelector('.f-nombre').value.trim(),
      documento: el.querySelector('.f-documento').value.trim(),
      anio: el.querySelector('.f-anio').value.trim(),
      url: el.querySelector('.f-url').value.trim(),
    }))
    // Una fuente enteramente vacia es una fila que se abrio y no se lleno:
    // no tiene por que impedir publicar ni acabar en el archivo.
    .filter((f) => f.nombre || f.documento || f.anio || f.url);
}

function actualizarCuentaResumen() {
  const caja = $('#numResumen');
  const cuenta = $('#numResumenCuenta');
  if (!caja || !cuenta) return;
  const n = caja.value.trim().length;
  cuenta.textContent = `${n} / 200`;
  cuenta.style.color = n > 200 ? 'var(--danger, #c0392b)' : '';
}

function mostrarEstadoPublicacion(n) {
  const p = $('#numPublicarEstado');
  if (!p) return;
  if (!n?.webArchivo) { p.textContent = ''; return; }
  if (n.borrador) {
    p.textContent = 'Subido como borrador: está en la web pero no se ve. Desmarca la casilla de arriba y vuelve a publicar para que salga.';
    return;
  }
  const cuando = n.webPublicadoEn
    ? ` el ${new Date(n.webPublicadoEn).toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
    : '';
  const url = `${SITIO_WEB}/n/${n.webArchivo.replace(/\.md$/, '')}/`;
  p.innerHTML = `Publicado${cuando}. <a href="${url}" target="_blank" rel="noopener">Verlo en la web ↗</a><br>Si vuelves a publicar, se actualiza — no se duplica.`;
}

function liveUpdate() {
  if (!currentNumero) return;
  currentNumero = { ...currentNumero, ...readEditor() };
  renderCover(currentNumero);
}

// ── borrador automático ───────────────────────────────────────────────────────
// El editorial solo existía en la pantalla hasta pulsar "Guardar entrega": si la
// app se recargaba o se cerraba antes, el texto se perdía sin remedio. Ahora se
// guarda solo mientras escribes y se ofrece recuperarlo al volver.

let draftTimer = null;

function scheduleDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 1200);
}

async function saveDraftNow() {
  if (!currentNumero) return;
  const d = readEditor();
  if (!d.numero && !d.gancho && !d.editorial && !d.destaque) return; // nada que guardar
  try {
    await db.setSetting('numeroDraft', { ...d, savedAt: Date.now() });
    const av = $('#numDraftSaved');
    if (av) {
      av.textContent = 'Borrador guardado ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      av.hidden = false;
    }
  } catch (err) {
    console.error('[borrador]', err);
  }
}

async function clearDraft() {
  try { await db.setSetting('numeroDraft', null); } catch { /* nada */ }
  const av = $('#numDraftSaved');
  if (av) av.hidden = true;
}

// ¿Hay un borrador que no llegó a guardarse como entrega?
async function pendingDraft() {
  const d = await db.getSetting('numeroDraft', null);
  if (!d || (!d.editorial && !d.gancho && !d.numero)) return null;
  const guardada = d.id ? await db.getNumber(d.id) : null;
  // Si coincide con lo ya guardado, no hay nada pendiente que recuperar.
  if (guardada &&
      (guardada.editorial || '') === (d.editorial || '') &&
      (guardada.gancho || '') === (d.gancho || '') &&
      (guardada.numero || '') === (d.numero || '') &&
      (guardada.destaque || '') === (d.destaque || '')) return null;
  return d;
}

// ── prompts del asistente ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el compañero editorial de "El Número", un proyecto de contenido semanal de Stefy (@Yomevoyconel30). Tu trabajo es ayudarla a encontrar el número de la semana, escribir y pulir el texto, convertirlo en publicaciones, y encontrar invitados para el podcast.

LA IDEA
Cada semana, un número es la puerta de entrada a una historia y a una lección. Los números pueden salir de cualquier parte —mercados, arte, maternidad, algo que se oyó, una observación—, no solo de la vida de Stefy. El número es el gancho; la historia es la recompensa.

LA VOZ
- En español. Cercana, honesta, con criterio. Directa, sin relleno.
- Cuando escribas en primera persona, eres la voz de Stefy.
- Es la evolución de "Yo me voy con el 30": misma voz, nuevo capítulo. Esa conexión es un activo, no la escondas.

LA AUDIENCIA
Mujeres que están construyendo algo —su carrera, su plata, su familia, su siguiente capítulo—. Base amplia: cabe la profesional y la que no lo es, sin perder nivel. Lo que las une no es el cargo, es el momento.

EL LENTE (por aquí pasa todo)
Economista, inversionista, mujer que dirige en finanzas, madre, guerrera, mirada de arte. Un número solo sirve si Stefy puede leerlo distinto a como lo leería cualquiera.

EL ARCO DE CADA PIEZA
Del mundo → a mí → a ellas: arranca en algo de actualidad, pasa por el lente propio, y aterriza en una lección útil.

REGLAS
- Nada genérico: si cualquiera pudo haberlo escrito, no sirve.
- Nada de cliché motivacional vacío.
- Si usas un dato o cifra de actualidad, debe ser real y verificable. Nunca inventes números.
- LinkedIn no es lo mismo que el carrusel: otro registro (insight en primera persona, no historia ilustrada).
- Cuando corrijas, sugiere y mejora; no reescribas todo salvo que te lo pidan.`;

// Las ideas salían repetitivas porque el prompt pedía siempre las mismas cinco
// canteras. Con una lista más ancha y una rotación por semana, cada tanda parte
// de terrenos distintos.
const CANTERAS = [
  'mercados y economía',
  'arte, museos y mercado del arte',
  'mujeres y liderazgo',
  'vida cotidiana y observación propia',
  'efemérides y aniversarios',
  'ciencia, salud y longevidad',
  'tecnología y su efecto en el trabajo',
  'demografía: natalidad, migración, envejecimiento',
  'consumo, precios y canasta familiar',
  'deporte y alto rendimiento',
  'música, cine y cultura popular',
  'ciudad, vivienda y movilidad',
  'educación y brecha de habilidades',
  'medio ambiente y transición energética',
  'historia con eco en el presente',
  'gastronomía y agroindustria',
  'moda y negocio de la imagen',
  'psicología, tiempo y atención',
];

// Rotación estable dentro de la misma semana (para que no cambie a cada toque)
// pero distinta cada semana, con algo de azar para que no sea previsible.
function canterasDeLaSemana(cuantas = 6) {
  const semana = Math.floor(Date.now() / (7 * 86400000));
  const pool = [...CANTERAS];
  const elegidas = [];
  let semilla = semana * 2654435761 % 4294967296;
  while (elegidas.length < cuantas && pool.length) {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    elegidas.push(pool.splice(semilla % pool.length, 1)[0]);
  }
  // Una al azar de verdad, para que dos tandas seguidas no sean idénticas.
  const resto = CANTERAS.filter((c) => !elegidas.includes(c));
  if (resto.length) elegidas.push(resto[Math.floor(Math.random() * resto.length)]);
  return elegidas;
}

function buildIdeaPrompt(headlines, publicados = []) {
  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [SYSTEM_PROMPT, ''];
  lines.push('---');
  lines.push('');
  lines.push(`FECHA DE HOY: ${today}`);
  lines.push('');
  lines.push('CONTEXTO DE ACTUALIDAD:');
  lines.push('');
  if (headlines.length) {
    lines.push(`Se cargaron ${headlines.length} titulares de fuentes colombianas e internacionales. Úsalos como punto de partida, pero COMPLEMENTA con lo que tú sabes que ha pasado esta semana (${today}) — noticias de mercados, política económica, cifras recientes, eventos culturales, datos de actualidad. Lo importante es que los números y hechos sean de esta semana, no de meses atrás.`);
    lines.push('');
    const byCat = {};
    for (const h of headlines) {
      if (!byCat[h.category]) byCat[h.category] = [];
      byCat[h.category].push(`- [${h.source}] ${h.title}`);
    }
    for (const [cat, items] of Object.entries(byCat)) {
      lines.push(`${cat.toUpperCase()}:`);
      lines.push(...items);
      lines.push('');
    }
  } else {
    lines.push(`No se pudieron cargar titulares RSS. Usa tu conocimiento propio sobre lo que ha pasado esta semana (${today}) en Colombia y el mundo: economía, mercados, cultura, mujeres líderes, cifras relevantes. Los números deben ser de actualidad reciente, no de meses atrás.`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  // Lo ya publicado, para que no vuelva sobre lo mismo.
  if (publicados.length) {
    lines.push('YA PUBLICADO — no repitas estos números ni vuelvas sobre su mismo ángulo:');
    lines.push('');
    for (const n of publicados) {
      lines.push(`- #${n.numero || '?'} — ${n.gancho || '(sin título)'}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const canteras = canterasDeLaSemana();
  lines.push(`Propón 4 números candidatos para esta semana (${today}). Cada uno debe venir de una cantera DISTINTA de esta lista, y no puedes usar dos veces la misma:

${canteras.map((c, i) => `(${i + 1}) ${c}`).join('\n')}

REGLAS DE VARIEDAD — importan tanto como el resto:
- Los cuatro candidatos deben ser de canteras distintas entre sí.
- Al menos uno tiene que venir de un terreno que NO sea economía ni mercados.
- Al menos uno debe salir de un sitio inesperado: una cifra pequeña, doméstica o rara, no un titular de portada.
- Nada de cifras redondas manidas (el 80/20, el 10.000, el 1 %) salvo que traigas un giro nuevo de verdad.
- Si un candidato se parece a algo ya publicado arriba, descártalo y busca otro.

IMPORTANTE: Los ganchos deben ser de esta semana o los últimos días — no uses noticias viejas o genéricas. Si los titulares de arriba no son suficientes, complementa con tu conocimiento actualizado.

Para cada candidato da: la cifra exacta, la cantera, el gancho de actualidad de esta semana (real y verificable), y el ángulo propio (cómo lo leería Stefy con su lente de economista, inversora, madre, mujer que construye).

Luego córrelo por el TEST y marca sí/no en cada una:
1. ¿Tiene gancho de actualidad de esta semana?
2. ¿Solo Stefy lo contaría así? (ángulo propio)
3. ¿Sorprende o revela algo?
4. ¿Le deja algo útil a la audiencia?
5. ¿Hay alguien con esa historia para entrevistar más adelante?

Un número se gana la semana con mínimo 3 de 5. En empate, gana el del ángulo más filoso. Recomienda uno y explica por qué en dos líneas.`);
  return lines.join('\n');
}

// Corrección conservadora: el prompt anterior pedía cuidar "el arco", "claridad
// y ritmo" y "que no sea genérico", que es una invitación a reescribir. Este
// solo permite tocar lo que está mal escrito, y devuelve cada cambio por
// separado para poder aprobarlos uno a uno.
function buildCorrectionPrompt(data) {
  return `${SYSTEM_PROMPT}

---

PROMPT: CORRECCIÓN DEL TEXTO

Corrígeme solo ortografía, puntuación, concordancia y errores de dedo.

REGLAS ESTRICTAS:
- No reescribas frases que ya son correctas, aunque se te ocurra una versión mejor.
- Conserva mi largo de frase, mi orden de ideas y mis expresiones propias.
- No agregues conectores ni rayas largas.
- No cambies el sentido de nada, ni un matiz.
- Si dudas entre corregir o dejarlo, déjalo.
- No toques el estilo: repeticiones, frases cortas o giros raros pueden ser intencionados.

FORMATO DE RESPUESTA — devuelve SOLO los cambios, uno por bloque, exactamente así:

===CAMBIO===
ANTES: (el fragmento exacto tal y como está en mi texto, copiado literal)
DESPUÉS: (el mismo fragmento ya corregido)
MOTIVO: (ortografía | puntuación | concordancia | error de dedo — en dos o tres palabras)

Copia en ANTES el fragmento literal, con las mismas palabras y mayúsculas, para
que se pueda localizar en el texto. Usa el fragmento más corto que contenga el
error, no el párrafo entero.

Si no hay nada que corregir, responde exactamente: SIN CAMBIOS

No añadas introducción, resumen ni comentarios finales.

---

NÚMERO: #${data.numero || '?'}
TÍTULO: ${data.gancho || ''}

EDITORIAL:
${data.editorial || '(vacío)'}`;
}

// Revision a fondo: es una conversacion, no una lista de reemplazos. Verifica
// cifras contra fuente primaria y comenta el texto. Nada de lo que devuelve se
// aplica solo — un dato que no se pudo verificar no se arregla con un boton,
// se quita a mano.
// Cuenta cuántas veces aparece el número dentro del texto, y en qué párrafos.
// Se cuenta aquí y no se le pide a Claude que lo estime: contar es lo único
// que una máquina hace mejor que un lector, y el dato exacto cambia el consejo.
export function rastrearNumero(editorial, numero, titulo = '') {
  const texto = String(editorial || '');
  const n = String(numero || '').trim();
  if (!n) return { veces: 0, parrafos: [], enTitulo: false, total: 0 };

  // Se busca la cifra tal cual y también sin separadores de miles, porque
  // «1.000» en la ficha puede estar escrito «1000» en el texto.
  const variantes = new Set([n, n.replace(/[.,\s]/g, '')]);
  const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = new RegExp([...variantes].filter(Boolean).map(escapar).join('|'), 'g');

  const parrafos = texto.split(/\n+/).filter((l) => l.trim());
  const donde = [];
  let veces = 0;
  parrafos.forEach((p, i) => {
    const m = p.match(patron);
    if (m) { veces += m.length; donde.push(i + 1); }
  });

  return {
    veces,
    parrafos: donde,
    enTitulo: patron.test(String(titulo || '')),
    total: parrafos.length,
  };
}

function buildRevisionPrompt(data) {
  const palabras = String(data.editorial || '').trim().split(/\s+/).filter(Boolean).length;
  const r = rastrearNumero(data.editorial, data.numero, data.gancho);
  const rastro = data.numero
    ? `El número elegido es ${data.numero}. Aparece ${r.veces} ${r.veces === 1 ? 'vez' : 'veces'} ` +
      `en el cuerpo${r.parrafos.length ? ` (párrafos ${r.parrafos.join(', ')} de ${r.total})` : ''}, ` +
      `y ${r.enTitulo ? 'sí' : 'no'} aparece en el título.`
    : 'No hay número elegido todavía.';
  return `${SYSTEM_PROMPT}

---

PROMPT: REVISIÓN A FONDO ANTES DE PUBLICAR

Vas a ayudarme a pulir un editorial de El Número antes de publicarlo.
Escribo en primera persona para mujeres que están construyendo algo:
una carrera, un patrimonio, un negocio, un próximo capítulo.

REGLA INNEGOCIABLE SOBRE MI VOZ
No reescribas mi texto. Corrige solo ortografía, puntuación, concordancia
y frases que se enredan. Nunca cambies mis ideas, mi orden de argumentos,
ni mi manera de decir las cosas. Si algo suena raro pero es mío, es mío.
Cuando propongas una reformulación, muéstrame el "antes" y el "después"
para que yo decida.

VERIFICACIÓN DE DATOS — es lo más importante
Toma cada cifra del texto y verifícala contra fuente primaria:
DANE, ONU/World Population Prospects, Banco de la República, Banco Mundial,
DIAN, Superfinanciera, registros legislativos. No aceptes medios,
consultoras ni "elaboración propia" de terceros.

Para cada cifra dime:
1. Si es correcta, la fuente exacta, el documento y el año.
2. Si está mal, cuál es el número correcto y de dónde sale.
3. Si no la puedes verificar en fuente primaria, dímelo explícitamente.
   Ese dato NO se publica.

Revisa además la COMPARABILIDAD: que dos números que pongo en la misma
frase tengan el mismo denominador, el mismo umbral de edad, la misma
unidad, el mismo año y la misma fuente. Si estoy comparando una tasa
específica contra una tasa global, o un indicador con umbral de 60 años
contra uno de 65, párame en seco y explícame por qué no se puede.

Si un número mío sale de una serie distinta a la de su comparación
(por ejemplo DANE contra ONU), adviértemelo aunque ambos sean correctos
por separado.

EL NÚMERO ELEGIDO — revísalo aparte
Cada editorial se llama por un número. Ese número tiene que sostener el texto,
no ser un adorno del titular. Dato exacto, ya contado: ${rastro}

Dime:
1. Si el número está de verdad trabajado o si solo lo menciono de pasada.
2. En qué punto exacto del texto debería volver a aparecer para que el lector
   no lo pierda —dame el párrafo y qué diría, sin reescribirme el resto—.
3. Si el título alude al número o lo ignora. Si lo ignora, propónme dos o tres
   títulos que sí lo recojan, con mis palabras y sin volverse ingeniosos.
4. Si el cierre lo retoma. Un editorial que abre con un número y cierra sin él
   deja al lector con la sensación de que el número sobraba.
5. Si el número que elegí es el más fuerte del texto, o si hay otra cifra ahí
   dentro que aguantaría mejor el peso. Dímelo aunque implique cambiar el
   título.

QUÉ MÁS QUIERO QUE ME DIGAS
- Cuál es el párrafo más flojo del texto y por qué.
- Si el arco mundo → yo → ellas está completo, o si me falta la capa personal.
- Si algún párrafo promete algo que después no entrego.
- Si el cierre es una pregunta abierta de verdad o se me volvió conclusión.
- Uno o dos datos adicionales de fuente primaria que fortalezcan el
  argumento que YA tengo (no un argumento nuevo).
- Si hay algo que afirmo sin respaldo y que la evidencia contradice.

FORMATO
Meta: entre 550 y 650 palabras. Voy en ${palabras}. Confírmame la cuenta.
Al final, cuando yo te lo pida, devuélveme la versión limpia completa
y una lista corta de exactamente qué cambiaste.

No me des menús de opciones largos. Dame tu recomendación directa
con la razón detrás. Si algo está mal, dímelo sin rodeos.

---

NÚMERO: #${data.numero || '?'}
TÍTULO: ${data.gancho || ''}

EDITORIAL:
${data.editorial || '(vacío)'}`;
}

// Localiza un fragmento dentro del editorial tolerando las diferencias que
// introduce Claude al citarlo: espacios de mas, saltos de linea donde habia un
// espacio, comillas curvas por rectas, guiones largos por cortos. Antes se
// buscaba con includes() a secas, y bastaba una coma distinta para que el
// cambio saliera gris e inaplicable — el usuario pulsaba "Corregir" y no se
// corregia nada.
//
// Devuelve { inicio, fin } sobre el texto ORIGINAL, o null.
export function localizarFragmento(texto, fragmento) {
  if (!texto || !fragmento) return null;

  const exacto = texto.indexOf(fragmento);
  if (exacto >= 0) return { inicio: exacto, fin: exacto + fragmento.length };

  // Normaliza y guarda de que posicion del original sale cada caracter, para
  // poder devolver un tramo del original y no del texto normalizado.
  const normalizar = (str, sinTildes) => {
    const chars = [];
    const mapa = [];
    let espacioPendiente = false;
    for (let i = 0; i < str.length; i++) {
      let c = str[i];
      if (/\s/.test(c)) { espacioPendiente = chars.length > 0; continue; }
      if (espacioPendiente) { chars.push(' '); mapa.push(i); espacioPendiente = false; }
      if ('\u2018\u2019\u201B'.includes(c)) c = "'";
      else if ('\u201C\u201D\u201F'.includes(c)) c = '"';
      else if ('\u2010\u2011\u2012\u2013\u2014\u2015\u2212'.includes(c)) c = '-';
      else if (c === '\u2026') c = '.';
      if (sinTildes) {
        const base = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (base) c = base[0];
      }
      chars.push(c.toLowerCase());
      mapa.push(i);
    }
    return { texto: chars.join(''), mapa };
  };

  for (const sinTildes of [false, true]) {
    const t = normalizar(texto, sinTildes);
    const f = normalizar(fragmento, sinTildes);
    if (!f.texto) continue;
    const i = t.texto.indexOf(f.texto);
    if (i < 0) continue;
    // Si aparece mas de una vez no se toca: no hay forma de saber cual queria.
    if (t.texto.indexOf(f.texto, i + 1) >= 0) return null;
    const inicio = t.mapa[i];
    const fin = t.mapa[i + f.texto.length - 1] + 1;
    return { inicio, fin };
  }
  return null;
}

// Aplica una lista de cambios sobre el texto. Va de atras hacia delante para
// que las posiciones ya calculadas no se muevan al ir sustituyendo.
export function aplicarCambios(texto, cambios) {
  const conSitio = cambios
    .map((c) => ({ c, sitio: localizarFragmento(texto, c.antes) }))
    .filter((x) => x.sitio)
    .sort((a, b) => b.sitio.inicio - a.sitio.inicio);

  let out = texto;
  for (const { c, sitio } of conSitio) {
    out = out.slice(0, sitio.inicio) + c.despues + out.slice(sitio.fin);
  }
  return { texto: out, aplicados: conSitio.length };
}

// Extrae los bloques ===CAMBIO=== y comprueba si cada uno se puede localizar en
// el texto. Devuelve null si la respuesta no viene en ese formato, para que la
// app pueda caer al modo antiguo de sustituir el texto entero.
export function parseCorrectionChanges(respuesta, editorial) {
  if (!respuesta) return null;
  if (/^\s*SIN CAMBIOS\s*$/im.test(respuesta) && !respuesta.includes('===CAMBIO===')) return [];
  const bloques = respuesta.split(/===\s*CAMBIO\s*===/i).slice(1);
  if (!bloques.length) return null;

  const cambios = [];
  for (const b of bloques) {
    const antes = (b.match(/ANTES:\s*([\s\S]*?)(?=\n\s*DESPU[EÉ]S:)/i) || [])[1];
    const despues = (b.match(/DESPU[EÉ]S:\s*([\s\S]*?)(?=\n\s*MOTIVO:|$)/i) || [])[1];
    const motivo = (b.match(/MOTIVO:\s*(.*)/i) || [])[1];
    if (antes == null || despues == null) continue;
    const a = antes.trim();
    const d = despues.trim();
    if (!a || a === d) continue;
    cambios.push({ antes: a, despues: d, motivo: (motivo || '').trim() || 'corrección',
                   encontrado: Boolean(localizarFragmento(editorial, a)) });
  }
  return cambios.length ? cambios : null;
}

function buildMontajePrompt(data) {
  return `${SYSTEM_PROMPT}

---

PROMPT: MONTAJE DE PUBLICACIONES

A partir del texto final, genera estas cuatro salidas. Mantén la cifra como gancho y el arco del mundo → a mí → a ellas.

1. CARRUSEL DE INSTAGRAM (7 slides): slide 1 portada con el número; slides 2–5 los beats de la historia; slide 6 la lección; slide 7 CTA. Texto breve por slide.

2. EDITORIAL (periódico local): el número como columna de opinión, con la firma de Stefy. Tono de columna, no de post.

3. LINKEDIN: el mismo número como reflexión profesional en primera persona. NO copies el carrusel: otro registro, insight primero, más analítico.

4. REEL (30–60s): guion hablado. Abre con el gancho (el número), desarrolla la revelación, cierra con la lección.

---

NÚMERO: #${data.numero || '?'}
TÍTULO: ${data.gancho || ''}

TEXTO FINAL:
${data.editorial || '(vacío)'}

DESTAQUE:
${data.destaque || '(ninguno)'}`;
}

function buildPodcastPrompt(data) {
  return `${SYSTEM_PROMPT}

---

PROMPT: CANDIDATOS PARA EL PODCAST

Con el número de la semana y su historia, sugiere 3–5 personas cuya vida gira en torno a esa cifra o ese tema, como posibles invitadas al podcast. Busca en la actualidad si hace falta.

Para cada una: quién es, por qué encaja con este número, y cómo contactarla si se sabe. Prioriza mujeres y perfiles alcanzables. Marca cuáles valdrían un episodio propio.

---

NÚMERO: #${data.numero || '?'}
TÍTULO: ${data.gancho || ''}
TEMA: ${data.editorial ? data.editorial.slice(0, 300) + '…' : '(sin editorial aún)'}`;
}

// ── panel Claude helpers ──────────────────────────────────────────────────────

function clearClaudePanels() {
  const avisos = $('#numRevisionAvisos');
  if (avisos) avisos.hidden = true;
  const hist = $('#historiaPanel');
  if (hist) hist.hidden = true;
  const panel = $('#numCambios');
  if (panel) panel.hidden = true;
  const undo = $('#numUndoCorreccion');
  if (undo) undo.hidden = true;
  ['numIdeaPaste', 'numCorreccionPaste', 'numRevisionPaste', 'numMontajePaste', 'numPodcastPaste'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.value = '';
  });
  ['numIdeaPanel', 'numCorreccionPanel', 'numRevisionPanel', 'numMontajePanel', 'numPodcastPanel'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.hidden = true;
  });
}

function openPanel(panelId) {
  ['numIdeaPanel', 'numCorreccionPanel', 'numRevisionPanel', 'numMontajePanel', 'numPodcastPanel'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.hidden = id !== panelId;
  });
}

async function copyToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg || 'Copiado ✨ Pégalo en claude.ai');
  } catch {
    showToast('No se pudo copiar — revisa permisos del navegador');
  }
}

// ── gestión de fuentes RSS (desde Ajustes) ───────────────────────────────────

export async function initRssSources() {
  const saved = await db.getRssSources();
  let sources = saved || DEFAULT_SOURCES.map((s) => ({ ...s }));

  function renderSources() {
    const list = $('#rssSourcesList');
    if (!list) return;
    list.innerHTML = '';
    sources.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'rss-row';
      row.innerHTML = `
        <label class="rss-toggle">
          <input type="checkbox" ${s.active ? 'checked' : ''} />
          <span class="rss-name">${escHtml(s.name)}</span>
          <span class="rss-cat muted">${escHtml(s.category)}</span>
        </label>
        <button type="button" class="rss-del link-btn danger" aria-label="Eliminar">✕</button>`;
      row.querySelector('input').addEventListener('change', async (e) => {
        sources[i].active = e.target.checked;
        await db.saveRssSources(sources);
      });
      row.querySelector('.rss-del').addEventListener('click', async () => {
        sources.splice(i, 1);
        await db.saveRssSources(sources);
        renderSources();
      });
      list.appendChild(row);
    });
  }

  renderSources();

  $('#rssAddBtn')?.addEventListener('click', async () => {
    const name = $('#rssNewName').value.trim();
    const url = $('#rssNewUrl').value.trim();
    const cat = $('#rssNewCat').value.trim() || 'general';
    if (!name || !url) { showToast('Escribe el nombre y la URL'); return; }
    sources.push({ id: cryptoId(), name, url, category: cat, active: true });
    await db.saveRssSources(sources);
    $('#rssNewName').value = '';
    $('#rssNewUrl').value = '';
    $('#rssNewCat').value = '';
    renderSources();
    showToast('Fuente agregada ✨');
  });

  $('#rssResetBtn')?.addEventListener('click', async () => {
    if (!confirm('¿Restaurar las fuentes originales? Se perderán las que hayas agregado.')) return;
    sources = DEFAULT_SOURCES.map((s) => ({ ...s }));
    await db.saveRssSources(sources);
    renderSources();
    showToast('Fuentes restauradas');
  });
}

// ── init ──────────────────────────────────────────────────────────────────────

export async function initNumero() {
  $('#newNumeroBtn').addEventListener('click', () => openNumero(null));

  $('#backToNumeros').addEventListener('click', async () => {
    showNumeroScreen();
    await renderNumerosList();
  });

  // ── Historia para Instagram ──
  // Se enseña la imagen antes de compartirla: es lo que va a ver su gente, y
  // un título que se sale del margen no se arregla después de publicarlo.

  let plantillaActual = 'numero';

  async function pintarHistoria() {
    const data = readEditor();
    const lienzo = await dibujarHistoria(data, plantillaActual);
    const destino = $('#historiaLienzo');
    destino.width = lienzo.width;
    destino.height = lienzo.height;
    destino.getContext('2d').drawImage(lienzo, 0, 0);
  }

  function pintarPestanas() {
    const cont = $('#historiaTabs');
    if (!cont) return;
    const data = readEditor();
    cont.innerHTML = '';
    for (const p of PLANTILLAS) {
      // "La frase" solo tiene sentido si hay destaque escrito.
      if (p.id === 'destaque' && !data.destaque) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.nombre;
      b.setAttribute('aria-pressed', String(p.id === plantillaActual));
      b.addEventListener('click', async () => {
        plantillaActual = p.id;
        pintarPestanas();
        await pintarHistoria();
      });
      cont.appendChild(b);
    }
  }

  $('#historiaBtn')?.addEventListener('click', async () => {
    const data = readEditor();
    if (!data.numero && !data.gancho) { showToast('Escribe el número y el título primero'); return; }
    const panel = $('#historiaPanel');
    panel.hidden = false;
    if (plantillaActual === 'destaque' && !data.destaque) plantillaActual = 'numero';
    pintarPestanas();
    try {
      await pintarHistoria();
      $('#historiaNota').textContent = navigator.canShare
        ? 'Al compartir, elige Instagram → Historia.'
        : 'Tu navegador no comparte archivos: se descargará la imagen y la subes desde Instagram.';
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      showErrorPanel('No se pudo crear la historia: ' + e.message);
    }
  });

  $('#historiaCompartir')?.addEventListener('click', async () => {
    const btn = $('#historiaCompartir');
    btn.disabled = true;
    try {
      const r = await compartirHistoria(readEditor(), plantillaActual);
      if (r.cancelado) showToast('Cancelado');
      else showToast(r.compartido ? 'Compartido ✨' : `Descargado: ${r.nombre}`);
    } catch (e) {
      showErrorPanel('No se pudo compartir: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('#historiaCerrar')?.addEventListener('click', () => { $('#historiaPanel').hidden = true; });

  // Word, que es el formato en el que los periódicos piden la columna. Lleva la
  // firma al final, como la mandan ellos.
  $('#exportNumeroWordBtn')?.addEventListener('click', () => {
    const data = readEditor();
    if (!data.editorial) { showToast('Escribe el editorial primero'); return; }
    try {
      const nombre = descargarDocx(data);
      showToast(`Descargado: ${nombre}`);
    } catch (e) {
      showErrorPanel('No se pudo crear el archivo de Word: ' + e.message);
    }
  });

  $('#exportNumeroPdfBtn').addEventListener('click', () => {
    const data = readEditor();
    if (!data.editorial && !data.numero) { showToast('Escribe el editorial primero'); return; }
    const destaqueHtml = data.destaque
      ? `<blockquote style="border-left:4px solid #1a4d72;padding-left:1rem;font-style:italic;color:#444;margin:2rem 0">${escHtml(data.destaque)}</blockquote>`
      : '';
    const content = `
<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #1a4d72;padding-bottom:1rem;margin-bottom:2rem">
  <svg width="52" height="52" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
    <rect width="100" height="100" rx="14" fill="#1a4d72"/>
    <polygon points="14,85 14,15 26,15 74,72 74,15 86,15 86,85 74,85 26,28 26,85" fill="#f5f0e6"/>
    <circle cx="77" cy="19" r="13" fill="#f2c840"/>
  </svg>
  <div>
    <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.12em;color:#888">UN NÚMERO · UNA HISTORIA</div>
    <div style="font-size:1.1rem;font-weight:700;color:#1a4d72">El Número</div>
    <div style="font-size:2rem;font-weight:700;color:#1a4d72;line-height:1.1">#${escHtml(data.numero || '')}</div>
  </div>
</div>
<h1 style="font-family:Georgia,serif;font-size:1.5rem;color:#1a4d72;margin-bottom:1.5rem">${escHtml(data.gancho || '')}</h1>
<div style="font-family:Georgia,serif;white-space:pre-wrap;font-size:1rem;line-height:1.7;color:#222">${escHtml(data.editorial || '')}</div>
${destaqueHtml}
<p style="text-align:right;font-weight:700;margin-top:2.5rem;color:#1a4d72">${escHtml(FIRMA)}</p>`;

    showNumPrintOverlay(content);
  });

function showNumPrintOverlay(contentHtml) {
  document.getElementById('numPrintOverlay')?.remove();
  document.getElementById('numPrintStyle')?.remove();
  const style = document.createElement('style');
  style.id = 'numPrintStyle';
  style.textContent = '@media print{body>*:not(#numPrintOverlay){display:none!important}#numPrintOverlay{position:static!important;overflow:visible!important}#numPrintOverlay .pdf-tb{display:none!important}}';
  document.head.appendChild(style);
  const ov = document.createElement('div');
  ov.id = 'numPrintOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:10000;overflow-y:auto;padding:1rem;font-family:Georgia,serif';
  ov.innerHTML = `
    <div class="pdf-tb" style="display:flex;gap:10px;margin-bottom:1rem;position:sticky;top:0;background:#f5f5f5;padding:.5rem 0;z-index:1">
      <button id="numOvPrint" style="background:#1a4d72;color:#fff;border:none;border-radius:8px;padding:.6rem 1.4rem;font-size:1rem;cursor:pointer">💾 Guardar como PDF</button>
      <button id="numOvClose" style="background:#ddd;color:#333;border:none;border-radius:8px;padding:.6rem 1.2rem;font-size:1rem;cursor:pointer">✕ Cerrar</button>
    </div>
    <div style="background:#fff;max-width:680px;margin:0 auto;padding:2rem 1.5rem;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.08)">${contentHtml}</div>`;
  document.body.appendChild(ov);
  ov.querySelector('#numOvPrint').addEventListener('click', () => window.print());
  ov.querySelector('#numOvClose').addEventListener('click', () => {
    ov.remove();
    document.getElementById('numPrintStyle')?.remove();
  });
}

  $('#saveNumeroBtn').addEventListener('click', async () => {
    const data = readEditor();
    if (!data.numero) { showToast('Escribe el número primero'); return; }
    currentNumero = { ...currentNumero, ...data };
    await db.saveNumber(currentNumero);
    await clearDraft();
    showNumeroScreen();
    await renderNumerosList();
    showToast('Número guardado ✨');
  });

  // ── Publicar en la web ──
  //
  // Nunca sube nada sin ensenar antes exactamente que se va a subir: es una
  // accion publica y no se puede deshacer con un boton.

  $('#numAddFuente')?.addEventListener('click', () => {
    const cont = $('#numFuentesLista');
    cont.appendChild(filaFuente({}, cont.children.length));
    cont.lastElementChild.querySelector('.f-nombre').focus();
  });

  $('#numResumen')?.addEventListener('input', actualizarCuentaResumen);

  function cerrarVistaPrevia() {
    document.getElementById('numPubOverlay')?.remove();
  }

  function pedirConfirmacion(entrega, markdown, archivo, yaEstaba) {
    return new Promise((resolve) => {
      cerrarVistaPrevia();
      const ov = document.createElement('div');
      ov.id = 'numPubOverlay';
      ov.className = 'overlay';
      ov.innerHTML = `
        <div class="overlay-card">
          <h3>${yaEstaba ? 'Actualizar en la web' : 'Publicar en la web'}</h3>
          <p class="muted">Esto queda ${entrega.borrador ? 'escrito en la web sin verse (borrador)' : 'a la vista de cualquiera'}. Revisa antes de confirmar.</p>
          <dl class="pub-resumen">
            <dt>Número</dt><dd>${escHtml(entrega.numero)}</dd>
            <dt>Título</dt><dd>${escHtml(entrega.gancho)}</dd>
            <dt>Fecha</dt><dd>${escHtml(entrega.fecha)}</dd>
            <dt>Cantera</dt><dd>${escHtml(entrega.cantera)}</dd>
            <dt>Fuentes</dt><dd>${(entrega.fuentes || []).length || 'ninguna'}</dd>
            <dt>Dirección</dt><dd class="pub-url">/n/${escHtml(archivo.replace(/\.md$/, ''))}/</dd>
          </dl>
          <details class="pub-detalle">
            <summary>Ver el archivo completo</summary>
            <pre class="pub-md">${escHtml(markdown)}</pre>
          </details>
          <div class="settings-row" style="margin-top:14px">
            <button type="button" id="numPubOk" class="btn num-btn-primary">${yaEstaba ? 'Actualizar' : 'Publicar'}</button>
            <button type="button" id="numPubCancel" class="btn ghost">Cancelar</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const cerrar = (v) => { cerrarVistaPrevia(); resolve(v); };
      ov.querySelector('#numPubOk').addEventListener('click', () => cerrar(true));
      ov.querySelector('#numPubCancel').addEventListener('click', () => cerrar(false));
      ov.addEventListener('click', (e) => { if (e.target === ov) cerrar(false); });
    });
  }

  // Sin llave de GitHub el boton no se queda mudo: entrega el archivo hecho
  // para subirlo a mano, que es lo unico que puede fallar por su cuenta.
  function ofrecerArchivoAMano(markdown, archivo) {
    cerrarVistaPrevia();
    const ov = document.createElement('div');
    ov.id = 'numPubOverlay';
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card">
        <h3>Falta la llave de GitHub</h3>
        <p class="muted">Para publicar con un botón, pon tu llave en <strong>Ajustes → Publicar en la web</strong>. Mientras tanto, aquí tienes el archivo listo:</p>
        <ol class="muted small" style="padding-left:18px;line-height:1.6">
          <li>Copia todo el texto de abajo.</li>
          <li>Entra a <strong>github.com/sdagerj/el-numero</strong> → carpeta <strong>src</strong> → <strong>content</strong> → <strong>editoriales</strong>.</li>
          <li><strong>Add file → Create new file</strong>, ponle de nombre <strong>${escHtml(archivo)}</strong> y pega el texto.</li>
          <li>Abajo, botón verde <strong>Commit changes</strong>.</li>
        </ol>
        <textarea id="numPubMd" rows="12" readonly style="width:100%;font-size:.85rem;margin-top:8px"></textarea>
        <div class="settings-row" style="margin-top:12px">
          <button type="button" id="numPubCopiar" class="btn num-btn-primary">Copiar el archivo</button>
          <button type="button" id="numPubCancel" class="btn ghost">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#numPubMd').value = markdown;
    ov.querySelector('#numPubCopiar').addEventListener('click', () => {
      const caja = ov.querySelector('#numPubMd');
      caja.select();
      navigator.clipboard?.writeText(markdown).catch(() => {});
      showToast('Copiado ✨');
    });
    ov.querySelector('#numPubCancel').addEventListener('click', cerrarVistaPrevia);
    ov.addEventListener('click', (e) => { if (e.target === ov) cerrarVistaPrevia(); });
  }

  $('#numPublicarBtn')?.addEventListener('click', async () => {
    const btn = $('#numPublicarBtn');
    const entrega = { ...currentNumero, ...readEditor() };

    const faltan = problemasParaPublicar(entrega);
    if (faltan.length) {
      alert('Antes de publicar falta esto:\n\n• ' + faltan.join('\n• '));
      return;
    }

    if (entrega.datosSinVerificar && !confirm(
      'La revisión encontró al menos una cifra que no se pudo verificar en fuente primaria.\n\n' +
      'Publicar un dato sin comprobar va con tu nombre encima.\n\n¿Ya la quitaste o la comprobaste tú?'
    )) return;

    // Se guarda primero: si algo sale mal despues, el texto ya esta a salvo.
    currentNumero = entrega;
    await db.saveNumber(currentNumero);
    await clearDraft();

    const archivo = entrega.webArchivo || nombreArchivo(entrega.fecha, entrega.gancho);
    const markdown = construirMarkdown(entrega);
    const token = await getGithubToken();

    if (!token) { ofrecerArchivoAMano(markdown, archivo); return; }
    if (!(await pedirConfirmacion(entrega, markdown, archivo, Boolean(entrega.webArchivo)))) return;

    btn.disabled = true;
    const etiqueta = btn.textContent;
    btn.textContent = 'Publicando…';
    try {
      const r = await publicarEnLaWeb(entrega, token);
      currentNumero = { ...currentNumero, webArchivo: r.archivo, webPublicadoEn: new Date().toISOString() };
      await db.saveNumber(currentNumero);
      mostrarEstadoPublicacion(currentNumero);
      await renderNumerosList();
      showToast(r.actualizado ? 'Actualizado en la web ✨' : 'Publicado ✨');
      alert(
        r.borrador
          ? 'Subido como BORRADOR.\n\nQueda guardado en la web pero no se ve, y todavía no tiene dirección propia.\n\nCuando lo quieras publicar de verdad: desmarca la casilla de borrador y vuelve a darle a Publicar.'
          : (r.actualizado ? 'Actualizado.' : '¡Publicado!') +
            '\n\nLa web tarda un par de minutos en reconstruirse. Después estará en:\n' + r.url
      );
    } catch (e) {
      alert('No se pudo publicar.\n\n' + e.message + '\n\nTu editorial está guardado: no se perdió nada.');
    } finally {
      btn.disabled = false;
      btn.textContent = etiqueta;
    }
  });

  $('#deleteNumeroBtn').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este número?')) return;
    await db.deleteNumber(currentNumero.id);
    showNumeroScreen();
    await renderNumerosList();
  });

  const nav = $('#numCarouselNav');
  if (nav) nav.hidden = true;

  ['numNumero', 'numGancho'].forEach((id) => $(`#${id}`)?.addEventListener('input', liveUpdate));
  // Todos los campos disparan el borrador automático, no solo los de la portada.
  ['numNumero', 'numGancho', 'numEditorial', 'numDestaque', 'numResumen',
   'numCantera', 'numFecha', 'numMedioNombre', 'numMedioUrl', 'numBorrador']
    .forEach((id) => $(`#${id}`)?.addEventListener('input', scheduleDraftSave));
  // Y se guarda también al salir de la app o cambiar de pestaña del navegador.
  window.addEventListener('pagehide', saveDraftNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraftNow(); });

  // ── Botones Claude ──

  // Sin API key el prompt hay que poder copiarlo a mano. Escribirlo siempre en
  // la caja es lo único fiable: en Safari el portapapeles falla cuando la
  // llamada llega después de un await, y antes la caja se quedaba vacía — no
  // había nada que copiar ni nada que aplicar después.
  function mostrarPromptParaCopiar(pasteId, hintId, prompt) {
    const caja = $(`#${pasteId}`);
    if (caja) { caja.value = prompt; caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const hint = $(`#${hintId}`);
    if (hint) hint.hidden = false;
  }

  async function runWithClaude(btn, originalLabel, prompt, onResult, fallbackMsg, pasteId, hintId) {
    const key = await getApiKey();
    if (key && !hasApiKey(key)) {
      showErrorPanel('No se pudo usar tu API key.\n' + describeApiKeyProblem(key) +
        '\n\nMientras tanto, abajo tienes el texto para pegarlo en claude.ai.');
    }
    if (hasApiKey(key)) {
      btn.disabled = true;
      btn.textContent = 'Consultando a Claude…';
      try {
        const result = await callClaude(prompt);
        onResult(result);
      } catch (err) {
        console.error('[Claude error]', err);
        if (err.message === 'NO_KEY') {
          await copyToClipboard(prompt, fallbackMsg);
        } else if (err.message === 'KEY_INVALID') {
          showErrorPanel('La API key no es válida. Ve a Ajustes → Claude API y verifica tu clave.');
        } else if (err.message === 'RATE_LIMIT') {
          showErrorPanel('Límite de solicitudes alcanzado. Espera un momento e intenta de nuevo.');
        } else {
          showErrorPanel('Error al conectar con Claude:\n' + err.message);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    } else {
      mostrarPromptParaCopiar(pasteId, hintId, prompt);
      try {
        await navigator.clipboard.writeText(prompt);
        showToast(fallbackMsg);
      } catch {
        showToast('Copia el texto de la caja y pégalo en claude.ai');
      }
    }
  }

  // IDEAR
  $('#numIdeaBtn').addEventListener('click', async () => {
    const btn = $('#numIdeaBtn');
    btn.disabled = true;
    btn.textContent = 'Buscando noticias…';
    openPanel('numIdeaPanel');
    let headlines = [];
    try {
      const saved = await db.getRssSources();
      const sources = saved || DEFAULT_SOURCES;
      headlines = await fetchHeadlines(sources);
    } catch { /* silencioso */ }
    let publicados = [];
    try { publicados = (await db.getAllNumbers()).slice(0, 15); } catch { /* sin archivo */ }
    const prompt = buildIdeaPrompt(headlines, publicados);
    const key = await getApiKey();
    if (hasApiKey(key)) {
      btn.textContent = 'Consultando a Claude…';
      try {
        const result = await callClaude(prompt);
        $('#numIdeaPaste').value = result;
        showToast('Ideas listas ✨');
      } catch (err) {
        console.error('[Claude Idear]', err);
        if (err.message === 'NO_KEY') {
          showErrorPanel('No hay API key configurada. Ve a Ajustes → Claude API.');
        } else if (err.message === 'KEY_INVALID') {
          showErrorPanel('La API key no es válida. Ve a Ajustes → Claude API y verifica tu clave.');
        } else if (err.message === 'RATE_LIMIT') {
          showErrorPanel('Límite de solicitudes alcanzado. Espera un momento e intenta de nuevo.');
        } else {
          showErrorPanel('Error al conectar con Claude:\n' + err.message);
        }
      }
    } else {
      // Si hay una clave guardada pero no sirve, hay que decirlo: pasar al modo
      // "cópialo a mano" sin avisar parece que el botón hace algo raro.
      if (key) showErrorPanel('No se pudo usar tu API key.\n' + describeApiKeyProblem(key) +
        '\n\nMientras tanto, abajo tienes el texto para pegarlo en claude.ai.');
      // Sin API key el texto se copia al portapapeles, pero en Safari ese
      // copiado falla porque la espera de los titulares rompe el permiso del
      // toque. Antes no se escribía nada en la caja y la pantalla quedaba
      // vacía: ahora el texto siempre queda a la vista para copiarlo a mano.
      $('#numIdeaPaste').value = prompt;
      $('#numIdeaPaste').readOnly = false;
      $('#numIdeaHint').hidden = false;
      try {
        await navigator.clipboard.writeText(prompt);
        showToast(`Copiado ✨ — ${headlines.length} titulares incluidos`);
      } catch {
        showToast('Copia el texto de la caja y pégalo en claude.ai');
      }
      $('#numIdeaPaste').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    btn.disabled = false;
    btn.textContent = '💡 Idear número';
  });

  // CORREGIR
  $('#numCorreccionBtn').addEventListener('click', async () => {
    const data = readEditor();
    if (!data.editorial) { showToast('Escribe el editorial primero'); return; }
    openPanel('numCorreccionPanel');
    await runWithClaude(
      $('#numCorreccionBtn'), '✏️ Corregir',
      buildCorrectionPrompt(data),
      (result) => {
        $('#numCorreccionPaste').value = result;
        mostrarCambios(result);
        showToast('Corrección lista ✨');
      },
      'Copiado ✨ Pégalo en claude.ai',
      'numCorreccionPaste', 'numCorreccionHint'
    );
  });

  $('#numRevisionBtn')?.addEventListener('click', async () => {
    const data = readEditor();
    if (!data.editorial) { showToast('Escribe el editorial primero'); return; }
    openPanel('numRevisionPanel');
    await runWithClaude(
      $('#numRevisionBtn'), '🔎 Revisar a fondo',
      buildRevisionPrompt(data),
      (result) => {
        $('#numRevisionPaste').value = result;
        marcarDatosSinVerificar(result);
        showToast('Revisión lista ✨');
      },
      'Copiado ✨ Pégalo en claude.ai',
      'numRevisionPaste', 'numRevisionHint'
    );
  });

  $('#numLimpiarRevision')?.addEventListener('click', () => {
    $('#numRevisionPaste').value = '';
    $('#numRevisionAvisos').hidden = true;
    if (currentNumero) { currentNumero.datosSinVerificar = false; saveDraftNow(); }
  });

  // Si la revision dice que una cifra no se pudo verificar, la entrega queda
  // marcada y publicar exige confirmarlo a mano. Es la regla que se rompio una
  // vez publicando un dato inventado con una fuente real encima.
  function marcarDatosSinVerificar(respuesta) {
    const avisos = $('#numRevisionAvisos');
    const sospecha = /no (la |lo )?(puedo|pude|he podido) verificar|no se (pudo|puede) verificar|sin fuente primaria|no verificable|NO se publica/i
      .test(respuesta || '');
    if (currentNumero) currentNumero.datosSinVerificar = sospecha;
    if (!avisos) return;
    avisos.hidden = !sospecha;
    if (sospecha) {
      avisos.innerHTML = '<strong>⚠️ Hay al menos una cifra que Claude no pudo verificar.</strong><br>' +
        'Búscala en el informe de arriba y quítala del editorial. Si intentas publicar, te lo voy a volver a preguntar.';
    }
    saveDraftNow();
  }

  // ── Cambios uno a uno ────────────────────────────────────────────────────
  // Sustituir el editorial entero siempre es un acto de fe. Aquí cada cambio se
  // ve antes de entrar, para que no se cuele ninguno que altere el sentido.
  let cambiosActuales = [];

  function mostrarCambios(respuesta) {
    const editorial = $('#numEditorial').value;
    const cambios = parseCorrectionChanges(respuesta, editorial);
    const panel = $('#numCambios');
    if (!cambios) { panel.hidden = true; return false; }   // formato libre: modo antiguo

    cambiosActuales = cambios;
    if (!cambios.length) {
      panel.hidden = false;
      $('#numCambiosTitulo').textContent = 'Sin cambios que proponer — tu texto está limpio.';
      $('#numCambiosLista').innerHTML = '';
      return true;
    }

    const perdidos = cambios.filter((c) => !c.encontrado).length;
    $('#numCambiosTitulo').textContent =
      `${cambios.length} cambio${cambios.length !== 1 ? 's' : ''} propuesto${cambios.length !== 1 ? 's' : ''}` +
      (perdidos ? ` · ${perdidos} sin localizar` : '');

    const lista = $('#numCambiosLista');
    lista.innerHTML = '';
    cambios.forEach((c, i) => {
      const row = document.createElement('label');
      row.className = 'cambio' + (c.encontrado ? '' : ' perdido');
      row.innerHTML = `
        <input type="checkbox" data-i="${i}" ${c.encontrado ? 'checked' : 'disabled'} />
        <span class="cambio-texto">
          <span class="cambio-antes">${escHtml(c.antes)}</span>
          →
          <span class="cambio-despues">${escHtml(c.despues)}</span>
          <span class="cambio-motivo">${c.encontrado ? escHtml(c.motivo) : 'no se encontró ese fragmento en tu texto'}</span>
        </span>`;
      lista.appendChild(row);
    });
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  }

  $('#numCambiosTodos').addEventListener('click', () => {
    $$('#numCambiosLista input:not(:disabled)').forEach((cb) => (cb.checked = true));
  });
  $('#numCambiosNinguno').addEventListener('click', () => {
    $$('#numCambiosLista input').forEach((cb) => (cb.checked = false));
  });

  $('#numAplicarSeleccion').addEventListener('click', () => {
    const marcados = $$('#numCambiosLista input:checked').map((cb) => cambiosActuales[+cb.dataset.i]);
    if (!marcados.length) { showToast('No hay ningún cambio marcado'); return; }

    const anterior = $('#numEditorial').value;
    const { texto, aplicados } = aplicarCambios(anterior, marcados);
    if (!aplicados) { showErrorPanel('No se pudo aplicar ninguno: los fragmentos ya no coinciden con tu texto.'); return; }
    if (aplicados < marcados.length) {
      showToast(`Se aplicaron ${aplicados} de ${marcados.length} — el resto ya no coincidía`);
    }

    $('#numEditorial').value = texto;
    if (currentNumero) currentNumero.editorial = texto;
    saveDraftNow();

    const undo = $('#numUndoCorreccion');
    undo.hidden = false;
    undo.onclick = () => {
      $('#numEditorial').value = anterior;
      if (currentNumero) currentNumero.editorial = anterior;
      saveDraftNow();
      undo.hidden = true;
      showToast('Editorial restaurado a como estaba');
    };
    showToast(`${aplicados} cambio${aplicados !== 1 ? 's' : ''} aplicado${aplicados !== 1 ? 's' : ''} ✨ — puedes deshacer`);
  });

  // Si pega la respuesta a mano, también se intentan los cambios uno a uno.
  $('#numCorreccionPaste').addEventListener('input', () => {
    const v = $('#numCorreccionPaste').value;
    if (v.includes('===CAMBIO===')) mostrarCambios(v);
    else $('#numCambios').hidden = true;
  });

  $('#numAplicarCorreccion').addEventListener('click', () => {
    const v = $('#numCorreccionPaste').value.trim();
    if (!v) { showToast('Primero obtén la corrección de Claude'); return; }
    // Quitar todo desde "Nota editorial", "---", "Ajustes", "Cambios" en adelante
    const notaPattern = /^(nota editorial|nota|ajustes|cambios realizados|cambios|comentarios|\*\*nota|\*\*ajustes|\*\*cambios)/i;
    const sepPattern = /^(-{3,}|\*{3,}|_{3,})$/;
    const cutPatterns = (l) => notaPattern.test(l) || sepPattern.test(l);
    const lines = v.split('\n');

    // Si la respuesta ARRANCA con la nota, no trae texto corregido: aplicarla
    // sustituiría el editorial por los comentarios de Claude.
    if (notaPattern.test(lines[0].trim())) {
      showErrorPanel('La respuesta de Claude son solo comentarios, no el texto corregido.\n\n' +
        'Tu editorial NO se ha tocado. Pídele que te devuelva el texto completo.');
      return;
    }

    let cutIndex = lines.findIndex((l) => cutPatterns(l.trim()));
    // Si el corte cae en la primera línea se llevaría el texto entero: la
    // respuesta empieza por "---" y lo corregido viene después. Cortar ahí
    // dejaba el editorial vacío y borraba el trabajo.
    if (cutIndex === 0) cutIndex = lines.slice(1).findIndex((l) => cutPatterns(l.trim())) + 1 || -1;
    const cleanLines = cutIndex === -1 ? lines : lines.slice(0, cutIndex);
    // Quitar las líneas que sean SOLO un rótulo. Antes bastaba con que la línea
    // empezara por "texto corregido" para borrarla entera, así que se comía
    // párrafos de verdad que empezaran con esas palabras.
    const placeholderPattern = /^(aquí va|aqui va|\[texto[^\]]*\]|texto corregido|\*\*texto corregido\*\*)\s*:?\s*$/i;
    const limpiar = (ls) => ls
      .filter((l) => !placeholderPattern.test(l.trim()))
      .join('\n')
      .replace(/^(\s*(-{3,}|\*{3,}|_{3,})\s*\n?)+/, '')  // separadores sueltos al principio
      .replace(/(\n?\s*(-{3,}|\*{3,}|_{3,})\s*)+$/, '')  // y al final
      .trim();
    // Si el recorte deja el texto vacío, se usa la respuesta entera antes que
    // sustituir el editorial por nada.
    const editorial = limpiar(cleanLines) || limpiar(lines);

    const anterior = $('#numEditorial').value;
    if (!editorial) {
      showErrorPanel('No se pudo entender la corrección: no se encontró texto que aplicar.\n\n' +
        'Tu editorial NO se ha tocado. Revisa lo que pegaste de Claude.');
      return;
    }
    if (editorial === anterior) { showToast('La corrección es igual a lo que ya tenías'); return; }

    $('#numEditorial').value = editorial;
    if (currentNumero) currentNumero.editorial = editorial;
    saveDraftNow();
    $('#numEditorial').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Poder volver atrás: sustituir el editorial es destructivo y hasta ahora
    // no había forma de recuperar la versión anterior.
    const undo = $('#numUndoCorreccion');
    if (undo) {
      undo.hidden = false;
      undo.onclick = () => {
        $('#numEditorial').value = anterior;
        if (currentNumero) currentNumero.editorial = anterior;
        saveDraftNow();
        undo.hidden = true;
        showToast('Editorial restaurado a como estaba');
      };
    }
    showToast('Editorial actualizado ✨ — puedes deshacer');
  });

  $('#numLimpiarCorreccion').addEventListener('click', () => { $('#numCorreccionPaste').value = ''; });

  // MONTAR
  $('#numMontajeBtn').addEventListener('click', async () => {
    const data = readEditor();
    if (!data.editorial) { showToast('Escribe el editorial primero'); return; }
    openPanel('numMontajePanel');
    await runWithClaude(
      $('#numMontajeBtn'), '📲 Montar',
      buildMontajePrompt(data),
      (result) => { $('#numMontajePaste').value = result; showToast('Formatos listos ✨'); },
      'Copiado ✨ Pégalo en claude.ai',
      'numMontajePaste', 'numMontajeHint'
    );
  });

  $('#numLimpiarMontaje').addEventListener('click', () => { $('#numMontajePaste').value = ''; });

  // PODCAST
  $('#numPodcastBtn').addEventListener('click', async () => {
    const data = readEditor();
    openPanel('numPodcastPanel');
    await runWithClaude(
      $('#numPodcastBtn'), '🎙️ Podcast',
      buildPodcastPrompt(data),
      (result) => { $('#numPodcastPaste').value = result; showToast('Candidatas listas ✨'); },
      'Copiado ✨ Pégalo en claude.ai',
      'numPodcastPaste', 'numPodcastHint'
    );
  });

  $('#numLimpiarPodcast').addEventListener('click', () => { $('#numPodcastPaste').value = ''; });

  await renderNumerosList();
  await offerDraftRecovery();
}

// Aviso al entrar: hay texto sin guardar de una sesión anterior.
async function offerDraftRecovery() {
  const d = await pendingDraft();
  const banner = $('#numDraftBanner');
  if (!banner) return;
  if (!d) { banner.hidden = true; return; }
  const cuando = new Date(d.savedAt || Date.now()).toLocaleString('es', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const resumen = (d.editorial || d.gancho || '').slice(0, 90);
  $('#numDraftWhen').textContent = cuando;
  $('#numDraftPreview').textContent = resumen ? resumen + '…' : '(sin texto)';
  banner.hidden = false;

  $('#numDraftRestore').onclick = async () => {
    currentNumero = { ...d };
    delete currentNumero.savedAt;
    populateEditor(currentNumero);
    showEditorScreen();
    renderCover(currentNumero);
    clearClaudePanels();
    banner.hidden = true;
    showToast('Borrador recuperado — revísalo y guarda la entrega');
  };
  $('#numDraftDiscard').onclick = async () => {
    if (!confirm('¿Descartar el borrador? Esto sí no se puede deshacer.')) return;
    await clearDraft();
    banner.hidden = true;
  };
}
