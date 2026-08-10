/**
 * Empaqueta el build de produccion en UN solo archivo HTML autocontenido.
 *
 * Sirve para compartir la app sin servidor: se abre con doble click o se
 * publica tal cual. Como la app ya corre 100% en el cliente y no hace ninguna
 * peticion de red, inlinear el JS y el CSS no le quita nada.
 *
 *   npm run build && node scripts/build-single-file.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const ASSETS = join(DIST, 'assets');
const OUT = join(DIST, 'auditor-aritmetika.html');

const files = readdirSync(ASSETS);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No se encontro el bundle JS en dist/assets');

const js = readFileSync(join(ASSETS, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(ASSETS, cssFile), 'utf8') : '';

// Un "</script" dentro de un literal de texto cerraria la etiqueta antes de
// tiempo; escaparlo es inocuo para el codigo.
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>Auditor de Modelos Economicos — Aritmetika</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;

writeFileSync(OUT, html);
console.log(`escrito ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
