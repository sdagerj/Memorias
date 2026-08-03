// Lógica principal de la app Memorias.
import * as db from './db.js';
import { getCurrentPosition, reverseGeocode, formatCoords, mapLink } from './geo.js';
import { renderBook, formatLongDate } from './book.js';
import { VoiceDictation, isVoiceSupported } from './voice.js';
import { initEssence } from './essence.js';
import { initNumero, initRssSources } from './numero.js';

// --- Estado del editor en curso ---
let draftPhotos = [];      // [{ name, blob }]
let draftLocation = null;  // { lat, lng, place }
let draftMood = '';
let editingId = null;
let voice = null;
let voiceBaseText = '';    // texto antes de empezar a dictar

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// =================== Navegación ===================
function showView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${name}`).classList.add('active');
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  // El FAB solo tiene sentido en la línea de tiempo; en El Número tiene su propio botón.
  $('#fab').hidden = !['timeline'].includes(name);
  if (name === 'map') renderPlaces();
  if (name === 'book') showBooksScreen();
  if (name === 'essence') essenceReady.then((init) => init());
  if (name === 'numero') numeroReady.then((init) => init());
  window.scrollTo(0, 0);
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

// =================== Línea de tiempo ===================
let allEntries = [];

async function loadEntries() {
  allEntries = await db.getAllEntries();
  renderTimeline();
}

function renderTimeline() {
  const term = ($('#searchInput').value || '').toLowerCase().trim();
  const list = term
    ? allEntries.filter((e) =>
        (e.title || '').toLowerCase().includes(term) ||
        (e.text || '').toLowerCase().includes(term) ||
        (e.location?.place || '').toLowerCase().includes(term))
    : allEntries;

  const container = $('#timeline');
  container.innerHTML = '';
  $('#memCount').textContent = allEntries.length;
  $('#emptyState').style.display = allEntries.length ? 'none' : 'block';

  for (const e of list) {
    const card = document.createElement('article');
    card.className = 'entry-card';
    card.addEventListener('click', () => openEditor(e.id));

    let html = '';
    if (e.photos && e.photos.length) {
      html += '<div class="photos-strip">';
      for (const p of e.photos.slice(0, 6)) {
        const url = URL.createObjectURL(p.blob);
        html += `<img src="${url}" alt="" loading="lazy" />`;
      }
      html += '</div>';
    }
    html += '<div class="entry-body">';
    const metaBits = [];
    if (e.date) metaBits.push(formatLongDate(e.date));
    html += `<div class="entry-meta">${e.mood ? `<span class="mood">${e.mood}</span>` : ''}<span>${metaBits.join(' · ')}</span></div>`;
    html += `<h3>${escapeHTML(e.title || 'Sin título')}</h3>`;
    if (e.text) html += `<p>${escapeHTML(e.text)}</p>`;
    if (e.location) {
      const name = e.location.place || formatCoords(e.location.lat, e.location.lng);
      html += `<div class="entry-loc">📍 ${escapeHTML(name)}</div>`;
    }
    html += '</div>';
    card.innerHTML = html;
    container.appendChild(card);
  }
}

$('#searchInput').addEventListener('input', renderTimeline);

// =================== Editor ===================
function resetDraft() {
  draftPhotos = [];
  draftLocation = null;
  draftMood = '';
  editingId = null;
  voiceBaseText = '';
  $('#entryId').value = '';
  $('#entryTitle').value = '';
  $('#entryText').value = '';
  $('#entryDate').value = new Date().toISOString().slice(0, 10);
  $$('.mood').forEach((m) => m.classList.remove('selected'));
  renderPhotoGrid();
  renderLocationBox();
  $('#deleteEntry').hidden = true;
}

async function openEditor(id = null) {
  resetDraft();
  if (id) {
    const e = await db.getEntry(id);
    if (e) {
      editingId = e.id;
      $('#editorTitle').textContent = 'Editar recuerdo';
      $('#entryId').value = e.id;
      $('#entryTitle').value = e.title || '';
      $('#entryText').value = e.text || '';
      $('#entryDate').value = e.date || new Date().toISOString().slice(0, 10);
      draftPhotos = (e.photos || []).map((p) => ({ ...p }));
      draftLocation = e.location || null;
      draftMood = e.mood || '';
      $$('.mood').forEach((m) => m.classList.toggle('selected', m.dataset.mood === draftMood));
      renderPhotoGrid();
      renderLocationBox();
      $('#deleteEntry').hidden = false;
    }
  } else {
    $('#editorTitle').textContent = 'Nuevo recuerdo';
  }
  $('#editor').hidden = false;
}

function closeEditor() {
  if (voice && voice.recognizing) voice.stop();
  $('#editor').hidden = true;
}

$('#fab').addEventListener('click', () => openEditor());
$('#cancelEntry').addEventListener('click', closeEditor);

$('#saveEntry').addEventListener('click', async () => {
  const title = $('#entryTitle').value.trim();
  const text = $('#entryText').value.trim();
  if (!title && !text && !draftPhotos.length) {
    toast('Escribe algo o agrega una foto primero');
    return;
  }
  const saveBtn = $('#saveEntry');
  saveBtn.disabled = true;
  const wasEditing = !!editingId;
  try {
    const entry = {
      id: editingId || cryptoId(),
      title,
      text,
      date: $('#entryDate').value || new Date().toISOString().slice(0, 10),
      mood: draftMood,
      photos: draftPhotos,
      location: draftLocation,
      createdAt: editingId ? (await db.getEntry(editingId))?.createdAt || Date.now() : Date.now(),
      updatedAt: Date.now(),
    };
    await db.saveEntry(entry);
    closeEditor();
    await loadEntries();
    toast(wasEditing ? 'Recuerdo actualizado' : 'Recuerdo guardado ✨');
  } catch (err) {
    console.error('No se pudo guardar el recuerdo:', err);
    toast('No se pudo guardar. Si tiene muchas fotos, prueba con menos.');
  } finally {
    saveBtn.disabled = false;
  }
});

$('#deleteEntry').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('¿Eliminar este recuerdo? No se puede deshacer.')) return;
  await db.deleteEntry(editingId);
  closeEditor();
  await loadEntries();
  toast('Recuerdo eliminado');
});

// Estado de ánimo
$$('.mood').forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mood;
    draftMood = draftMood === m ? '' : m;
    $$('.mood').forEach((x) => x.classList.toggle('selected', x.dataset.mood === draftMood && draftMood !== ''));
  });
});

// --- Fotos ---
$('#photoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const blob = await downscaleImage(file);
    draftPhotos.push({ name: file.name, blob });
  }
  renderPhotoGrid();
  e.target.value = '';
});

function renderPhotoGrid() {
  const grid = $('#photoGrid');
  grid.innerHTML = '';
  draftPhotos.forEach((p, i) => {
    const url = URL.createObjectURL(p.blob);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${url}" alt="" /><button type="button" class="rm" aria-label="Quitar">×</button>`;
    div.querySelector('.rm').addEventListener('click', () => {
      draftPhotos.splice(i, 1);
      renderPhotoGrid();
    });
    grid.appendChild(div);
  });
}

