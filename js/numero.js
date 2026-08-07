// Módulo "El Número": editor, archivo y asistente editorial con Claude.
import * as db from './db.js';
import { fetchHeadlines, DEFAULT_SOURCES } from './rss.js';
import { callClaude, getApiKey, hasApiKey } from './claude-api.js';

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
  const lines = [SYSTEM_PROMPT, ''];
  lines.push('---');
  lines.push('');
  lines.push('TITULARES DE LA SEMANA (para contexto de actualidad):');
  lines.push('');
  if (headlines.length) {
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
    lines.push('(No se pudieron cargar titulares. Usa tu conocimiento actualizado.)');
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(`Propón 3 números candidatos para esta semana, sacados de estas cinco canteras: (1) mercados y economía, (2) arte y cultura, (3) mujeres y liderazgo, (4) vida y observación, (5) efemérides. Usa los titulares anteriores y la actualidad de la semana.

Para cada candidato da: la cifra, la cantera, el gancho de actualidad (real y verificable), y el ángulo propio (cómo lo leería Stefy con su lente).

Luego córrelo por el TEST y marca sí/no en cada una:
1. ¿Tiene gancho de actualidad?
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
    document.getElementById('printNumeroVal').textContent = data.numero || '';
    document.getElementById('printTitulo').textContent = data.gancho || '';
    document.getElementById('printEditorial').textContent = data.editorial || '';
    const destaqueEl = document.getElementById('printDestaque');
    if (data.destaque) {
      document.getElementById('printDestaqueText').textContent = data.destaque;
      destaqueEl.style.display = '';
    } else {
      destaqueEl.style.display = 'none';
    }
    document.body.classList.add('printing-numero');
    window.print();
    document.body.classList.remove('printing-numero');
  });

  $('#saveNumeroBtn').addEventListener('click', async () => {
    const data = readEditor();
    if (!data.numero) { showToast('Escribe el número primero'); return; }
    currentNumero = { ...currentNumero, ...data };
    await db.saveNumber(currentNumero);
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

  // ── Botones Claude ──

  async function runWithClaude(btn, originalLabel, prompt, onResult, fallbackMsg) {
    const key = await getApiKey();
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
      await copyToClipboard(prompt, fallbackMsg);
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
        if (err.message === 'KEY_INVALID') showToast('API key inválida. Revísala en Ajustes.');
        else showToast('Error: ' + err.message);
      }
    } else {
      await copyToClipboard(prompt, `Copiado ✨ — ${headlines.length} titulares incluidos. Pégalo en claude.ai`);
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
      'Copiado ✨ Pégalo en claude.ai'
    );
  });

  $('#numAplicarCorreccion').addEventListener('click', () => {
    const v = $('#numCorreccionPaste').value.trim();
    if (!v) { showToast('Primero obtén la corrección de Claude'); return; }
    // Quitar todo desde "Nota editorial", "---", "Ajustes", "Cambios" en adelante
    const cutPatterns = /^(nota editorial|ajustes|cambios realizados|comentarios|---|\*\*nota|\*\*ajustes|\*\*cambios)/i;
    const lines = v.split('\n');
    const cutIndex = lines.findIndex(l => cutPatterns.test(l.trim()));
    const cleanLines = cutIndex === -1 ? lines : lines.slice(0, cutIndex);
    // Quitar líneas que sean solo placeholders
    const placeholderPattern = /^(aquí va|aqui va|\[texto|texto corregido)/i;
    const editorial = cleanLines.filter(l => !placeholderPattern.test(l.trim())).join('\n').trim();
    $('#numEditorial').value = editorial;
    if (currentNumero) currentNumero.editorial = editorial;
    $('#numEditorial').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#numEditorial').focus();
    showToast('Editorial actualizado ✨');
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
      'Copiado ✨ Pégalo en claude.ai'
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
      'Copiado ✨ Pégalo en claude.ai'
    );
  });

  $('#numLimpiarPodcast').addEventListener('click', () => { $('#numPodcastPaste').value = ''; });

  await renderNumerosList();
}
