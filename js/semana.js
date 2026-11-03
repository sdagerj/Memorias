// «Esta semana»: lo que Claude preparó para la columna y espera su aprobación.
//
// Claude deja la semana en el repositorio sdagerj/el-numero, en
// operacion/semana/actual.json (el formato está en operacion/semana/LEEME.md).
// Aquí se lee ese archivo, ella decide pieza por pieza (aprobar, pedir un
// cambio o marcar como hecha una tarea suya) y las decisiones se escriben de
// vuelta en el mismo archivo. Claude las lee y publica lo aprobado en su día.
//
// Las decisiones se guardan primero en este dispositivo y se mandan todas de
// una vez: así un clic no dispara una escritura en GitHub (ni una
// reconstrucción de la web), y nada se pierde si se va el internet.

import { getSetting, setSetting } from './db.js';
import { getGithubToken, describeTokenProblem, gh, b64, REPO } from './publicar.js';

export const ARCHIVO_SEMANA = 'operacion/semana/actual.json';
const RAMA = 'main';
const CLAVE_DECISIONES = 'semanaDecisiones';

export const CANALES = {
  youtube: { emoji: '▶️', nombre: 'YouTube' },
  instagram: { emoji: '📸', nombre: 'Instagram' },
  linkedin: { emoji: '💼', nombre: 'LinkedIn' },
  spotify: { emoji: '🎧', nombre: 'Spotify' },
  mailerlite: { emoji: '✉️', nombre: 'Correo' },
  whatsapp: { emoji: '💬', nombre: 'WhatsApp' },
  prensa: { emoji: '📰', nombre: 'Prensa' },
  web: { emoji: '🌐', nombre: 'Web' },
  comentarios: { emoji: '🗨️', nombre: 'Comentarios' },
  otro: { emoji: '📌', nombre: 'Tarea' },
};

const ESTADOS = ['pendiente', 'aprobado', 'cambiar', 'hecho', 'publicado'];

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function deB64(texto) {
  const bin = atob(String(texto || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ── El archivo de la semana ───────────────────────────────────────────────────

// Lo que viene de GitHub lo escribió Claude: se revisa antes de pintarlo, para
// que un campo que falte no rompa la pantalla entera.
export function validarSemana(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('El archivo de la semana no tiene el formato esperado.');
  const piezas = Array.isArray(obj.piezas) ? obj.piezas : [];
  const vistos = new Set();
  const limpias = [];
  for (const p of piezas) {
    if (!p || typeof p !== 'object' || !p.id || vistos.has(String(p.id))) continue;
    vistos.add(String(p.id));
    limpias.push({
      ...p,
      id: String(p.id),
      canal: CANALES[p.canal] ? p.canal : 'otro',
      quien: p.quien === 'tu' ? 'tu' : 'claude',
      estado: ESTADOS.includes(p.estado) ? p.estado : 'pendiente',
    });
  }
  return { ...obj, piezas: limpias };
}

// Devuelve { semana, sha } o { semana: null } si Claude aún no la ha subido.
export async function leerSemana(token) {
  const problema = describeTokenProblem(token);
  if (problema) throw new Error(problema + ' Ponla en Ajustes → Publicar en la web.');
  const res = await gh(`/repos/${REPO}/contents/${ARCHIVO_SEMANA}?ref=${RAMA}`, token);
  if (res.status === 404) return { semana: null, sha: null };
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} al buscar la semana.`);
  const json = await res.json();
  let datos;
  try { datos = JSON.parse(deB64(json.content)); }
  catch { throw new Error('El archivo de la semana está dañado. Pídele a Claude que lo vuelva a subir.'); }
  return { semana: validarSemana(datos), sha: json.sha || null };
}

// Las decisiones van por id de pieza: { estado, nota, decididoEl }. Una pieza
// que ya está publicada no se toca: lo publicado no se rehace desde aquí.
export function aplicarDecisiones(semana, decisiones) {
  const piezas = semana.piezas.map((p) => {
    const d = decisiones[p.id];
    if (!d || p.estado === 'publicado') return p;
    const nueva = { ...p, estado: d.estado, decididoEl: d.decididoEl };
    if (d.estado === 'cambiar') nueva.nota = d.nota || '';
    else delete nueva.nota;
    return nueva;
  });
  return { ...semana, piezas };
}

// Escribe las decisiones sobre la versión más reciente del archivo: si Claude
// lo actualizó mientras ella decidía, no se pierde lo que Claude hizo.
export async function enviarDecisiones(decisiones, token) {
  const ids = Object.keys(decisiones);
  if (!ids.length) throw new Error('No hay decisiones nuevas para enviar.');
  for (let intento = 0; intento < 2; intento++) {
    const { semana, sha } = await leerSemana(token);
    if (!semana) throw new Error('La semana ya no está en GitHub. Pídele a Claude que la suba de nuevo.');
    const nueva = aplicarDecisiones(semana, decisiones);
    const aprobadas = ids.filter((id) => decisiones[id].estado === 'aprobado').length;
    const cambios = ids.filter((id) => decisiones[id].estado === 'cambiar').length;
    let res;
    try {
      res = await gh(`/repos/${REPO}/contents/${ARCHIVO_SEMANA}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          // [skip ci]: una aprobación no cambia la web; que no la reconstruya.
          message: `Semana ${semana.semana || ''}: ${aprobadas} aprobadas, ${cambios} con cambios [skip ci]`.replace(/\s+/g, ' '),
          content: b64(JSON.stringify(nueva, null, 2) + '\n'),
          branch: RAMA,
          ...(sha ? { sha } : {}),
        }),
      });
    } catch (e) {
      // 409/422: alguien escribió en medio. Se relee y se intenta una vez más.
      if (intento === 0 && /cambió ese archivo/.test(e.message)) continue;
      throw e;
    }
    if (!res.ok) {
      let detalle = '';
      try { detalle = (await res.json()).message || ''; } catch { /* sin cuerpo */ }
      throw new Error(`GitHub no aceptó las decisiones (${res.status}). ${detalle}`.trim());
    }
    return nueva;
  }
  throw new Error('No se pudieron guardar las decisiones. Inténtalo otra vez.');
}

