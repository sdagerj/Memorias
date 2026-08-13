// Módulo "El Número": editor, archivo y asistente editorial con Claude.
import * as db from './db.js';
import { fetchHeadlines, DEFAULT_SOURCES } from './rss.js';
import { callClaude, getApiKey, hasApiKey, describeApiKeyProblem } from './claude-api.js';

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
}

function readEditor() {
  return {
    ...currentNumero,
    numero: $('#numNumero').value.trim(),
    gancho: $('#numGancho').value.trim(),
    editorial: $('#numEditorial').value.trim(),
    destaque: $('#numDestaque')?.value.trim() || '',
  };
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

function buildIdeaPrompt(headlines) {
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
  lines.push(`Propón 3 números candidatos para esta semana (${today}), sacados de estas cinco canteras: (1) mercados y economía, (2) arte y cultura, (3) mujeres y liderazgo, (4) vida y observación, (5) efemérides.

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

function buildCorrectionPrompt(data) {
  return `${SYSTEM_PROMPT}

---

PROMPT: CORRECCIÓN DEL TEXTO

Te doy el borrador del editorial de esta semana. Corrígelo cuidando:
- La voz: cercana, honesta, con criterio; directa, sin relleno.
- El arco: del mundo → a mí → a ellas.
- Claridad y ritmo.
- Que no sea genérico ni caiga en cliché.

Sugiere cambios concretos; no reescribas todo salvo que te lo pida. Devuelve el texto corregido y, al final, una nota corta (3–4 líneas) de qué mejoraste y por qué.

---

NÚMERO: #${data.numero || '?'}
TÍTULO: ${data.gancho || ''}

EDITORIAL:
${data.editorial || '(vacío)'}`;
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
  ['numIdeaPaste', 'numCorreccionPaste', 'numMontajePaste', 'numPodcastPaste'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.value = '';
  });
  ['numIdeaPanel', 'numCorreccionPanel', 'numMontajePanel', 'numPodcastPanel'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.hidden = true;
  });
}

function openPanel(panelId) {
  ['numIdeaPanel', 'numCorreccionPanel', 'numMontajePanel', 'numPodcastPanel'].forEach((id) => {
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
${destaqueHtml}`;

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
  ['numNumero', 'numGancho', 'numEditorial', 'numDestaque'].forEach((id) =>
    $(`#${id}`)?.addEventListener('input', scheduleDraftSave));
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
    const prompt = buildIdeaPrompt(headlines);
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
      (result) => { $('#numCorreccionPaste').value = result; showToast('Corrección lista ✨'); },
      'Copiado ✨ Pégalo en claude.ai',
      'numCorreccionPaste', 'numCorreccionHint'
    );
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
