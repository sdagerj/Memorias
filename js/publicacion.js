// Las dos publicaciones de la semana para el feed de Instagram.
//
// No son historias. Una historia dura 24 horas y se dibuja en 1080×1920; una
// publicacion se queda en el perfil para siempre y va en 1080×1350, que es el
// formato mas alto que Instagram admite en el feed — y por tanto el que mas
// pantalla ocupa cuando alguien pasa el dedo.
//
// De la misma columna salen dos piezas, pensadas para publicarse en dias
// distintos de la misma semana:
//
//   1 · EL NUMERO  — azul, la cifra gigante. Es el gancho: abre la semana.
//   2 · LA FRASE   — crema, la frase destacada. Es la recompensa: cierra.
//
// Van al reves la una de la otra A PROPOSITO. Dos publicaciones seguidas con
// el mismo fondo azul se ven, en la cuadricula del perfil, como la misma
// publicacion puesta dos veces. Alternando azul y crema el perfil coge un
// ritmo, y se nota que detras hay una mano y no una plantilla.

import {
  cargarFuente, tipo, repartir, logo,
  NAVY, SOL, CREMA, MINT, TEAL, DIRECCION, entrecomillar,
} from './historia.js';
import { CANTERAS_WEB } from './publicar.js';

const ANCHO = 1080;
const ALTO = 1350;

// Contraste medido, que es lo que decide los colores de cada pieza:
//   sobre NAVY  → crema 8.67:1 · sol 6.92:1 · mint 5.54:1 · teal 2.35:1 ✗
//   sobre CREMA → navy 8.67:1 · teal 3.59:1 (solo texto grande) · sol 1.25:1 ✗
// De ahi que en la pieza crema el numero vaya en teal y grande, nunca en oro.

export const PUBLICACIONES = [
  { id: 'pub-numero', nombre: 'El número', dia: 'Para abrir la semana' },
  { id: 'pub-frase', nombre: 'La frase', dia: 'Para cerrarla', necesita: 'destaque' },
];

// ── Ayudas de dibujo, a la medida de esta pieza ──────────────────────────────

function bloque(ctx, texto, { y, tam, peso = 400, color, anchoMax, interlineado = 1.18, tamMin = 30, maxLineas = 6, medir = false }) {
  let t = tam;
  let lineas;
  for (;;) {
    ctx.font = tipo(t, peso);
    lineas = repartir(ctx, texto, anchoMax);
    if (lineas.length <= maxLineas || t <= tamMin) break;
    t -= 4;
  }
  const alto = t * interlineado;
  if (medir) return { alto: lineas.length * alto, lineas: lineas.length, tam: t };
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lineas.forEach((l, i) => ctx.fillText(l, ANCHO / 2, y + i * alto));
  return y + lineas.length * alto;
}

// El canvas no sabe de letter-spacing y una etiqueta en versalitas sin
// separacion se lee apelotonada. Se separa caracter a caracter.
function etiqueta(ctx, texto, y, color, tam = 28, sep = 8) {
  ctx.font = tipo(tam, 600);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const letras = String(texto).toUpperCase().split('');
  const ancho = letras.reduce((n, c) => n + ctx.measureText(c).width + sep, -sep);
  let x = (ANCHO - ancho) / 2;
  for (const c of letras) {
    ctx.fillText(c, x + ctx.measureText(c).width / 2, y);
    x += ctx.measureText(c).width + sep;
  }
  return y + tam * 1.35;
}

// Ajusta una sola linea al ancho disponible. El tamaño sale de medirla, no de
// contar cifras: «1.000.000» y «0,7» ocupan cosas muy distintas.
function encajarLinea(ctx, texto, { desde, hasta, anchoMax, peso = 600 }) {
  let t = desde;
  ctx.font = tipo(t, peso);
  while (ctx.measureText(texto).width > anchoMax && t > hasta) {
    t -= 6;
    ctx.font = tipo(t, peso);
  }
  return t;
}

// El pie va en TODAS las piezas y con la direccion legible. Una publicacion se
// comparte, se guarda y se reenvia: si no lleva de donde salio, no sirve de
// nada que sea bonita.
function pie(ctx, { sobreCrema = false } = {}) {
  const tinta = sobreCrema ? NAVY : CREMA;
  const linea = sobreCrema ? 'rgba(18,72,108,0.22)' : 'rgba(247,242,230,0.22)';
  const direccion = sobreCrema ? NAVY : SOL;

  logo(ctx, ANCHO / 2 - 26, ALTO - 210, 52, tinta);

  ctx.font = tipo(30, 600);
  ctx.fillStyle = tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('El Número', ANCHO / 2, ALTO - 144);

  ctx.strokeStyle = linea;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ANCHO / 2 - 130, ALTO - 98);
  ctx.lineTo(ANCHO / 2 + 130, ALTO - 98);
  ctx.stroke();

  ctx.font = tipo(32, 600);
  ctx.fillStyle = direccion;
  ctx.fillText(DIRECCION, ANCHO / 2, ALTO - 78);
}

// ── Pieza 1 · El número ──────────────────────────────────────────────────────