// Reduce el tamaño de las imágenes para no llenar el almacenamiento.
function downscaleImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// --- Ubicación ---
function renderLocationBox() {
  const text = $('#locationText');
  const clearBtn = $('#clearLocationBtn');
  if (draftLocation) {
    const name = draftLocation.place || formatCoords(draftLocation.lat, draftLocation.lng);
    text.innerHTML = `📍 <a href="${mapLink(draftLocation.lat, draftLocation.lng)}" target="_blank" rel="noopener">${escapeHTML(name)}</a>`;
    text.classList.remove('muted');
    clearBtn.hidden = false;
  } else {
    text.textContent = 'Sin ubicación';
    text.classList.add('muted');
    clearBtn.hidden = true;
  }
}

$('#getLocationBtn').addEventListener('click', async () => {
  const btn = $('#getLocationBtn');
  btn.disabled = true;
  btn.textContent = 'Buscando…';
  try {
    const pos = await getCurrentPosition();
    const place = await reverseGeocode(pos.lat, pos.lng);
    draftLocation = { lat: pos.lat, lng: pos.lng, place: place || null };
    renderLocationBox();
    toast(place ? `Ubicación: ${place}` : 'Ubicación guardada');
  } catch (err) {
    toast('No se pudo obtener la ubicación. Revisa los permisos.');
  } finally {
    btn.disabled = false;
    btn.textContent = '📍 Usar mi ubicación';
  }
});

