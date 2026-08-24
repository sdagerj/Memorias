// Generar la imagen de una historia de Instagram desde una entrega.
//
// Instagram no deja publicar historias sin registrar una aplicación en Meta,
// pasar su revisión y mantener un servidor con la llave — y aun así saldrían
// sin stickers ni enlace. Lo que de verdad quita trabajo no es el último toque,
// es hacer la imagen. Eso se hace aquí, y se publica desde Instagram como
// siempre, con sus stickers y su enlace.
//
// Se dibuja en un canvas de 1080×1920, la medida exacta de una historia.

const ANCHO = 1080;
const ALTO = 1920;

// Los colores de la marca, los mismos del LEEME.txt y de la web.
const NAVY = '#12486c';
const NAVY_HONDO = '#0e3a58';
const SOL = '#f4da55';
const CREMA = '#f7f2e6';
const MINT = '#8fd0c8';

// Contraste medido sobre el navy: crema 8.67:1 · sol 6.92:1 · mint 5.54:1.
// El teal da 2.35:1, así que no se usa para texto sobre azul.

export const PLANTILLAS = [
  { id: 'numero', nombre: 'El número' },
  { id: 'destaque', nombre: 'La frase' },
  { id: 'titulo', nombre: 'El título' },
];

// La fuente de la marca. Sin ella el canvas caería a una genérica y la historia
// no se parecería a la web, que es justo lo que se quiere evitar.
//
// Son las mismas instancias estáticas que usan las imágenes de compartir de la
// web, con las cifras ALINEADAS congeladas: Cormorant trae por defecto cifras
// de estilo antiguo, donde el 3 y el 4 bajan de la línea. En un número gigante
// eso desalinea la pieza entera — y en la web las cifras van alineadas, así que
// la historia y la web tienen que enseñar el número igual.
let fuenteLista = null;
async function cargarFuente() {
  if (fuenteLista) return fuenteLista;
  fuenteLista = (async () => {
    try {
      await Promise.all([
        new FontFace('CormorantHistoria', 'url(./fonts/cormorant-latin-400.ttf)', { weight: '400' }),
        new FontFace('CormorantHistoria', 'url(./fonts/cormorant-latin-600.ttf)', { weight: '600' }),
      ].map(async (f) => { await f.load(); document.fonts.add(f); }));
      return true;
    } catch {
      return false;   // se dibuja igual, con una serif del sistema
    }
  })();
  return fuenteLista;
}

function tipo(tam, peso = 400) {
  return `${peso} ${tam}px CormorantHistoria, Georgia, "Times New Roman", serif`;
}

// Parte el texto en líneas que quepan en un ancho dado.
function repartir(ctx, texto, anchoMax) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > anchoMax && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Escribe un bloque centrado y devuelve dónde acaba. Si no cabe, encoge la
// letra: es preferible a recortar la frase de alguien.
function bloque(ctx, texto, { y, tam, peso = 400, color, anchoMax, interlineado = 1.18, tamMin = 28, medir = false }) {
  let t = tam;
  let lineas;
  for (;;) {
    ctx.font = tipo(t, peso);
    lineas = repartir(ctx, texto, anchoMax);
    if (lineas.length <= 6 || t <= tamMin) break;
    t -= 4;
  }
  const alto = t * interlineado;
  // En modo medir solo se calcula cuánto ocupará, para poder centrar el
  // conjunto antes de pintar nada.
  if (medir) return { alto: lineas.length * alto, lineas: lineas.length, tam: t };
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lineas.forEach((l, i) => ctx.fillText(l, ANCHO / 2, y + i * alto));
  return y + lineas.length * alto;
}

function etiqueta(ctx, texto, y, color = MINT) {
  ctx.font = tipo(30, 600);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // El canvas no sabe de letter-spacing: se separa carácter a carácter.
  const letras = String(texto).toUpperCase().split('');
  const sep = 8;
  const ancho = letras.reduce((n, c) => n + ctx.measureText(c).width + sep, -sep);
  let x = (ANCHO - ancho) / 2;
  for (const c of letras) {
    ctx.fillText(c, x + ctx.measureText(c).width / 2, y);
    x += ctx.measureText(c).width + sep;
  }
  return y + 40;
}

function fondo(ctx) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Un halo muy leve tras el centro para que el número no flote en plano.
  // Nada de degradados vistosos: la marca no los lleva.
  const g = ctx.createRadialGradient(ANCHO / 2, ALTO * 0.42, 60, ANCHO / 2, ALTO * 0.42, 900);
  g.addColorStop(0, 'rgba(255,255,255,0.045)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);
}

