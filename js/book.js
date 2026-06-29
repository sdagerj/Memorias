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
// creadas para las fotos, para poder liberarlas después.
export function renderBook(container, entries, { title, author }) {
  const objectURLs = [];
  container.innerHTML = '';

  // Portada
  const cover = document.createElement('div');
  cover.className = 'book-page book-cover';
  const subtitle = entries.length
    ? `${entries.length} recuerdo${entries.length === 1 ? '' : 's'}`
    : 'Un libro por escribir';
  cover.innerHTML = `
    <h1>${escapeHTML(title || 'Mis Memorias')}</h1>
    <p class="author">${author ? 'de ' + escapeHTML(author) : ''}</p>
    <p class="muted">${subtitle}</p>
  `;
  container.appendChild(cover);

  // Recuerdos en orden cronológico (del más antiguo al más reciente) para un libro.
  const ordered = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!ordered.length) {
    const empty = document.createElement('div');
    empty.className = 'book-page';
    empty.innerHTML = `<p class="muted">Aún no has guardado recuerdos. Cuando lo hagas, aparecerán aquí como las páginas de tu libro.</p>`;
    container.appendChild(empty);
    return objectURLs;
  }

  for (const e of ordered) {
    const page = document.createElement('div');
    page.className = 'book-page';

    let html = '';
    html += `<h3>${escapeHTML(e.title || 'Sin título')}</h3>`;
    const metaParts = [];
    if (e.date) metaParts.push(formatLongDate(e.date));
    if (e.mood) metaParts.push(e.mood);
    html += `<div class="page-meta">${metaParts.join(' · ')}</div>`;

    if (e.text) html += `<p>${escapeHTML(e.text)}</p>`;

    if (e.photos && e.photos.length) {
      html += '<div class="book-photos">';
      for (const p of e.photos) {
        const url = URL.createObjectURL(p.blob);
        objectURLs.push(url);
        html += `<img src="${url}" alt="" />`;
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

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { mapLink };
