// Módulo "El Número": editor y archivo de entregas semanales.
import * as db from './db.js';

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

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ── init ──────────────────────────────────────────────────────────────────────

export async function initNumero() {
  $('#newNumeroBtn').addEventListener('click', () => openNumero(null));

  $('#backToNumeros').addEventListener('click', async () => {
    showNumeroScreen();
    await renderNumerosList();
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

  // Ocultar controles de navegación del carrusel (ya no aplican)
  const nav = $('#numCarouselNav');
  if (nav) nav.hidden = true;

  // Live preview de la portada al escribir
  ['numNumero', 'numGancho'].forEach((id) => $(`#${id}`)?.addEventListener('input', liveUpdate));

  await renderNumerosList();
}