function piezaNumero(ctx, { numero, titulo, cantera, anchoMax }) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Un halo apenas perceptible detras de la cifra, para que no flote en plano.
  const g = ctx.createRadialGradient(ANCHO / 2, ALTO * 0.40, 60, ANCHO / 2, ALTO * 0.40, 700);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  const finEtiqueta = etiqueta(ctx, cantera || 'El Número', 150, MINT);

  const cifra = numero || '·';
  const t = encajarLinea(ctx, cifra, { desde: 360, hasta: 110, anchoMax });
  ctx.font = tipo(t, 600);
  // OJO: measureText devuelve el alto RESPECTO A LA LINEA BASE ACTIVA. Si se
  // mide con textBaseline en 'top' —como lo deja el bloque anterior— el alto
  // sale entero por debajo y la cifra termina encima de la etiqueta.
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(cifra);
  const subeNumero = m.actualBoundingBoxAscent || t * 0.72;
  const bajaNumero = m.actualBoundingBoxDescent || 0;

  const opcionesTitulo = {
    tam: 64, peso: 400, color: CREMA, anchoMax,
    interlineado: 1.22, tamMin: 36, maxLineas: 4,
  };
  const hueco = 86;
  const medTitulo = titulo
    ? bloque(ctx, titulo, { ...opcionesTitulo, medir: true })
    : { alto: 0 };

  // El conjunto —cifra y titulo— se centra entre la etiqueta y el pie. Antes
  // la cifra iba clavada al 44% de la altura y con titulos de una linea
  // quedaba medio palmo de vacio encima del pie.
  const arriba = finEtiqueta + 40;
  const abajoBanda = ALTO - 240;
  const altoGrupo = subeNumero + bajaNumero + (medTitulo.alto ? hueco + medTitulo.alto : 0);
  const y0 = arriba + (abajoBanda - arriba - altoGrupo) / 2;

  ctx.font = tipo(t, 600);
  ctx.fillStyle = SOL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';   // bloque(medir) la dejo en 'top'
  ctx.fillText(cifra, ANCHO / 2, y0 + subeNumero);

  if (titulo) {
    ctx.textBaseline = 'top';
    bloque(ctx, titulo, { ...opcionesTitulo, y: y0 + subeNumero + bajaNumero + hueco });
  }

  pie(ctx);
}

// ── Pieza 2 · La frase ───────────────────────────────────────────────────────

function piezaFrase(ctx, { numero, destaque, anchoMax }) {
  ctx.fillStyle = CREMA;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  const finEtiqueta = etiqueta(ctx, 'El Número', 150, TEAL);

  const cita = entrecomillar(destaque);
  const opciones = {
    tam: 76, peso: 400, color: NAVY, anchoMax,
    interlineado: 1.26, tamMin: 40, maxLineas: 7,
  };
  const med = bloque(ctx, cita, { ...opciones, medir: true });

  const tNum = numero ? encajarLinea(ctx, numero, { desde: 104, hasta: 54, anchoMax }) : 0;
  const hueco = numero ? 64 : 0;
  const altoNumero = numero ? tNum * 1.1 : 0;

  // La cita y el numero se centran como una sola pieza entre la etiqueta y el
  // pie. Colgados de arriba dejaban un vacio enorme debajo con frases cortas.
  const arriba = finEtiqueta + 40;
  const abajo = ALTO - 250;
  const y0 = arriba + (abajo - arriba - (med.alto + hueco + altoNumero)) / 2;

  const fin = bloque(ctx, cita, { ...opciones, y: y0 });

  if (numero) {
    ctx.font = tipo(tNum, 600);
    ctx.fillStyle = TEAL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(numero, ANCHO / 2, fin + hueco);
  }

  pie(ctx, { sobreCrema: true });
}

// ── Dibujar, nombrar y compartir ─────────────────────────────────────────────

export async function dibujarPublicacion(entrega, pieza = 'pub-numero') {
  await cargarFuente();
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext('2d');

  const margen = 100;
  const datos = {
    anchoMax: ANCHO - margen * 2,
    numero: String(entrega.numero || '').trim(),
    titulo: String(entrega.gancho || '').trim(),
    destaque: String(entrega.destaque || '').trim(),
    // La cantera se guarda como identificador («mujeres»); arriba de la pieza
    // tiene que leerse como en la web («Mujeres»).
    cantera: CANTERAS_WEB.find((c) => c.id === entrega.cantera)?.nombre || '',
  };

  if (pieza === 'pub-frase' && datos.destaque) piezaFrase(ctx, datos);
  else piezaNumero(ctx, datos);

  return lienzo;
}

export function nombrePublicacion(entrega, pieza) {
  const num = String(entrega.numero || 'post').replace(/[^a-zA-Z0-9]/g, '') || 'post';
  const cual = pieza === 'pub-frase' ? 'frase' : 'numero';
  return `publicacion-${num}-${cual}.png`;
}

function aBlob(lienzo) {
  return new Promise((res) => lienzo.toBlob(res, 'image/png'));
}

export async function compartirPublicacion(entrega, pieza = 'pub-numero') {
  const lienzo = await dibujarPublicacion(entrega, pieza);
  const blob = await aBlob(lienzo);
  const nombre = nombrePublicacion(entrega, pieza);
  const archivo = new File([blob], nombre, { type: 'image/png' });

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      return { compartido: true, nombre };
    } catch (e) {
      // Cancelar no es un fallo: no hay que caer a descargar por eso.
      if (e?.name === 'AbortError') return { compartido: false, cancelado: true, nombre };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { compartido: false, nombre };
}
