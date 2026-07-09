// Módulo "El Número": editor y archivo de entregas semanales.
import * as db from './db.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentNumero = null;   // número que se está editando
let slideIndex = 0;          // slide activo en el carrusel

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

// ── carrusel de previsualización ──────────────────────────────────────────────

function buildSlides(n) {
  const beats = n.beats || ['', '', '', ''];
  return [
    { type: 'cover',   numero: n.numero || '',   gancho: n.gancho || '' },
    { type: 'beat',    text: beats[0] || '' },
    { type: 'beat',    text: beats[1] || '' },
    { type: 'beat',    text: beats[2] || '' },
    { type: 'beat',    text: beats[3] || '' },
    { type: 'leccion', text: n.leccion || '' },
    { type: 'cta',     text: n.cta || '¿Cuál es tu número? Cuéntame en los comentarios.' },
  ];
}

function renderCarousel(n) {
  const slides = buildSlides(n);
  const wrap = $('#numCarousel');
  wrap.innerHTML = '';

  slides.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'num-slide' + (i === slideIndex ? ' active' : '');
    el.dataset.index = i;

    if (s.type === 'cover') {
      el.innerHTML = `
        <div class="num-slide-inner cover">
          <span class="num-hashtag">#</span>
          <div class="num-big">${escHtml(s.numero)}</div>
          <div class="num-gancho">${escHtml(s.gancho)}</div>
          <div class="num-brand-tag">El Número</div>
        </div>`;
    } else if (s.type === 'beat') {
      el.innerHTML = `
        <div class="num-slide-inner beat">
          <div class="num-beat-num">${i}</div>
          <div class="num-beat-text">${escHtml(s.text)}</div>
        </div>`;
    } else if (s.type === 'leccion') {
      el.innerHTML = `
        <div class="num-slide-inner leccion">
          <div class="num-quote-mark">"</div>
          <div class="num-leccion-text">${escHtml(s.text)}</div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="num-slide-inner cta">
          <div class="num-cta-hashtag">#ElNúmero</div>
          <div class="num-cta-text">${escHtml(s.text)}</div>
          <div class="num-brand-tag">@yomevoyconel30</div>
        </div>`;
    }
    wrap.appendChild(el);
  });

  updateDots(slides.length);
}

function updateDots(total) {
  const dots = $('#numDots');
  dots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('button');
    d.className = 'num-dot' + (i === slideIndex ? ' active' : '');
    d.setAttribute('aria-label', `Slide ${i + 1}`);
    d.addEventListener('click', () => goSlide(i));
    dots.appendChild(d);
  }
  $('#numSlideLabel').textContent = `${slideIndex + 1} / ${total}`;
}

function goSlide(i) {
  const slides = $$('.num-slide');
  if (!slides.length) return;
  slideIndex = Math.max(0, Math.min(i, slides.length - 1));
  slides.forEach((s, idx) => s.classList.toggle('active', idx === slideIndex));
  updateDots(slides.length);
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
  slideIndex = 0;
}

async function openNumero(id) {
  currentNumero = id ? await db.getNumber(id) : null;
  if (!currentNumero) {
    currentNumero = {
      id: cryptoId(),
      numero: '',
      gancho: '',
      beats: ['', '', '', ''],
      leccion: '',
      cta: '¿Cuál es tu número? Cuéntame en los comentarios.',
      editorial: '',
      createdAt: new Date().toISOString(),
    };
  }
  populateEditor(currentNumero);
  showEditorScreen();
  renderCarousel(currentNumero);
}

function populateEditor(n) {
  $('#numNumero').value = n.numero || '';
  $('#numGancho').value = n.gancho || '';
  (n.beats || ['', '', '', '']).forEach((b, i) => {
    const el = $(`#numBeat${i + 1}`);
    if (el) el.value = b;
  });
  $('#numLeccion').value = n.leccion || '';
  $('#numCta').value = n.cta || '¿Cuál es tu número? Cuéntame en los comentarios.';
  $('#numEditorial').value = n.editorial || '';
}

function readEditor() {
  return {
    ...currentNumero,
    numero: $('#numNumero').value.trim(),
    gancho: $('#numGancho').value.trim(),
    beats: [1, 2, 3, 4].map((i) => ($(`#numBeat${i}`)?.value || '').trim()),
    leccion: $('#numLeccion').value.trim(),
    cta: $('#numCta').value.trim(),
    editorial: $('#numEditorial')?.value.trim() || '',
  };
}

function liveUpdate() {
  if (!currentNumero) return;
  currentNumero = { ...currentNumero, ...readEditor() };
  renderCarousel(currentNumero);
}

// ── escapeHtml ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── init ──────────────────────────────────────────────────────────────────────

export async function initNumero() {
  // Botones del archivo
  $('#newNumeroBtn').addEventListener('click', () => openNumero(null));
  $('#backToNumeros').addEventListener('click', async () => {
    showNumeroScreen();
    await renderNumerosList();
  });

  // Guardar
  $('#saveNumeroBtn').addEventListener('click', async () => {
    const data = readEditor();
    if (!data.numero) { showToast('Escribe el número primero'); return; }
    currentNumero = { ...currentNumero, ...data };
    await db.saveNumber(currentNumero);
    showToast('Número guardado ✨');
  });

  // Eliminar
  $('#deleteNumeroBtn').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este número?')) return;
    await db.deleteNumber(currentNumero.id);
    showNumeroScreen();
    await renderNumerosList();
  });

  // Navegación del carrusel
  $('#numPrev').addEventListener('click', () => goSlide(slideIndex - 1));
  $('#numNext').addEventListener('click', () => goSlide(slideIndex + 1));

  // Swipe en móvil
  const carousel = $('#numCarousel');
  let touchStartX = 0;
  carousel.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goSlide(slideIndex + (dx < 0 ? 1 : -1));
  });

  // Live preview al escribir
  ['numNumero', 'numGancho', 'numBeat1', 'numBeat2', 'numBeat3', 'numBeat4', 'numLeccion', 'numCta']
    .forEach((id) => $(`#${id}`)?.addEventListener('input', liveUpdate));

  await renderNumerosList();
}