$('#clearLocationBtn').addEventListener('click', () => {
  draftLocation = null;
  renderLocationBox();
});

// --- Voz / dictado ---
function setupVoice() {
  const btn = $('#voiceBtn');
  const status = $('#voiceStatus');
  if (!isVoiceSupported()) {
    btn.disabled = true;
    btn.textContent = '🎙️ Voz no disponible';
    status.textContent = 'Tu navegador no permite dictado. Puedes escribir.';
    return;
  }

  voice = new VoiceDictation({
    lang: 'es-ES',
    onText: (chunk, isFinal) => {
      const ta = $('#entryText');
      if (isFinal) {
        voiceBaseText = appendText(voiceBaseText, chunk);
        ta.value = voiceBaseText;
      } else {
        ta.value = appendText(voiceBaseText, chunk);
      }
      ta.scrollTop = ta.scrollHeight;
    },
    onState: (state) => {
      if (state === 'recording') {
        btn.classList.add('recording');
        btn.textContent = '⏹️ Detener';
        status.textContent = 'Escuchando… habla con naturalidad.';
      } else {
        btn.classList.remove('recording');
        btn.textContent = '🎙️ Dictar por voz';
        if (state === 'error') status.textContent = 'No se pudo escuchar. Revisa el permiso del micrófono.';
        else status.textContent = '';
      }
    },
  });

  btn.addEventListener('click', () => {
    if (!voice.recognizing) voiceBaseText = $('#entryText').value;
    voice.toggle();
  });
}

function appendText(base, chunk) {
  const b = (base || '').trim();
  const c = (chunk || '').trim();
  if (!b) return c;
  if (!c) return b;
  return b + (/[.!?…]$/.test(b) ? ' ' : ' ') + c;
}

// =================== Lugares ===================
function renderPlaces() {
  const container = $('#placesList');
  container.innerHTML = '';
  const withLoc = allEntries.filter((e) => e.location);
  if (!withLoc.length) {
    container.innerHTML = '<p class="muted">Todavía no hay recuerdos con ubicación. Cuando guardes un recuerdo, usa el botón “📍 Usar mi ubicación”.</p>';
    return;
  }
  // Agrupa por nombre de lugar.
  const groups = new Map();
  for (const e of withLoc) {
    const key = e.location.place || formatCoords(e.location.lat, e.location.lng);
    if (!groups.has(key)) groups.set(key, { key, items: [], sample: e.location });
    groups.get(key).items.push(e);
  }
  for (const g of groups.values()) {
    const a = document.createElement('a');
    a.className = 'place-card';
    a.href = mapLink(g.sample.lat, g.sample.lng);
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `
      <div>
        <div class="place-name">📍 ${escapeHTML(g.key)}</div>
        <div class="place-sub">${formatCoords(g.sample.lat, g.sample.lng)} · ver en el mapa</div>
      </div>
      <span class="place-count">${g.items.length}</span>`;
    container.appendChild(a);
  }
}

// =================== Libros ===================
let bookURLs = [];
let currentBook = null;
let saveBookTimer = null;

function revokeBookURLs() {
  bookURLs.forEach((u) => URL.revokeObjectURL(u));
  bookURLs = [];
}

function styleName(s) {
  return ({ elegante: 'Elegante', clasico: 'Clásico', moderno: 'Moderno' })[s] || 'Elegante';
}

// --- Lista de libros ---
async function showBooksScreen() {
  revokeBookURLs();
  currentBook = null;
  $('#bookEditor').hidden = true;
  $('#booksScreen').hidden = false;
  const books = await db.getAllBooks();
  const grid = $('#booksGrid');
  grid.innerHTML = '';
  $('#booksEmpty').hidden = books.length > 0;
  for (const b of books) {
    const count = (b.entryIds || []).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'book-card';
    card.innerHTML = `
      <span class="book-card-title">${escapeHTML(b.title || 'Sin título')}</span>
      <span class="book-card-sub">${count} recuerdo${count === 1 ? '' : 's'} · estilo ${styleName(b.style)}</span>`;
    card.addEventListener('click', () => openBook(b.id));
    grid.appendChild(card);
  }
}

