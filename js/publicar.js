// Publicar una entrega de El Número directamente en la web.
//
// La web (elnumero.netlify.app) se construye sola desde el repositorio
// sdagerj/el-numero: cada editorial es un archivo Markdown dentro de
// src/content/editoriales/. Aquí se arma ese archivo y se escribe con la API
// de GitHub. Netlify ve el cambio y reconstruye. No hay servidor de por medio.
//
// El token se guarda solo en este dispositivo, igual que la key de Claude, y
// solo se manda a api.github.com.

import { getSetting, setSetting } from './db.js';

const REPO = 'sdagerj/el-numero';
const CARPETA = 'src/content/editoriales';
const RAMA = 'main';

export const CANTERAS_WEB = [
  { id: 'mercados', nombre: 'Mercados' },
  { id: 'arte', nombre: 'Arte' },
  { id: 'mujeres', nombre: 'Mujeres' },
  { id: 'vida', nombre: 'Vida' },
  { id: 'efemerides', nombre: 'Efemérides' },
];

// ── El token ──────────────────────────────────────────────────────────────────

export function normalizeToken(raw) {
  // Mismo saneado que la key de Claude: al pegar desde el móvil llegan guiones
  // tipográficos y espacios invisibles que revientan la cabecera HTTP.
  return String(raw || '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[\s​-‍﻿]/g, '');
}

export function describeTokenProblem(token) {
  const t = normalizeToken(token);
  if (!t) return 'No hay ninguna llave guardada.';
  if (!/^(github_pat_|ghp_)/.test(t)) {
    return 'Eso no parece una llave de GitHub: las llaves empiezan por «github_pat_» o «ghp_».';
  }
  const malo = [...t].findIndex((c) => c.charCodeAt(0) > 126);
  if (malo >= 0) {
    return `La llave tiene un carácter raro en la posición ${malo + 1}. Bórrala y pégala otra vez.`;
  }
  return null;
}

export async function getGithubToken() {
  return normalizeToken(await getSetting('githubToken', ''));
}

export async function setGithubToken(token) {
  await setSetting('githubToken', normalizeToken(token));
}

// ── El nombre del archivo ─────────────────────────────────────────────────────

export function slugify(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fuera tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function nombreArchivo(fecha, titulo) {
  const s = slugify(titulo) || 'sin-titulo';
  return `${fecha}-${s}.md`;
}

// ── El archivo Markdown ───────────────────────────────────────────────────────

function yamlStr(valor) {
  // Todo entre comillas dobles: así da igual que el texto lleve dos puntos,
  // almohadillas o empiece por un número — que es justo lo habitual aquí.
  return `"${String(valor ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// En el editor de la app un parrafo se separa del siguiente con un solo Enter.
// Markdown necesita un renglon EN BLANCO: sin el, une todas las lineas en un
// unico parrafo gigante e ilegible. Aqui se traduce de un formato al otro.
export function separarParrafos(texto) {
  return String(texto || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .join('\n\n');
}

function cuerpo(entrega) {
  const texto = separarParrafos(entrega.editorial);
  const destaque = String(entrega.destaque || '').trim();
  if (!destaque) return texto;
  // Si la frase ya está dentro del editorial no se repite: se destacaría dos
  // veces lo mismo.
  if (texto.includes(destaque)) return texto;
  const cita = destaque.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
  const parrafos = texto.split(/\n\s*\n/);
  if (parrafos.length < 2) return `${texto}\n\n${cita}`;
  // Detrás del primer párrafo, que es donde respira una frase destacada.
  return [parrafos[0], cita, ...parrafos.slice(1)].join('\n\n');
}

export function construirMarkdown(entrega) {
  const l = [];
  l.push('---');
  l.push(`numero: ${yamlStr(entrega.numero)}`);
  l.push(`titulo: ${yamlStr(entrega.gancho)}`);
  l.push(`fecha: ${entrega.fecha}`);
  l.push(`resumen: ${yamlStr(entrega.resumen)}`);
  l.push(`cantera: ${entrega.cantera}`);

  const fuentes = (entrega.fuentes || []).filter((f) => f && (f.nombre || '').trim());
  if (fuentes.length === 0) {
    l.push('fuentes: []');
  } else {
    l.push('fuentes:');
    for (const f of fuentes) {
      l.push(`  - nombre: ${yamlStr(f.nombre)}`);
      if ((f.documento || '').trim()) l.push(`    documento: ${yamlStr(f.documento)}`);
      if (String(f.anio || '').trim()) l.push(`    anio: ${Number(f.anio)}`);
      if ((f.url || '').trim()) l.push(`    url: ${yamlStr(f.url)}`);
    }
  }

  if ((entrega.medioNombre || '').trim()) {
    l.push('medio:');
    l.push(`  nombre: ${yamlStr(entrega.medioNombre)}`);
    if ((entrega.medioUrl || '').trim()) l.push(`  url: ${yamlStr(entrega.medioUrl)}`);
  }

  if (entrega.borrador) l.push('borrador: true');

  l.push('---');
  l.push('');
  l.push(cuerpo(entrega));
  l.push('');
  return l.join('\n');
}

// ── Qué falta antes de poder publicar ─────────────────────────────────────────

export function problemasParaPublicar(entrega) {
  const faltan = [];
  const t = (v) => String(v || '').trim();

  if (!t(entrega.numero)) faltan.push('Falta el número.');
  if (!t(entrega.gancho)) faltan.push('Falta el título.');
  if (!t(entrega.editorial)) faltan.push('El editorial está vacío.');
  if (!t(entrega.resumen)) {
    faltan.push('Falta el resumen. Es lo que se lee en WhatsApp y en Google.');
  } else if (t(entrega.resumen).length > 200) {
    faltan.push('El resumen es muy largo: pásalo de 200 letras y se corta en WhatsApp.');
  }
  if (!CANTERAS_WEB.some((c) => c.id === entrega.cantera)) faltan.push('Falta elegir la cantera.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t(entrega.fecha))) faltan.push('Falta la fecha.');

  for (const f of entrega.fuentes || []) {
    const url = t(f.url);
    if (url && !/^https?:\/\//i.test(url)) {
      faltan.push(`El enlace de «${t(f.nombre) || 'una fuente'}» tiene que empezar por http.`);
    }
    if (!t(f.nombre) && (t(f.documento) || url)) {
      faltan.push('Hay una fuente sin nombre de institución.');
    }
  }

  const mUrl = t(entrega.medioUrl);
  if (mUrl && !/^https?:\/\//i.test(mUrl)) {
    faltan.push('El enlace del medio tiene que empezar por http.');
  }
  if (mUrl && !t(entrega.medioNombre)) {
    faltan.push('Pusiste el enlace del medio pero no su nombre.');
  }

  return faltan;
}

// ── GitHub ────────────────────────────────────────────────────────────────────

function b64(texto) {
  // GitHub quiere el contenido en base64, y btoa solo traga latin-1: hay que
  // pasar por UTF-8 a mano o se rompen las tildes y las eñes.
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function gh(ruta, token, opciones = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com${ruta}`, {
      ...opciones,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opciones.headers || {}),
      },
    });
  } catch (e) {
    throw new Error('No hay conexión con GitHub. Revisa el internet e inténtalo otra vez.');
  }

  if (res.status === 401) {
    throw new Error('GitHub rechazó la llave. Puede haber caducado: genera una nueva en Ajustes.');
  }
  if (res.status === 403) {
    throw new Error('La llave no tiene permiso para escribir en el repositorio el-numero.');
  }
  if (res.status === 404 && opciones.method === 'PUT') {
    throw new Error('GitHub no encuentra el repositorio el-numero, o la llave no lo alcanza.');
  }
  if (res.status === 409 || res.status === 422) {
    throw new Error('Alguien cambió ese archivo mientras tanto. Vuelve a intentarlo.');
  }
  return res;
}

