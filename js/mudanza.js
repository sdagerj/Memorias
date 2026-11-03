// Mudanza de la app: de sdagerj.github.io/Memorias a elnumero.com.co/memorias.
//
// Los recuerdos viven en la memoria del navegador, atados a la dirección de
// la app. Una dirección nueva empieza vacía y el navegador no deja que una lea
// los datos de la otra. Este módulo los pasa de una a otra en el mismo
// teléfono, con un solo toque:
//
//   1. En la app vieja, «Mudarme» abre la app nueva en otra pestaña.
//   2. La nueva avisa que está lista (postMessage, solo a la dirección vieja).
//   3. La vieja le manda la copia completa: recuerdos con fotos, libros,
//      entregas y los ajustes (llaves incluidas), solo a la dirección nueva.
//   4. La nueva los guarda sin borrar nada y responde cuántos recibió.
//
// Si el teléfono no deja hablar a las dos pestañas (pasa con la app instalada
// en iPhone), la vieja descarga la copia y la nueva ofrece elegirla.
//
// El mismo archivo vive en los dos sitios: cada copia sabe qué papel le toca
// por la dirección en la que corre.

import * as db from './db.js';

const ORIGEN_VIEJO = 'https://sdagerj.github.io';
const ORIGEN_NUEVO = 'https://elnumero.com.co';
const URL_NUEVA = ORIGEN_NUEVO + '/memorias/?mudanza=1';

// Ajustes que viajan. El proxy no: solo servía para la dirección vieja.
const AJUSTES = ['authorName', 'bookTitle', 'claudeApiKey', 'githubToken',
  'rssSources', 'essenceDate', 'essenceProfile', 'numeroDraft'];

// Las pruebas las cambian para usar dos direcciones locales.
function origenes() {
  const o = (typeof window !== 'undefined' && window.__MUDANZA_ORIGENES) || {};
  return {
    viejo: o.viejo || ORIGEN_VIEJO,
    nuevo: o.nuevo || ORIGEN_NUEVO,
    urlNueva: o.urlNueva || URL_NUEVA,
  };
}

export function soyLaAppVieja() {
  return location.origin === origenes().viejo;
}

export function soyLaAppNueva() {
  return location.origin === origenes().nuevo;
}

async function armarPaquete() {
  const copia = await db.exportBackup();
  const ajustes = {};
  for (const k of AJUSTES) {
    const v = await db.getSetting(k, null);
    if (v !== null && v !== undefined && v !== '') ajustes[k] = v;
  }
  return { tipo: 'memorias-mudanza', version: 1, copia, ajustes };
}