async function newBook() {
  const defTitle = (await db.getSetting('bookTitle', '')) || 'Mis Memorias';
  const author = await db.getSetting('authorName', '');
  // Orden cronológico (del más antiguo al más reciente) como punto de partida.
  const chrono = [...allEntries]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((e) => e.id);
  const book = {
    id: cryptoId(),
    title: defTitle,
    author,
    dedication: '',
    intro: '',
    style: 'elegante',
    entryIds: chrono,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.saveBook(book);
  await openBook(book.id);
  toast('Libro creado ✨');
}

// --- Editor de un libro ---
async function openBook(id) {
  const b = await db.getBook(id);
  if (!b) return;
  currentBook = b;
  $('#booksScreen').hidden = true;
  $('#bookEditor').hidden = false;
  $('#bkTitle').value = b.title || '';
  $('#bkAuthor').value = b.author || '';
  $('#bkDedication').value = b.dedication || '';
  $('#bkIntro').value = b.intro || '';
  $('#claudePaste').value = '';
  $$('.style-opt').forEach((o) => o.classList.toggle('selected', o.dataset.style === (b.style || 'elegante')));
  renderBookEntries();
  renderPreview();
  window.scrollTo(0, 0);
}

// Objetos de recuerdo en el orden del libro (solo los que aún existen).
function bookEntriesOrdered() {
  const map = new Map(allEntries.map((e) => [e.id, e]));
  return (currentBook.entryIds || []).map((id) => map.get(id)).filter(Boolean);
}

function renderPreview() {
  revokeBookURLs();
  bookURLs = renderBook($('#bookPreview'), bookEntriesOrdered(), {
    title: currentBook.title || 'Mis Memorias',
    author: currentBook.author,
    dedication: currentBook.dedication,
    intro: currentBook.intro,
    style: currentBook.style || 'elegante',
  });
}

function renderBookEntries() {
  const container = $('#bookEntries');
  container.innerHTML = '';
  const map = new Map(allEntries.map((e) => [e.id, e]));
  const includedIds = (currentBook.entryIds || []).filter((id) => map.has(id));

  // Incluidos, en orden, con ↑ ↓ y quitar.
  includedIds.forEach((id, i) => {
    const e = map.get(id);
    const row = document.createElement('div');
    row.className = 'be-row included';
    row.innerHTML = `
      <div class="be-info">
        <span class="be-title">${escapeHTML(e.title || 'Sin título')}</span>
        <span class="be-date">${e.date ? formatLongDate(e.date) : ''}</span>
      </div>
      <div class="be-actions">
        <button type="button" class="be-btn" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="be-btn" data-act="down" ${i === includedIds.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="be-btn remove" data-act="remove" aria-label="Quitar">✕</button>
      </div>`;
    row.querySelector('[data-act="up"]').addEventListener('click', () => moveEntry(id, -1));
    row.querySelector('[data-act="down"]').addEventListener('click', () => moveEntry(id, 1));
    row.querySelector('[data-act="remove"]').addEventListener('click', () => toggleEntry(id, false));
    container.appendChild(row);
  });

  // Excluidos (recuerdos que existen pero no están en el libro).
  const includedSet = new Set(includedIds);
  const excluded = allEntries.filter((e) => !includedSet.has(e.id));
  if (excluded.length) {
    const div = document.createElement('div');
    div.className = 'be-divider';
    div.textContent = 'Agregar más recuerdos';
    container.appendChild(div);
    excluded.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'be-row';
      row.innerHTML = `
        <div class="be-info">
          <span class="be-title">${escapeHTML(e.title || 'Sin título')}</span>
          <span class="be-date">${e.date ? formatLongDate(e.date) : ''}</span>
        </div>
        <div class="be-actions"><button type="button" class="be-btn add" data-act="add">＋ Agregar</button></div>`;
      row.querySelector('[data-act="add"]').addEventListener('click', () => toggleEntry(e.id, true));
      container.appendChild(row);
    });
  }

  if (!includedIds.length && !excluded.length) {
    container.innerHTML = '<p class="muted">Aún no tienes recuerdos. Crea algunos en la pestaña Recuerdos.</p>';
  }
}

