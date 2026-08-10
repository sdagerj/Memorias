/**
 * Genera los iconos PNG de la app (para la pantalla de inicio del celular).
 *
 * Se escribe el PNG a mano con zlib en vez de traer una dependencia de imagen:
 * el icono es geometrico (fondo + lupa) y cabe en cien lineas. Los PNG quedan
 * versionados en public/icons, asi que esto solo se corre si se cambia el
 * diseno.
 *
 *   node scripts/generate-icons.mjs
 */
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'public', 'icons');

// Los mismos tokens del tema de la app: primary y primary-foreground.
const BG = [24, 54, 119]; // hsl(221 66% 28%)
const FG = [234, 242, 255];

// --- Codificador PNG minimo (RGBA, sin filtro) -----------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10..12 = compresion, filtro, entrelazado: todos 0

  // Cada fila lleva por delante su byte de filtro (0 = sin filtro).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Dibujo del icono -------------------------------------------------------

/** Distancia de un punto al segmento a-b: sirve para trazar la manija. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Cobertura suavizada: 1 dentro de la forma, 0 fuera, degradado en el borde. */
function coverage(distance, halfWidth, aa) {
  return Math.max(0, Math.min(1, (halfWidth - distance) / aa + 0.5));
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const aa = size / 64; // ancho del degradado del borde

  const cx = size * 0.44;
  const cy = size * 0.43;
  const radius = size * 0.2;
  const stroke = size * 0.075;

  // La manija arranca en el borde del aro, a 45 grados.
  const start = radius - stroke * 0.2;
  const handle = {
    ax: cx + Math.SQRT1_2 * start,
    ay: cy + Math.SQRT1_2 * start,
    bx: size * 0.76,
    by: size * 0.76,
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const ring = coverage(Math.abs(Math.hypot(px - cx, py - cy) - radius), stroke / 2, aa);
      const grip = coverage(
        distanceToSegment(px, py, handle.ax, handle.ay, handle.bx, handle.by),
        stroke / 2,
        aa,
      );
      const alpha = Math.max(ring, grip);

      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        rgba[i + ch] = Math.round(BG[ch] * (1 - alpha) + FG[ch] * alpha);
      }
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const png = drawIcon(size);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`escrito ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}
