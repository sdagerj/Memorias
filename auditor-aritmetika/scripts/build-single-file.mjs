/**
 * Empaqueta el build en UN solo archivo HTML autocontenido.
 *
 * Sirve para usar la app sin servidor y sin instalar nada: se abre con doble
 * click. Como la app ya corre 100% en el cliente y no hace ninguna peticion de
 * red, inlinear el JS y el CSS no le quita nada.
 *
 * Se compila con SINGLE_FILE=1 para que el bundle salga como script clasico
 * (IIFE): abierto desde el disco (file://) un modulo ES queda sujeto a reglas
 * de origen que lo pueden bloquear, y un script clasico no.
 *
 *   npm run build:single
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD_DIR = join(ROOT, 'dist-single');
const ASSETS = join(BUILD_DIR, 'assets');
// Fuera de dist/ a proposito: 'npm run build' limpia esa carpeta y se llevaria
// por delante el archivo autocontenido.
const OUT_DIR = BUILD_DIR;
const OUT = join(OUT_DIR, 'auditor-aritmetika.html');

execFileSync('npx', ['vite', 'build'], {
  cwd: ROOT,
  env: { ...process.env, SINGLE_FILE: '1' },
  stdio: 'inherit',
});

const files = readdirSync(ASSETS);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No se encontro el bundle JS en dist-single/assets');

const js = readFileSync(join(ASSETS, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(ASSETS, cssFile), 'utf8') : '';

// Un "</script" dentro de un literal de texto cerraria la etiqueta antes de
// tiempo; escaparlo es inocuo para el codigo.
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auditor de Modelos Economicos — Aritmetika</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${safeJs}</script>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html);
console.log(`\nescrito ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