function moveEntry(id, dir) {
  const ids = [...(currentBook.entryIds || [])];
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  currentBook.entryIds = ids;
  persistBook();
  renderBookEntries();
  renderPreview();
}

function toggleEntry(id, include) {
  let ids = [...(currentBook.entryIds || [])];
  if (include) {
    if (!ids.includes(id)) ids.push(id);
  } else {
    ids = ids.filter((x) => x !== id);
  }
  currentBook.entryIds = ids;
  persistBook();
  renderBookEntries();
  renderPreview();
}

// Guarda el libro actual (con un pequeño retraso para no escribir en cada tecla).
function persistBook() {
  if (!currentBook) return;
  currentBook.updatedAt = Date.now();
  const snapshot = { ...currentBook };
  clearTimeout(saveBookTimer);
  saveBookTimer = setTimeout(() => {
    db.saveBook(snapshot).catch((err) => console.error('No se pudo guardar el libro:', err));
  }, 250);
}

// Campos de la portada.
[
  ['#bkTitle', 'title'],
  ['#bkAuthor', 'author'],
  ['#bkDedication', 'dedication'],
  ['#bkIntro', 'intro'],
].forEach(([sel, prop]) => {
  $(sel).addEventListener('input', () => {
    if (!currentBook) return;
    currentBook[prop] = $(sel).value;
    persistBook();
    renderPreview();
  });
});

// Estilo.
$$('.style-opt').forEach((opt) => {
  opt.addEventListener('click', () => {
    if (!currentBook) return;
    currentBook.style = opt.dataset.style;
    $$('.style-opt').forEach((o) => o.classList.toggle('selected', o === opt));
    persistBook();
    renderPreview();
  });
});

$('#newBookBtn').addEventListener('click', newBook);
$('#backToBooks').addEventListener('click', showBooksScreen);

$('#deleteBookBtn').addEventListener('click', async () => {
  if (!currentBook) return;
  if (!confirm('¿Eliminar este libro? Tus recuerdos NO se borran, solo este libro.')) return;
  await db.deleteBook(currentBook.id);
  toast('Libro eliminado');
  showBooksScreen();
});

// --- Mejorar con Claude (copiar / pegar) ---
function buildClaudePrompt() {
  const lines = [];
  lines.push('Eres un editor literario cálido. Con estos recuerdos personales, escríbeme una introducción bonita para un libro de memorias (2 o 3 párrafos, en primera persona, tono cercano). Devuélveme solo el texto de la introducción, listo para pegar.');
  lines.push('');
  lines.push(`Título del libro: ${currentBook.title || 'Mis Memorias'}`);
  if (currentBook.author) lines.push(`Autor: ${currentBook.author}`);
  lines.push('');
  lines.push('Recuerdos (en orden):');
  bookEntriesOrdered().forEach((e, i) => {
    const fecha = e.date ? ' (' + formatLongDate(e.date) + ')' : '';
    lines.push('');
    lines.push(`${i + 1}. ${e.title || 'Sin título'}${fecha}`);
    if (e.text) lines.push(e.text);
    if (e.location && e.location.place) lines.push(`Lugar: ${e.location.place}`);
  });
  return lines.join('\n');
}

$('#copyForClaudeBtn').addEventListener('click', async () => {
  if (!currentBook) return;
  if (!bookEntriesOrdered().length) {
    toast('Agrega al menos un recuerdo al libro primero');
    return;
  }
  const text = buildClaudePrompt();
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado ✨ Pégalo en Claude (claude.ai)');
  } catch (err) {
    // Si el navegador no deja copiar solo, lo dejamos en la caja para copiar a mano.
    $('#claudePaste').value = text;
    toast('Copia el texto de la caja de abajo y pégalo en Claude');
  }
});

