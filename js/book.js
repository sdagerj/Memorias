// Genera la vista previa del "libro" a partir de los recuerdos.
// Cada recuerdo es una página. La primera es la portada.
// La exportación a PDF se hace con window.print() + estilos @media print.

import { formatCoords, mapLink } from './geo.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function formatLongDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  return `${d} de ${MESES[(m || 1) - 1]} de ${y}`;
}

// Construye el libro dentro del contenedor dado. Devuelve las URLs de objeto
// creadas para las fotos, para poder liberarlas después. Los recuerdos se
// pintan EN EL ORDEN recibido (el que eligió la persona en el editor).
export function renderBook(container, entries, opts = {}) {
  const { title, author, dedication, intro, style } = opts;
  const objectURLs = [];
  container.innerHTML = '';
  container.className = 'book-preview style-' + (style || 'elegante');

  // Portada. Si el primer recuerdo con foto tiene una, se usa como imagen de
  // portada para darle un aire de libro de fotos.
  const coverPhoto = firstPhoto(entries);
  const cover = document.createElement('div');
  cover.className = 'book-page book-cover' + (coverPhoto ? ' has-photo' : '');
  const subtitle = entries.length
    ? `${entries.length} recuerdo${entries.length === 1 ? '' : 's'}`
    : 'Un libro por escribir';
  let coverImg = '';
  if (coverPhoto) {
    const url = URL.createObjectURL(coverPhoto);
    objectURLs.push(url);
    coverImg = `<div class="cover-photo"><img src="${url}" alt="" /></div>`;
  }
  cover.innerHTML = `
    ${coverImg}
    <div class="cover-text">
      <h1>${escapeHTML(title || 'Mis Memorias')}</h1>
      <p class="author">${author ? 'de ' + escapeHTML(author) : ''}</p>
      <p class="muted">${subtitle}</p>
    </div>
  `;
  container.appendChild(cover);

  // Dedicatoria (opcional)
  if (dedication && dedication.trim()) {
    const ded = document.createElement('div');
    ded.className = 'book-page book-dedication';
    ded.innerHTML = `<p>${escapeHTML(dedication.trim())}</p>`;
    container.appendChild(ded);
  }

  // Introducción (opcional)
  if (intro && intro.trim()) {
    const it = document.createElement('div');
    it.className = 'book-page book-intro';
    it.innerHTML = `<h3>Introducción</h3><p>${escapeHTML(intro.trim())}</p>`;
    container.appendChild(it);
  }

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'book-page';
    empty.innerHTML = `<p class="muted">Este libro aún no tiene recuerdos. Agrégalos desde “Recuerdos del libro”.</p>`;
    container.appendChild(empty);
    return objectURLs;
  }

  for (const e of entries) {
    const page = document.createElement('div');
    page.className = 'book-page book-memory';

    const photos = e.photos || [];
    const metaParts = [];
    if (e.date) metaParts.push(formatLongDate(e.date));
    if (e.mood) metaParts.push(e.mood);

    let html = '';
    html += `<h3>${escapeHTML(e.title || 'Sin título')}</h3>`;
    html += `<div class="page-meta">${metaParts.join(' · ')}</div>`;

    // Foto principal (hero): abre el recuerdo como en un libro de fotos.
    if (photos.length) {
      const url = URL.createObjectURL(photos[0].blob);
      objectURLs.push(url);
      html += `<figure class="mem-hero"><img src="${url}" alt="" /></figure>`;
    }

    if (e.text) html += `<p>${escapeHTML(e.text)}</p>`;

    // Fotos restantes en una cuadrícula ordenada (tamaños uniformes).
    const rest = photos.slice(1);
    if (rest.length) {
      html += `<div class="mem-gallery ${galleryCols(rest.length)}">`;
      for (const p of rest) {
        const url = URL.createObjectURL(p.blob);
        objectURLs.push(url);
        html += `<figure><img src="${url}" alt="" /></figure>`;
      }
      html += '</div>';
    }

    if (e.location) {
      const loc = e.location;
      const name = loc.place || formatCoords(loc.lat, loc.lng);
      html += `<div class="book-loc">📍 ${escapeHTML(name)}</div>`;
    }

    page.innerHTML = html;
    container.appendChild(page);
  }

  return objectURLs;
}

// Primera foto disponible entre los recuerdos (para la portada).
function firstPhoto(entries) {
  for (const e of entries) {
    if (e.photos && e.photos.length) return e.photos[0].blob;
  }
  return null;
}

// Clase de columnas para la cuadrícula de fotos según cuántas haya.
function galleryCols(n) {
  if (n <= 1) return 'cols-1';
  if (n === 2 || n === 4) return 'cols-2';
  return 'cols-3';
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { mapLink };