// Las portadas viven en el repositorio: se piden con la llave y se muestran
// como imagen local, sirva igual si el repositorio es público o privado.
async function cargarPortada(ruta, token, img) {
  try {
    const res = await gh(`/repos/${REPO}/contents/${ruta.replace(/^\/+/, '')}?ref=${RAMA}`, token, {
      headers: { Accept: 'application/vnd.github.raw' },
    });
    if (!res.ok) { img.remove(); return; }
    img.src = URL.createObjectURL(await res.blob());
  } catch { img.remove(); }
}

// ── La pantalla ───────────────────────────────────────────────────────────────

let semanaActual = null;
let decisiones = {};

function fechaLarga(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'Sin día';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function estadoVisible(p) {
  return decisiones[p.id]?.estado || p.estado;
}

export function contarPendientes(semana, dec = {}) {
  return (semana?.piezas || []).filter((p) => (dec[p.id]?.estado || p.estado) === 'pendiente').length;
}

function etiquetaEstado(p) {
  const e = estadoVisible(p);
  const nuevo = decisiones[p.id] ? ' · sin enviar' : '';
  if (e === 'publicado') return `<span class="semana-estado ok">✅ Publicado</span>`;
  if (e === 'aprobado') return `<span class="semana-estado ok">👍 Aprobado${nuevo}</span>`;
  if (e === 'hecho') return `<span class="semana-estado ok">✔︎ Hecho${nuevo}</span>`;
  if (e === 'cambiar') return `<span class="semana-estado cambio">✏️ Pediste un cambio${nuevo}</span>`;
  return `<span class="semana-estado">Pendiente</span>`;
}

function tarjeta(p) {
  const c = CANALES[p.canal];
  const e = estadoVisible(p);
  const quien = p.quien === 'tu' ? 'Lo haces tú' : 'Lo publica Claude';
  const acciones = [];
  if (e !== 'publicado') {
    if (p.quien === 'claude') {
      acciones.push(`<button type="button" class="btn num-btn-primary" data-accion="aprobado" data-id="${esc(p.id)}">Aprobar</button>`);
      acciones.push(`<button type="button" class="btn ghost" data-accion="cambiar" data-id="${esc(p.id)}">Pedir cambio</button>`);
    } else {
      acciones.push(`<button type="button" class="btn num-btn-primary" data-accion="hecho" data-id="${esc(p.id)}">Hecho</button>`);
    }
    if (p.texto) acciones.push(`<button type="button" class="btn ghost" data-accion="copiar" data-id="${esc(p.id)}">Copiar texto</button>`);
    if (decisiones[p.id]) acciones.push(`<button type="button" class="link-btn" data-accion="deshacer" data-id="${esc(p.id)}">Deshacer</button>`);
  }
  const nota = decisiones[p.id]?.nota ?? p.nota ?? '';
  return `
    <article class="card semana-pieza semana-${esc(e)}" data-pieza="${esc(p.id)}">
      <header class="semana-pieza-head">
        <span class="semana-canal">${c.emoji} ${esc(c.nombre)} · ${esc(p.tipo || '')}</span>
        <span class="semana-quien ${p.quien}">${quien}</span>
      </header>
      ${p.titulo ? `<h4 class="semana-titulo">${esc(p.titulo)}</h4>` : ''}
      ${p.portada ? `<img class="semana-portada" alt="Portada de ${esc(p.tipo || 'la pieza')}" data-portada="${esc(p.portada)}" />` : ''}
      ${p.texto ? `<details class="semana-texto"><summary>Ver el texto</summary><p>${esc(p.texto)}</p></details>` : ''}
      ${p.enlace ? `<p class="small"><a href="${esc(p.enlace)}" target="_blank" rel="noopener">Ver el archivo ▸</a></p>` : ''}
      ${e === 'publicado' && p.url ? `<p class="small"><a href="${esc(p.url)}" target="_blank" rel="noopener">Abrir lo publicado ▸</a></p>` : ''}
      <p class="semana-linea">${etiquetaEstado(p)}</p>
      <div class="semana-nota" ${e === 'cambiar' && p.estado !== 'publicado' ? '' : 'hidden'}>
        <label class="field"><span>¿Qué cambio quieres?</span>
          <textarea rows="2" data-nota="${esc(p.id)}" placeholder="Ej: el título más corto, sin la palabra «dinero»…">${esc(nota)}</textarea>
        </label>
      </div>
      <div class="settings-row semana-acciones">${acciones.join('')}</div>
    </article>`;
}

function pintar(token) {
  const lista = $('#semanaLista');
  const s = semanaActual;
  $('#semanaTitulo').textContent = s.columna ? `Esta semana · ${s.columna}` : 'Esta semana';
  const resumen = $('#semanaResumen');
  resumen.hidden = !s.resumen;
  resumen.innerHTML = s.resumen
    ? `<h3>${esc(s.resumenTitulo || 'Lo que dejó Claude')}</h3><p>${esc(s.resumen)}</p>` : '';

  const grupos = new Map();
  const ordenadas = [...s.piezas].sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')));
  for (const p of ordenadas) {
    const k = p.fecha || '';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  lista.innerHTML = [...grupos.entries()].map(([fecha, piezas]) =>
    `<h3 class="semana-dia">${esc(fechaLarga(fecha))}</h3>${piezas.map(tarjeta).join('')}`).join('');
  lista.querySelectorAll('img[data-portada]').forEach((img) => cargarPortada(img.dataset.portada, token, img));

  const n = Object.keys(decisiones).length;
  const enviar = $('#semanaEnviar');
  enviar.hidden = n === 0;
  enviar.textContent = n === 1 ? 'Enviar mi decisión a Claude' : `Enviar mis ${n} decisiones a Claude`;
  const pend = contarPendientes(s, decisiones);
  $('#semanaEstado').textContent = pend
    ? `Te faltan ${pend} por revisar.`
    : 'Todo revisado. Claude publica cada pieza aprobada en su día.';
}

async function guardarLocal() {
  await setSetting(CLAVE_DECISIONES, { semana: semanaActual?.semana || '', decisiones });
}

async function cargar() {
  const estado = $('#semanaEstado');
  $('#semanaLista').innerHTML = '';
  $('#semanaResumen').hidden = true;
  $('#semanaEnviar').hidden = true;
  estado.textContent = 'Buscando lo que dejó Claude…';
  try {
    const token = await getGithubToken();
    const { semana } = await leerSemana(token);
    if (!semana) {
      semanaActual = null;
      $('#semanaTitulo').textContent = 'Esta semana';
      estado.textContent = 'Claude aún no ha subido nada para esta semana. Aparece aquí cuando esté listo el paquete.';
      return;
    }
    semanaActual = semana;
    const guardadas = await getSetting(CLAVE_DECISIONES, null);
    // Decisiones de otra semana no se arrastran: serían sobre otras piezas.
    decisiones = guardadas && guardadas.semana === (semana.semana || '') ? (guardadas.decisiones || {}) : {};
    pintar(token);
  } catch (e) {
    semanaActual = null;
    estado.textContent = e.message;
  }
}

async function alClic(ev) {
  const b = ev.target.closest('button[data-accion]');
  if (!b || !semanaActual) return;
  const id = b.dataset.id;
  const p = semanaActual.piezas.find((x) => x.id === id);
  if (!p) return;
  const accion = b.dataset.accion;
  if (accion === 'copiar') {
    try { await navigator.clipboard.writeText(p.texto || ''); b.textContent = 'Copiado ✓'; }
    catch { b.textContent = 'No se pudo copiar: ábrelo en «Ver el texto»'; }
    return;
  }
  if (accion === 'deshacer') delete decisiones[id];
  else if (accion === 'cambiar') {
    decisiones[id] = { estado: 'cambiar', nota: decisiones[id]?.nota ?? p.nota ?? '', decididoEl: new Date().toISOString() };
  } else {
    decisiones[id] = { estado: accion, decididoEl: new Date().toISOString() };
  }
  await guardarLocal();
  pintar(await getGithubToken());
  if (accion === 'cambiar') document.querySelector(`textarea[data-nota="${CSS.escape(id)}"]`)?.focus();
}

async function alEscribirNota(ev) {
  const t = ev.target.closest('textarea[data-nota]');
  if (!t) return;
  const id = t.dataset.nota;
  if (!decisiones[id]) decisiones[id] = { estado: 'cambiar', decididoEl: new Date().toISOString() };
  decisiones[id].nota = t.value;
  await guardarLocal();
}

async function alEnviar() {
  const boton = $('#semanaEnviar');
  const sinNota = Object.entries(decisiones).filter(([, d]) => d.estado === 'cambiar' && !String(d.nota || '').trim());
  if (sinNota.length) {
    $('#semanaEstado').textContent = 'Escribe qué cambio quieres en cada pieza marcada con «Pedir cambio».';
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  try {
    const token = await getGithubToken();
    semanaActual = await enviarDecisiones(decisiones, token);
    decisiones = {};
    await guardarLocal();
    pintar(token);
    $('#semanaEstado').textContent = 'Listo: Claude ya tiene tus decisiones. ' + $('#semanaEstado').textContent;
  } catch (e) {
    $('#semanaEstado').textContent = e.message + ' Tus decisiones siguen guardadas aquí.';
    boton.textContent = 'Reintentar el envío';
  } finally {
    boton.disabled = false;
  }
}

export function abrirSemana() {
  $('#numerosScreen').hidden = true;
  $('#numeroEditor').hidden = true;
  $('#semanaScreen').hidden = false;
  return cargar();
}

export function initSemana() {
  $('#semanaBtn')?.addEventListener('click', abrirSemana);
  $('#semanaVolver')?.addEventListener('click', () => {
    $('#semanaScreen').hidden = true;
    $('#numerosScreen').hidden = false;
  });
  $('#semanaRecargar')?.addEventListener('click', cargar);
  $('#semanaLista')?.addEventListener('click', alClic);
  $('#semanaLista')?.addEventListener('input', alEscribirNota);
  $('#semanaEnviar')?.addEventListener('click', alEnviar);
}