// La N del logo, dibujada como polígono para no depender de cargar un archivo.
function logo(ctx, x, y, tam) {
  const e = tam / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(e, e);
  ctx.fillStyle = CREMA;
  const puntos = [[14, 85], [14, 15], [26, 15], [74, 72], [74, 15], [86, 15], [86, 85], [74, 85], [26, 28], [26, 85]];
  ctx.beginPath();
  puntos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = SOL;
  ctx.beginPath();
  ctx.arc(77, 19, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function pie(ctx, texto) {
  logo(ctx, ANCHO / 2 - 30, ALTO - 260, 60);
  ctx.font = tipo(34, 600);
  ctx.fillStyle = CREMA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('El Número', ANCHO / 2, ALTO - 180);
  if (texto) {
    ctx.font = tipo(28, 400);
    ctx.fillStyle = 'rgba(247,242,230,0.62)';
    ctx.fillText(texto, ANCHO / 2, ALTO - 132);
  }
}

export async function dibujarHistoria(entrega, plantilla = 'numero') {
  await cargarFuente();
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext('2d');
  fondo(ctx);

  const margen = 110;
  const anchoMax = ANCHO - margen * 2;
  const numero = String(entrega.numero || '').trim();
  const titulo = String(entrega.gancho || '').trim();
  const destaque = String(entrega.destaque || '').trim();

  if (plantilla === 'destaque' && destaque) {
    etiqueta(ctx, 'El Número', 300);

    const cita = `«${destaque}»`;
    const opciones = { tam: 92, peso: 400, color: CREMA, anchoMax, interlineado: 1.22, tamMin: 46 };
    const med = bloque(ctx, cita, { ...opciones, medir: true });

    let t = 120;
    ctx.font = tipo(t, 600);
    while (numero && ctx.measureText(numero).width > anchoMax && t > 60) {
      t -= 6;
      ctx.font = tipo(t, 600);
    }
    const hueco = numero ? 80 : 0;
    const altoNumero = numero ? t * 1.1 : 0;

    // El conjunto —cita y número— se centra como una sola pieza entre la
    // etiqueta de arriba y el pie. Antes colgaba de arriba y dejaba un vacío
    // enorme debajo.
    const disponible = (ALTO - 300) / 2 + 300 - 60;
    const y0 = disponible - (med.alto + hueco + altoNumero) / 2;

    const fin = bloque(ctx, cita, { ...opciones, y: y0 });
    if (numero) {
      ctx.fillStyle = SOL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(numero, ANCHO / 2, fin + hueco);
    }
    pie(ctx, 'elnumero.pages.dev');
    return lienzo;
  }

  if (plantilla === 'titulo') {
    etiqueta(ctx, 'Esta semana', 300);
    if (numero) {
      let t = 200;
      ctx.font = tipo(t, 600);
      while (ctx.measureText(numero).width > anchoMax && t > 90) {
        t -= 8;
        ctx.font = tipo(t, 600);
      }
      ctx.fillStyle = SOL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(numero, ANCHO / 2, 420);
    }
    const finTitulo = bloque(ctx, titulo, {
      y: 720, tam: 88, peso: 400, color: CREMA, anchoMax, interlineado: 1.2, tamMin: 44,
    });
    // La llamada va pegada al título, no anclada al pie: si no, con títulos
    // cortos quedaba un vacío de medio metro entre las dos.
    ctx.font = tipo(34, 400);
    ctx.fillStyle = MINT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Léelo completo →', ANCHO / 2, finTitulo + 90);
    pie(ctx, 'elnumero.pages.dev');
    return lienzo;
  }

  // Por defecto: el número manda, que es de lo que va la marca.
  etiqueta(ctx, 'El Número', 340);

  // El tamaño sale del ancho disponible, no de contar cifras: «1.000.000» y
  // «0,7» ocupan cosas muy distintas, y un número que se sale del margen es el
  // fallo más fácil de cometer aquí.
  let tamNumero = 420;
  ctx.font = tipo(tamNumero, 600);
  while (ctx.measureText(numero || '·').width > anchoMax && tamNumero > 120) {
    tamNumero -= 10;
    ctx.font = tipo(tamNumero, 600);
  }

  // Y la separación con el título se mide de verdad, no se estima: estimarla
  // hacía que el título se montara encima del número.
  const m = ctx.measureText(numero || '·');
  const base = ALTO * 0.44;
  ctx.fillStyle = SOL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(numero || '·', ANCHO / 2, base);
  const abajo = base + (m.actualBoundingBoxDescent || 0);

  ctx.textBaseline = 'top';
  bloque(ctx, titulo, {
    y: abajo + 120, tam: 72, peso: 400,
    color: CREMA, anchoMax, interlineado: 1.22, tamMin: 40,
  });

  pie(ctx, 'elnumero.pages.dev');
  return lienzo;
}

export function nombreHistoria(entrega, plantilla) {
  const num = String(entrega.numero || 'historia').replace(/[^a-zA-Z0-9]/g, '') || 'historia';
  return `historia-${num}-${plantilla}.png`;
}

function aBlob(lienzo) {
  return new Promise((res) => lienzo.toBlob(res, 'image/png'));
}

// Comparte con el menú del teléfono si se puede — que es lo que lleva a
// Instagram en dos toques — y si no, descarga el archivo.
export async function compartirHistoria(entrega, plantilla = 'numero') {
  const lienzo = await dibujarHistoria(entrega, plantilla);
  const blob = await aBlob(lienzo);
  const nombre = nombreHistoria(entrega, plantilla);
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