async function shaExistente(archivo, token) {
  const res = await gh(`/repos/${REPO}/contents/${CARPETA}/${archivo}?ref=${RAMA}`, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} al buscar el archivo.`);
  const json = await res.json();
  return json.sha || null;
}

// Devuelve { url, archivo, actualizado } o lanza un Error con texto en español.
export async function publicarEnLaWeb(entrega, token) {
  const problema = describeTokenProblem(token);
  if (problema) throw new Error(problema);

  const faltan = problemasParaPublicar(entrega);
  if (faltan.length) throw new Error(faltan.join(' '));

  const archivo = entrega.webArchivo || nombreArchivo(entrega.fecha, entrega.gancho);
  const contenido = construirMarkdown(entrega);
  const sha = await shaExistente(archivo, token);

  const res = await gh(`/repos/${REPO}/contents/${CARPETA}/${archivo}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: sha
        ? `Actualiza «${entrega.gancho}»`
        : `Publica «${entrega.gancho}»`,
      content: b64(contenido),
      branch: RAMA,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    let detalle = '';
    try { detalle = (await res.json()).message || ''; } catch { /* sin cuerpo */ }
    throw new Error(`GitHub no aceptó el archivo (${res.status}). ${detalle}`.trim());
  }

  return {
    archivo,
    actualizado: Boolean(sha),
    borrador: Boolean(entrega.borrador),
    // Un borrador no genera pagina: dar su direccion seria mandar a un 404.
    url: entrega.borrador
      ? null
      : `https://elnumero.netlify.app/n/${archivo.replace(/\.md$/, '')}/`,
  };
}

export { REPO, CARPETA };
