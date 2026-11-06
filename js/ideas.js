// Pestaña «Ideas»: generar ideas para la próxima columna cuando ella quiera
// (no solo el sábado), guardar las que le gustan y pedir la investigación de
// la elegida para arrancar a escribir.
//
// Antes esto vivía dentro del editor de una entrega nueva: había que crear una
// entrega vacía para poder idear. Ahora tiene su propia pestaña.

import * as db from './db.js';
import { fetchHeadlines, DEFAULT_SOURCES } from './rss.js';
import { callClaude, getApiKey, hasApiKey, describeApiKeyProblem } from './claude-api.js';
import { buildIdeaPrompt } from './numero.js';

const $ = (sel) => document.querySelector(sel);
const CLAVE = 'ideasGuardadas';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function aviso(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2600);
}

// El error queda a la vista (no solo un aviso que se va) y la caja se limpia,
// para que no quede el texto de un intento anterior como si fuera la respuesta.
function mostrarError(id, err) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  const p = document.createElement('p');
  p.innerHTML = '<strong>⚠️ Claude no respondió.</strong> ';
  p.append(errorClaude(err));
  el.append(p);
  el.hidden = false;
}

function errorClaude(err) {
  const m = err && err.message;
  if (m === 'NO_KEY') return 'No hay API key configurada. Ve a Ajustes → Claude API.';
  if (m === 'KEY_INVALID') return 'La API key no es válida. Ve a Ajustes → Claude API y verifica tu clave.';
  if (m === 'RATE_LIMIT') return 'Límite de solicitudes alcanzado. Espera un momento e intenta de nuevo.';
  return 'Error al conectar con Claude: ' + (m || 'desconocido');
}