$('#useClaudeIntroBtn').addEventListener('click', () => {
  if (!currentBook) return;
  const v = $('#claudePaste').value.trim();
  if (!v) {
    toast('Primero pega el texto que te dio Claude');
    return;
  }
  currentBook.intro = v;
  $('#bkIntro').value = v;
  persistBook();
  renderPreview();
  toast('Introducción actualizada ✨');
});

$('#clearClaudeBtn').addEventListener('click', () => {
  $('#claudePaste').value = '';
});

$('#exportPdfBtn').addEventListener('click', () => {
  toast('Elige “Guardar como PDF” en el diálogo de impresión');
  setTimeout(() => window.print(), 400);
});

// =================== Corrección masiva con Claude ===================

function buildCorrectionPrompt(entries) {
  const lines = [];
  lines.push('Eres una editora literaria cálida y precisa. Voy a darte mis recuerdos personales para que corrijas la ortografía, la puntuación y la redacción de cada uno, manteniendo mi voz y mis ideas exactamente como las escribí — solo mejora la forma, no el fondo.');
  lines.push('');
  lines.push('INSTRUCCIÓN IMPORTANTE: devuélveme los recuerdos en el mismo orden, uno por uno, usando exactamente este separador antes de cada uno (incluyendo el ID):');
  lines.push('');
  lines.push('===ID:EL_ID_DEL_RECUERDO===');
  lines.push('Texto corregido aquí');
  lines.push('');
  lines.push('No agregues nada más — solo los separadores y el texto corregido de cada recuerdo.');
  lines.push('');
  lines.push('---');
  lines.push('');
  entries.forEach((e) => {
    lines.push(`===ID:${e.id}===`);
    lines.push(`Título: ${e.title || ''}`);
    if (e.text) lines.push(e.text);
    lines.push('');
  });
  return lines.join('\n');
}

$('#copyAllForCorrectionBtn').addEventListener('click', async () => {
  const entries = await db.getAllEntries();
  if (!entries.length) { toast('Aún no tienes recuerdos'); return; }
  const text = buildCorrectionPrompt(entries);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado ✨ Pégalo en Claude (claude.ai)');
  } catch {
    $('#correctionPaste').value = text;
    toast('Copia el texto de la caja y pégalo en Claude');
  }
});

$('#applyCorrectionBtn').addEventListener('click', async () => {
  const raw = $('#correctionPaste').value.trim();
  if (!raw) { toast('Primero pega la respuesta de Claude'); return; }

  const status = $('#correctionStatus');
  status.textContent = 'Aplicando correcciones…';

  // Parsear bloques: ===ID:xxx=== seguido de texto hasta el siguiente separador
  const blocks = raw.split(/===ID:([^=\n]+)===/g).slice(1);
  // blocks = [id, texto, id, texto, ...]
  let updated = 0;
  for (let i = 0; i < blocks.length - 1; i += 2) {
    const id = blocks[i].trim();
    const correctedBlock = blocks[i + 1].trim();
    // El bloque puede tener "Título: xxx\n" al inicio — lo separamos
    const lines = correctedBlock.split('\n');
    let titulo = null;
    let textoLines = lines;
    if (lines[0].startsWith('Título:')) {
      titulo = lines[0].replace('Título:', '').trim();
      textoLines = lines.slice(1);
    }
    const texto = textoLines.join('\n').trim();

    const entry = await db.getEntry(id);
    if (!entry) continue;
    if (titulo) entry.title = titulo;
    if (texto) entry.text = texto;
    await db.saveEntry(entry);
    updated++;
  }

  if (updated) {
    await loadEntries();
    $('#correctionPaste').value = '';
    status.textContent = `✓ ${updated} recuerdo${updated !== 1 ? 's' : ''} actualizado${updated !== 1 ? 's' : ''}`;
    toast(`${updated} recuerdos corregidos ✨`);
  } else {
    status.textContent = 'No se encontraron correcciones para aplicar. Verifica el formato.';
  }
});

$('#clearCorrectionBtn').addEventListener('click', () => {
  $('#correctionPaste').value = '';
  $('#correctionStatus').textContent = '';
});