function descargar(paquete) {
  const blob = new Blob([JSON.stringify(paquete.copia)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memorias-mudanza-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── App vieja: manda ─────────────────────────────────────────────────────────
// `avisar(texto)` muestra el estado en pantalla. Resuelve con el resumen que
// devuelve la app nueva, o con { descargado: true } si hubo que usar archivo.
export function mudarme(avisar = () => {}) {
  const { nuevo, urlNueva } = origenes();
  avisar('Abriendo la app nueva…');
  // window.open tiene que ir directo en el toque, antes de cualquier await,
  // o el navegador lo bloquea.
  const ventana = window.open(urlNueva, '_blank');
  return new Promise((resolve) => {
    let paquete = null;
    let terminado = false;
    let enviado = false;
    const preparado = armarPaquete().then((p) => { paquete = p; return p; });

    const fin = (r) => {
      if (terminado) return;
      terminado = true;
      window.removeEventListener('message', alRecibir);
      clearTimeout(reloj);
      resolve(r);
    };

    const alRecibir = async (ev) => {
      if (ev.origin !== nuevo || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.tipo === 'memorias-lista') {
        if (enviado) return;
        enviado = true;
        // Ya se hablan: se da tiempo de sobra para que guarde las fotos.
        clearTimeout(reloj);
        reloj = setTimeout(planB, 180000);
        avisar('La app nueva respondió. Enviando tus recuerdos…');
        const p = await preparado;
        ev.source.postMessage(p, nuevo);
      } else if (ev.data.tipo === 'memorias-recibida') {
        fin(ev.data.resumen || {});
      } else if (ev.data.tipo === 'memorias-error') {
        avisar('La app nueva no pudo guardar: ' + (ev.data.mensaje || 'error') + '. Te descargo la copia.');
        descargar(paquete || await preparado);
        fin({ descargado: true });
      }
    };
    window.addEventListener('message', alRecibir);

    // Si en 25 segundos las dos pestañas no lograron hablar, plan B: archivo.
    const planB = async () => {
      if (terminado) return;
      avisar('El teléfono no dejó pasar los datos directo. Te descargo la copia para elegirla en la app nueva.');
      descargar(paquete || await preparado);
      fin({ descargado: true });
    };
    let reloj = setTimeout(planB, ventana ? 25000 : 10);
  });
}

// ── App nueva: recibe ────────────────────────────────────────────────────────
// Solo actúa si se abrió con ?mudanza=1. `avisar(texto, listo)` muestra el
// estado; `alTerminar()` refresca la pantalla con lo recibido.
export function esperarMudanza(avisar = () => {}, alTerminar = () => {}) {
  if (!new URLSearchParams(location.search).has('mudanza')) return false;
  const { viejo } = origenes();
  const abridor = window.opener;
  if (!abridor) {
    avisar('No llegó nada directo desde la app vieja. En Ajustes, toca «Restaurar copia» y elige el archivo «memorias-mudanza» que se descargó.', true);
    return true;
  }
  avisar('Esperando tus recuerdos desde la app vieja…');

  const alRecibir = async (ev) => {
    if (ev.origin !== viejo || !ev.data || ev.data.tipo !== 'memorias-mudanza') return;
    window.removeEventListener('message', alRecibir);
    clearInterval(llamada);
    try {
      avisar('Guardando tus recuerdos…');
      await db.createSnapshot('antes de la mudanza').catch(() => {});
      const r = await db.mergeBackup(ev.data.copia);
      const ajustes = ev.data.ajustes || {};
      for (const [k, v] of Object.entries(ajustes)) {
        // Lo que ya esté puesto aquí manda; solo se llenan los vacíos.
        const actual = await db.getSetting(k, null);
        if (actual === null || actual === undefined || actual === '') await db.setSetting(k, v);
      }
      const resumen = {
        recuerdos: (ev.data.copia.entries || []).length,
        libros: (ev.data.copia.books || []).length,
        entregas: (ev.data.copia.numbers || []).length,
        nuevos: r.added, conFotosNuevas: r.merged,
        ajustes: Object.keys(ajustes).length,
      };
      ev.source.postMessage({ tipo: 'memorias-recibida', resumen }, viejo);
      avisar(`Listo: llegaron ${resumen.recuerdos} recuerdos, ${resumen.libros} libros y ${resumen.entregas} entregas, con tus llaves y ajustes.`, true);
      history.replaceState(null, '', location.pathname);
      await alTerminar();
    } catch (err) {
      const mensaje = err && err.message ? err.message : 'error';
      try { ev.source.postMessage({ tipo: 'memorias-error', mensaje }, viejo); } catch { /* sin abridor */ }
      avisar('No se pudieron guardar los recuerdos (' + mensaje + '). Usa «Restaurar copia» con el archivo que te descargó la app vieja.', true);
    }
  };
  window.addEventListener('message', alRecibir);

  // Se avisa varias veces por si la app vieja todavía no estaba escuchando.
  const avisarLista = () => { try { abridor.postMessage({ tipo: 'memorias-lista' }, viejo); } catch { /* cerrada */ } };
  avisarLista();
  const llamada = setInterval(avisarLista, 1000);
  setTimeout(() => clearInterval(llamada), 30000);
  return true;
}