// La investigación sigue las mismas reglas de verificación de El Número:
// solo fuente primaria, cada cifra con su documento y año, y lo que no se
// pueda verificar se marca, no se inventa.
export function buildInvestigacionPrompt(idea) {
  const hoy = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Eres la investigadora de El Número («un número · una historia»), la columna semanal de Stephanie Dager Jassir, economista de Barranquilla. Escribe, desde su mirada de mujer, para personas de habla hispana de 30–65 años que ya generan ingresos y están aprendiendo a decidir sobre capital. Nada se anuncia «para mujeres»: lo que une a quien la lee es el momento, no el género.

LA IDEA QUE ELIGIÓ:
${String(idea || '').trim()}

FECHA DE HOY: ${hoy}

ARMA LA FICHA DE INVESTIGACIÓN para que ella arranque a escribir:

1. EL NÚMERO: qué mide exactamente, valor, unidad, año y serie.
2. FUENTE PRIMARIA de cada cifra: institución, documento exacto, año y dónde verificarlo (enlace si lo sabes). Solo fuente primaria: DANE, Banco de la República, Banco Mundial, ONU/World Population Prospects, DIAN, Superfinanciera, registros legislativos, relatorías de la Corte; arte: MutualArt, Artprice. No valen medios, consultoras ni «elaboración propia» de terceros.
3. ESTADO DE CADA CIFRA: «verificada» (con su fuente) o «POR VERIFICAR — buscar en [fuente]». Nunca inventes una cifra. Si no estás segura, márcala.
4. COMPARABILIDAD: mismo denominador, umbral de edad, unidad, año y serie. Si algo no es comparable (tasa específica vs. global, 60 vs. 65 años, DANE vs. ONU), dilo.
5. CONTEXTO: 3 a 5 datos de fuente primaria que fortalezcan el argumento, cada uno con su fuente.
6. LA MUJER O LA DECISIÓN HUMANA detrás del número, y 3 preguntas para sacarle a ella la memoria (qué vivió, qué decidió, qué haría distinto).
7. ARCO SUGERIDO: mundo → yo → ellas, una línea cada uno, y una pregunta de cierre abierta de verdad.
8. RIESGOS: cifras débiles, comparaciones que no cuadran o ángulos ya usados.
9. PRUEBA ÁCIDA (sé dura, sin suavizar): ¿le pasa a quien la lee o a otros? (si es a otros, ¿en qué ángulo le toca a ella: presta, contrata, invierte, paga, vota?) · ¿hay una frase que ya oyó o vivió para abrir el video en 2 segundos? · ¿lo mandaría a su grupo de WhatsApp? · ¿el número sorprende solo, sin contexto? · ¿es distinto de los últimos temas? Veredicto en una línea: VA, VA CON OTRO ÁNGULO (di cuál) o NO VA. Referencia: lo personal y cercano funcionó (péptidos y «¿cómo estás de flaca?», pensiones, restaurantes, el terremoto); el gota a gota, que le pasa a otros, no.

REGLAS: español, directo, sin menús largos. No nombres productos de inversión, rentabilidades ni tickers. No asumas que la maternidad, el matrimonio o el patrimonio fueron una elección. No escribas la columna: es la ficha para que ella la escriba con su voz.`;
}

// Parte la respuesta de Claude en ideas sueltas, para guardar solo las que le
// gustan. El prompt pide «===IDEA===» antes de cada una; si la respuesta vino
// de claude.ai sin esas marcas, se parte por los encabezados numerados
// («1.», «Idea 2», «## 3)»). Si no se puede, queda como una sola idea.
export function separarIdeas(texto) {
  const t = String(texto || '').replace(/\r/g, '').trim();
  if (!t) return { ideas: [], preguntas: '' };
  let cuerpo = t;
  let preguntas = '';
  const mp = cuerpo.search(/^\s*=+\s*PREGUNTAS\s*=+\s*$/im);
  if (mp >= 0) {
    preguntas = cuerpo.slice(mp).replace(/^\s*=+\s*PREGUNTAS\s*=+\s*$/im, '').trim();
    cuerpo = cuerpo.slice(0, mp);
  }
  let partes;
  if (/^\s*=+\s*IDEA\b[^\n]*$/im.test(cuerpo)) {
    partes = cuerpo.split(/^\s*=+\s*IDEA\b[^\n]*$/im).slice(1);
  } else {
    const enc = /^[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[ \t]*(?:IDEA[ \t]*\d+|\d[.)])(?=[ \t:*·—-])/gim;
    const pos = [];
    let m;
    while ((m = enc.exec(cuerpo))) pos.push(m.index);
    if (pos.length >= 2) {
      partes = pos.map((p, i) => cuerpo.slice(p, pos[i + 1]));
      // Las preguntas del final, si no venían marcadas, no son una idea.
      const ult = partes[partes.length - 1];
      const mq = ult.search(/^[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[ \t]*(?:\d[ \t]*)?PREGUNTAS\b/im);
      if (mq > 0 && !preguntas) { preguntas = ult.slice(mq).trim(); partes[partes.length - 1] = ult.slice(0, mq); }
    } else {
      partes = [cuerpo];
    }
  }
  const ideas = partes.map((x) => x.trim()).filter(Boolean);
  return { ideas, preguntas };
}

export function tituloIdea(texto) {
  const l = String(texto || '').split('\n').find((x) => x.trim()) || 'Idea';
  return l.replace(/^[\s#*]+|[\s*]+$/g, '').slice(0, 140);
}

export async function leerIdeas() {
  try { return (await db.getSetting(CLAVE, [])) || []; } catch { return []; }
}

export async function guardarIdea(texto, notas = '') {
  const t = String(texto || '').trim();
  if (!t) return null;
  const lista = await leerIdeas();
  const idea = {
    id: 'idea-' + Date.now().toString(36),
    fecha: new Date().toISOString().slice(0, 10),
    notas: String(notas || '').trim(),
    texto: t,
    investigacion: '',
  };
  lista.unshift(idea);
  await db.setSetting(CLAVE, lista);
  return idea;
}

async function actualizarIdea(id, cambios) {
  const lista = await leerIdeas();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return;
  lista[i] = { ...lista[i], ...cambios };
  await db.setSetting(CLAVE, lista);
}

async function borrarIdea(id) {
  const lista = (await leerIdeas()).filter((x) => x.id !== id);
  await db.setSetting(CLAVE, lista);
}

let ideaEnInvestigacion = null; // la idea guardada de la que salió la investigación

async function pintarLista() {
  const lista = await leerIdeas();
  const cont = $('#ideasLista');
  $('#ideasVacia').hidden = lista.length > 0;
  cont.innerHTML = lista.map((x) => `
    <article class="idea-guardada" data-idea="${esc(x.id)}">
      <p class="small muted">${esc(x.fecha)}${x.notas ? ' · ' + esc(x.notas.slice(0, 80)) : ''}${x.investigacion ? ' · 🔎 con investigación' : ''}</p>
      <details><summary>${esc(tituloIdea(x.texto))}</summary><p class="idea-texto">${esc(x.texto)}</p>
      ${x.investigacion ? `<p class="small"><strong>Investigación:</strong></p><p class="idea-texto">${esc(x.investigacion)}</p>` : ''}</details>
      <div class="settings-row">
        <button type="button" class="btn ghost" data-accion="investigar" data-id="${esc(x.id)}">🔎 Investigar esta</button>
        <button type="button" class="link-btn danger" data-accion="borrar" data-id="${esc(x.id)}">Borrar</button>
      </div>
    </article>`).join('');
}

async function generar() {
  const btn = $('#numIdeaBtn');
  btn.disabled = true;
  btn.textContent = 'Buscando noticias…';
  let headlines = [];
  try {
    const saved = await db.getRssSources();
    headlines = await fetchHeadlines(saved || DEFAULT_SOURCES);
  } catch { /* sin noticias: el prompt lo dice */ }
  let publicados = [];
  try { publicados = (await db.getAllNumbers()).slice(0, 15); } catch { /* sin archivo */ }
  let recuerdos = [];
  const usarRecuerdos = $('#numIdeaRecuerdos')?.checked ?? true;
  if (usarRecuerdos) { try { recuerdos = (await db.getAllEntries()).slice(0, 8); } catch { /* sin diario */ } }
  try { localStorage.setItem('ideasUsarRecuerdos', usarRecuerdos ? '1' : '0'); } catch { /* modo privado */ }
  const notas = $('#numIdeaNotas')?.value || '';
  const prompt = buildIdeaPrompt(headlines, publicados, recuerdos, notas);
  const caja = $('#numIdeaPaste');
  const key = await getApiKey();
  $('#numIdeaError').hidden = true;
  if (hasApiKey(key)) {
    btn.textContent = 'Consultando a Claude…';
    $('#numIdeaHint').hidden = true;
    caja.value = '';
    pintarNuevas();
    try {
      caja.value = await callClaude(prompt);
      caja.readOnly = false;
      $('#numIdeaHint').hidden = true;
      pintarNuevas();
      aviso('Ideas listas ✨');
    } catch (err) {
      mostrarError('numIdeaError', err);
      aviso(errorClaude(err));
    }
  } else {
    if (key) {
      aviso('No se pudo usar tu API key. ' + describeApiKeyProblem(key));
      mostrarError('numIdeaError', new Error('La clave guardada no sirve: ' + describeApiKeyProblem(key)));
    }
    // Sin llave el prompt queda a la vista para copiarlo: en Safari el
    // portapapeles falla después de esperar los titulares.
    caja.value = prompt;
    caja.readOnly = false;
    $('#numIdeaHint').hidden = false;
    pintarNuevas();
    try {
      await navigator.clipboard.writeText(prompt);
      aviso(`Copiado ✨ — ${headlines.length} titulares y ${recuerdos.length} recuerdos incluidos`);
    } catch {
      aviso('Copia el texto de la caja y pégalo en claude.ai');
    }
  }
  btn.disabled = false;
  btn.textContent = '💡 Generar ideas';
}

// Las ideas recién generadas, cada una con su tarjeta: se guarda o se
// investiga una sola, no el bloque entero.
let nuevas = [];

function pintarNuevas() {
  const caja = $('#numIdeaPaste');
  const texto = caja.value;
  const cont = $('#ideasNuevas');
  // Si la caja tiene el prompt (no la respuesta), no hay ideas que mostrar.
  if (!texto.trim() || texto.startsWith('Eres mi editora de ideas')) {
    nuevas = [];
    cont.innerHTML = '';
    $('#ideasNuevasHint').hidden = true;
    return;
  }
  const { ideas, preguntas } = separarIdeas(texto);
  nuevas = ideas.map((t) => ({ texto: t, guardadaId: (nuevas.find((n) => n.texto === t) || {}).guardadaId || null }));
  cont.innerHTML = nuevas.map((x, i) => `
    <article class="idea-nueva${x.guardadaId ? ' guardada' : ''}" data-i="${i}">
      <details><summary>${esc(tituloIdea(x.texto))}</summary><p class="idea-texto">${esc(x.texto)}</p></details>
      <div class="settings-row">
        <button type="button" class="btn" data-nueva="guardar" data-i="${i}" ${x.guardadaId ? 'disabled' : ''}>${x.guardadaId ? '✓ Guardada' : '⭐ Guardar esta'}</button>
        <button type="button" class="btn ghost" data-nueva="investigar" data-i="${i}">🔎 Investigar esta</button>
      </div>
    </article>`).join('') + (preguntas ? `
    <details class="idea-preguntas"><summary class="small">Las preguntas para sacarte la memoria</summary><p class="idea-texto">${esc(preguntas)}</p></details>` : '');
  $('#ideasNuevasHint').hidden = nuevas.length === 0;
}

async function guardarNueva(i) {
  const x = nuevas[i];
  if (!x) return null;
  if (!x.guardadaId) {
    const idea = await guardarIdea(x.texto, $('#numIdeaNotas')?.value || '');
    x.guardadaId = idea && idea.id;
    await pintarLista();
    pintarNuevas();
  }
  return x.guardadaId;
}

async function alClicNuevas(ev) {
  const b = ev.target.closest('button[data-nueva]');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (b.dataset.nueva === 'guardar') {
    await guardarNueva(i);
    aviso('Idea guardada ⭐');
    return;
  }
  // Investigar una idea la guarda también: si la investigas, te gusta.
  const id = await guardarNueva(i);
  ideaEnInvestigacion = id;
  $('#ideaElegida').value = nuevas[i].texto.slice(0, 1500);
  $('#ideaInvestigacion').value = '';
  $('#ideaElegida').scrollIntoView({ behavior: 'smooth', block: 'center' });
  aviso('Idea guardada. Toca «Investigar» para la ficha 🔎');
}

// Desde el aviso de clave faltante se va directo a Ajustes.
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-ir-ajustes]')) return;
  document.querySelector('.tab[data-view="settings"]')?.click();
  setTimeout(() => document.getElementById('claudeApiKeyInput')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
});

async function investigar() {
  const idea = $('#ideaElegida').value.trim();
  if (!idea) { aviso('Escribe o elige la idea que quieres investigar'); return; }
  const btn = $('#ideaInvestigarBtn');
  const caja = $('#ideaInvestigacion');
  const prompt = buildInvestigacionPrompt(idea);
  const key = await getApiKey();
  $('#ideaInvestigacionError').hidden = true;
  if (hasApiKey(key)) {
    btn.disabled = true;
    btn.textContent = 'Investigando…';
    $('#ideaInvestigacionHint').hidden = true;
    caja.value = '';
    try {
      const r = await callClaude(prompt);
      caja.value = r;
      caja.readOnly = false;
      $('#ideaInvestigacionHint').hidden = true;
      if (ideaEnInvestigacion) { await actualizarIdea(ideaEnInvestigacion, { investigacion: r }); await pintarLista(); }
      aviso('Investigación lista 🔎');
    } catch (err) {
      mostrarError('ideaInvestigacionError', err);
      aviso(errorClaude(err));
    }
    btn.disabled = false;
    btn.textContent = '🔎 Investigar';
  } else {
    caja.value = prompt;
    caja.readOnly = false;
    $('#ideaInvestigacionHint').hidden = false;
    try { await navigator.clipboard.writeText(prompt); aviso('Copiado: pégalo en el chat de Claude'); }
    catch { aviso('Copia el texto de la caja y pégalo en el chat de Claude'); }
  }
}

async function alClicLista(ev) {
  const b = ev.target.closest('button[data-accion]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.accion === 'borrar') {
    await borrarIdea(id);
    await pintarLista();
    return;
  }
  const x = (await leerIdeas()).find((i) => i.id === id);
  if (!x) return;
  ideaEnInvestigacion = id;
  $('#ideaElegida').value = x.texto.slice(0, 1500);
  $('#ideaInvestigacion').value = x.investigacion || '';
  $('#ideaElegida').scrollIntoView({ behavior: 'smooth', block: 'center' });
  aviso('Deja solo la idea que te gusta y toca «Investigar»');
}

export async function initIdeas() {
  try {
    const guardado = localStorage.getItem('ideasUsarRecuerdos');
    const c = $('#numIdeaRecuerdos');
    if (c && guardado !== null) c.checked = guardado === '1';
  } catch { /* modo privado */ }
  $('#numIdeaBtn').addEventListener('click', generar);
  $('#ideasNuevas').addEventListener('click', alClicNuevas);
  // Si pega la respuesta de claude.ai, las tarjetas aparecen solas.
  $('#numIdeaPaste').addEventListener('input', pintarNuevas);
  $('#ideaInvestigarBtn').addEventListener('click', investigar);
  $('#ideaElegida').addEventListener('input', () => { if (!$('#ideaElegida').value.trim()) ideaEnInvestigacion = null; });
  $('#ideasLista').addEventListener('click', alClicLista);
  $('#ideaCopiarBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#ideaInvestigacion').value); aviso('Copiado'); }
    catch { aviso('Selecciona el texto y cópialo a mano'); }
  });
  $('#ideaCompartirBtn').addEventListener('click', async () => {
    const text = $('#ideaInvestigacion').value;
    if (!text.trim()) { aviso('Todavía no hay investigación'); return; }
    if (navigator.share) {
      try { await navigator.share({ title: 'Investigación · El Número', text }); } catch { /* cancelado */ }
    } else {
      try { await navigator.clipboard.writeText(text); aviso('Copiado para compartir'); } catch { aviso('Copia el texto a mano'); }
    }
  });
  await pintarLista();
}