// =================== Ajustes ===================
async function loadSettings() {
  $('#authorName').value = await db.getSetting('authorName', '');
  $('#bookTitle').value = await db.getSetting('bookTitle', '');
  const key = await db.getSetting('claudeApiKey', '');
  if (key) {
    $('#claudeApiKeyInput').value = key;
    $('#apiKeyStatus').textContent = '✓ Key guardada.';
  }
  const proxy = await db.getSetting('claudeProxyUrl', '');
  if (proxy) {
    $('#claudeProxyInput').value = proxy;
    $('#proxyStatus').textContent = '✓ Proxy configurado — ' + proxy;
  }
}

$('#saveApiKeyBtn').addEventListener('click', async () => {
  const val = $('#claudeApiKeyInput').value.trim();
  if (!val.startsWith('sk-ant-')) {
    $('#apiKeyStatus').textContent = 'La key no parece válida. Debe empezar con sk-ant-…';
    return;
  }
  await db.setSetting('claudeApiKey', val);
  $('#apiKeyStatus').textContent = '✓ Key guardada ✨';
  toast('API key guardada ✨');
});

$('#clearApiKeyBtn').addEventListener('click', async () => {
  await db.setSetting('claudeApiKey', '');
  $('#claudeApiKeyInput').value = '';
  $('#apiKeyStatus').textContent = 'Key borrada.';
});

$('#saveProxyBtn').addEventListener('click', async () => {
  const val = $('#claudeProxyInput').value.trim();
  if (!val.startsWith('https://')) {
    $('#proxyStatus').textContent = 'La URL debe empezar con https://';
    return;
  }
  await db.setSetting('claudeProxyUrl', val);
  $('#proxyStatus').textContent = '✓ Proxy guardado ✨ — ' + val;
  toast('Proxy guardado ✨');
});

$('#clearProxyBtn').addEventListener('click', async () => {
  await db.setSetting('claudeProxyUrl', '');
  $('#claudeProxyInput').value = '';
  $('#proxyStatus').textContent = 'Proxy borrado.';
});

$('#authorName').addEventListener('change', (e) => db.setSetting('authorName', e.target.value.trim()));
$('#bookTitle').addEventListener('change', (e) => db.setSetting('bookTitle', e.target.value.trim()));

$('#exportDataBtn').addEventListener('click', async () => {
  toast('Preparando copia…');
  const data = await db.exportBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memorias-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('#importDataInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await db.importBackup(data);
    await loadEntries();
    await loadSettings();
    toast('Copia restaurada ✨');
  } catch (err) {
    toast('No se pudo leer el archivo');
  }
  e.target.value = '';
});

$('#mergeDataInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const { added, merged } = await db.mergeBackup(data);
    await loadEntries();
    const msg = [
      added ? `${added} recuerdo${added !== 1 ? 's' : ''} nuevo${added !== 1 ? 's' : ''}` : '',
      merged ? `${merged} con fotos nuevas` : '',
    ].filter(Boolean).join(', ');
    toast(msg ? `Fusionado: ${msg} ✨` : 'Sin cambios nuevos');
  } catch (err) {
    toast('No se pudo fusionar el archivo');
  }
  e.target.value = '';
});

$('#wipeBtn').addEventListener('click', async () => {
  if (!confirm('¿Seguro? Esto borra TODOS tus recuerdos de este dispositivo.')) return;
  await db.clearAllEntries();
  await loadEntries();
  toast('Todo borrado');
});

// =================== Utilidades ===================
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cryptoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.abs(Date.now() ^ (performance.now() * 1000 | 0)).toString(36);
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// =================== Instalar (PWA) ===================
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBtn').hidden = true;
});

// =================== Arranque ===================

// initEssence / initNumero se llaman una sola vez (la primera vez que se abre cada pestaña).
let essenceInitialized = false;
const essenceReady = (async () => {
  return () => {
    if (essenceInitialized) return;
    essenceInitialized = true;
    initEssence();
  };
})();

let numeroInitialized = false;
const numeroReady = (async () => {
  return () => {
    if (numeroInitialized) return;
    numeroInitialized = true;
    initNumero();
  };
})();

async function init() {
  setupVoice();
  await loadSettings();
  await loadEntries();
  await initRssSources();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
