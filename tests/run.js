// Pruebas de extremo a extremo sobre la app real, en un navegador de verdad.
//
// Existen porque cada fallo que llegó a producción era de los que una prueba
// caza en segundos: una comilla curva, una caja que no se rellenaba, un texto
// que se sustituía por vacío. Ejecutar esto antes de desplegar es la diferencia
// entre encontrarlos aquí o que los encuentre quien usa la app.
//
//   node tests/run.js
//
// Requisitos: node, playwright-core y un Chromium. Ver tests/README.md.

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = 8123;
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function servir() {
  return new Promise((listo) => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const abs = path.join(RAIZ, rel);
      if (!abs.startsWith(RAIZ) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs)] || 'application/octet-stream' });
      res.end(fs.readFileSync(abs));
    });
    s.listen(PUERTO, () => listo(s));
  });
}

// ── mini marco de pruebas ────────────────────────────────────────────────────
let pasadas = 0, fallos = [];
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { pasadas++; console.log(`  ✓ ${nombre}`); }
  else { fallos.push(nombre + (detalle ? ` — ${detalle}` : '')); console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`); }
}

async function nuevaPagina(navegador, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, ...opciones });
  const p = await ctx.newPage();
  p.erroresJS = [];
  p.on('pageerror', (e) => p.erroresJS.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(`http://localhost:${PUERTO}/index.html`);
  await p.waitForTimeout(900);
  return p;
}

// ── las pruebas ──────────────────────────────────────────────────────────────
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('La app arranca sin errores de JavaScript', async (b) => {
  const p = await nuevaPagina(b);
  comprobar('sin errores al cargar', p.erroresJS.length === 0, p.erroresJS.join(' | '));
  comprobar('la barra de pestañas se ve', await p.isVisible('.tabbar'));
  for (const v of ['timeline', 'book', 'numero', 'essence', 'settings']) {
    await p.click(`.tab[data-view="${v}"]`);
    await p.waitForTimeout(350);
    comprobar(`la pestaña ${v} se abre`, await p.isVisible(`#view-${v}.active`));
  }
  comprobar('navegar no produjo errores', p.erroresJS.length === 0, p.erroresJS.join(' | '));
});

prueba('Un recuerdo se guarda y sobrevive a recargar', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.fill('#entryTitle', 'Mi primer recuerdo');
  await p.fill('#entryText', 'El texto que no se puede perder.');
  await p.click('#saveEntry'); await p.waitForTimeout(700);
  comprobar('aparece en la lista', await p.locator('.entry-card').count() === 1);
  await p.reload(); await p.waitForTimeout(1100);
  comprobar('sigue ahí tras recargar', await p.locator('.entry-card').count() === 1);
  comprobar('conserva el título',
    (await p.locator('.entry-card h3').first().textContent()).includes('Mi primer recuerdo'));
});

prueba('Cerrar el editor con cambios pide confirmación', async (b) => {
  const p = await nuevaPagina(b);
  let preguntó = false;
  p.on('dialog', () => { preguntó = true; });
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.fill('#entryText', 'Texto sin guardar');
  await p.click('#cancelEntry'); await p.waitForTimeout(400);
  comprobar('avisa antes de descartar', preguntó);
});

prueba('Escape cierra el editor cuando no hay cambios', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  comprobar('se cierra con Escape', !(await p.isVisible('#editor')));
});

prueba('Buscar sin resultados explica qué pasa', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.fill('#entryTitle', 'Playa'); await p.click('#saveEntry'); await p.waitForTimeout(700);
  await p.fill('#searchInput', 'zzzznoexiste'); await p.waitForTimeout(350);
  comprobar('no deja la pantalla en blanco', await p.isVisible('#noResults'));
  comprobar('el contador refleja la búsqueda', (await p.textContent('#memCount')).includes('/'));
});

prueba('Las fotos de la lista no se fugan al buscar', async (b) => {
  const p = await nuevaPagina(b);
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 400;
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
    const db = await import('/js/db.js');
    for (let i = 0; i < 3; i++) {
      await db.saveEntry({ id: 'f' + i, title: 'foto ' + i, text: 'memoria', date: '2026-01-0' + (i + 1),
        photos: [{ name: 'a.jpg', blob }], createdAt: Date.now() });
    }
  });
  await p.reload(); await p.waitForTimeout(1000);
  await p.evaluate(() => {
    window.__c = 0; window.__r = 0;
    const o = URL.createObjectURL, r = URL.revokeObjectURL;
    URL.createObjectURL = function (x) { window.__c++; return o.call(URL, x); };
    URL.revokeObjectURL = function (x) { window.__r++; return r.call(URL, x); };
  });
  await p.type('#searchInput', 'memoria', { delay: 25 });
  await p.waitForTimeout(400);
  const { c, r } = await p.evaluate(() => ({ c: window.__c, r: window.__r }));
  comprobar('se liberan casi todas las URLs creadas', r >= c - 3, `creadas ${c}, liberadas ${r}`);
});

prueba('El editorial se guarda solo y se puede recuperar', async (b) => {
  const p = await nuevaPagina(b);
  const TEXTO = 'Editorial que costó una hora.';
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.fill('#numNumero', '18'); await p.fill('#numEditorial', TEXTO);
  await p.waitForTimeout(1800);
  await p.reload(); await p.waitForTimeout(1100);          // nunca se pulsó Guardar
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(900);
  comprobar('ofrece recuperar el borrador', await p.isVisible('#numDraftBanner'));
  await p.click('#numDraftRestore'); await p.waitForTimeout(500);
  comprobar('el texto vuelve íntegro', (await p.inputValue('#numEditorial')) === TEXTO);
});

prueba('Aplicar corrección nunca vacía el editorial', async (b) => {
  const ORIG = 'Mi editorial original.';
  const NUEVO = 'El 18 es lo que cuesta una hora de tu tiempo.';
  const casos = [
    ['empieza por ---', `---\n\n${NUEVO}\n\n---\n\n**Nota editorial**\nMejoré el ritmo.`],
    ['nota al final', `${NUEVO}\n\n---\nNota editorial\nok.`],
    ['solo comentarios', '**Nota editorial**\nSolo comentarios.'],
    ['solo separadores', '---\n\n---'],
  ];
  for (const [nombre, respuesta] of casos) {
    const p = await nuevaPagina(b);
    await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
    await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
    await p.fill('#numNumero', '18'); await p.fill('#numEditorial', ORIG);
    await p.evaluate(() => { document.querySelector('#numCorreccionPanel').hidden = false; });
    await p.fill('#numCorreccionPaste', respuesta);
    await p.click('#numAplicarCorreccion'); await p.waitForTimeout(500);
    const d = (await p.inputValue('#numEditorial')).trim();
    comprobar(`«${nombre}» no borra el editorial`, d !== '', 'quedó vacío');
    await p.close();
  }
});

prueba('La corrección propone cambios uno a uno y respeta lo no marcado', async (b) => {
  const ORIG = 'Ayer fuí al mercado y compre tres cosas. La vendedora, me dijo que subió.';
  const RESP = ['===CAMBIO===', 'ANTES: fuí', 'DESPUÉS: fui', 'MOTIVO: ortografía', '',
                '===CAMBIO===', 'ANTES: compre tres cosas', 'DESPUÉS: compré tres cosas', 'MOTIVO: error de dedo', '',
                '===CAMBIO===', 'ANTES: no existe en el texto', 'DESPUÉS: da igual', 'MOTIVO: ortografía'].join('\n');
  const p = await nuevaPagina(b);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.fill('#numNumero', '18'); await p.fill('#numEditorial', ORIG);
  await p.evaluate(() => { document.querySelector('#numCorreccionPanel').hidden = false; });
  await p.fill('#numCorreccionPaste', RESP); await p.waitForTimeout(600);

  comprobar('lista los cambios', await p.locator('.cambio').count() === 3);
  comprobar('marca el que no se encuentra', await p.locator('.cambio.perdido').count() === 1);
  comprobar('no permite aplicar el no encontrado', await p.locator('.cambio input:checked').count() === 2);

  await p.locator('.cambio input:not(:disabled)').nth(1).uncheck();
  await p.click('#numAplicarSeleccion'); await p.waitForTimeout(600);
  const d = await p.inputValue('#numEditorial');
  comprobar('aplica el marcado', d.includes('Ayer fui'));
  comprobar('NO toca el desmarcado', d.includes('compre tres'));
  comprobar('conserva el resto del texto', d.includes('La vendedora, me dijo que subió.'));
  await p.click('#numUndoCorreccion'); await p.waitForTimeout(400);
  comprobar('deshacer devuelve el original', (await p.inputValue('#numEditorial')) === ORIG);
});

prueba('La corrección localiza el fragmento aunque Claude lo cite distinto', async (b) => {
  // El fallo real: Claude citaba el "ANTES" con comillas curvas, guion largo o
  // una tilde de menos, includes() no lo encontraba, el cambio salia gris, y
  // pulsar "Corregir" no corregia nada.
  const ORIG = 'Ella dijo “hola” — y se fué a casa.\n\nPero volvió mañana temprano.';
  const RESP = ['===CAMBIO===', 'ANTES: y se fué a casa', 'DESPUÉS: y se fue a casa', 'MOTIVO: ortografía', '',
                '===CAMBIO===', 'ANTES: Pero  volvio\nmanana', 'DESPUÉS: Pero volvió al día siguiente', 'MOTIVO: claridad'].join('\n');
  const p = await nuevaPagina(b);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.fill('#numNumero', '9'); await p.fill('#numEditorial', ORIG);
  await p.evaluate(() => { document.querySelector('#numCorreccionPanel').hidden = false; });
  await p.fill('#numCorreccionPaste', RESP); await p.waitForTimeout(600);

  comprobar('ninguno queda sin localizar', await p.locator('.cambio.perdido').count() === 0);
  await p.click('#numAplicarSeleccion'); await p.waitForTimeout(600);
  const d = await p.inputValue('#numEditorial');
  comprobar('aplica el de la tilde', d.includes('y se fue a casa'));
  comprobar('aplica el citado con espacios y sin tildes', d.includes('Pero volvió al día siguiente'));
  comprobar('respeta las comillas curvas del original', d.includes('“hola” —'));
});

prueba('Publicar valida antes de subir y arma el archivo de la web', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);

  const faltantes = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    return m.problemasParaPublicar({ numero: '52%', gancho: 'Un título' });
  });
  comprobar('avisa de lo que falta', faltantes.length >= 3, faltantes.join(' | '));
  comprobar('pide el resumen', faltantes.some((f) => f.includes('resumen')));

  const md = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    const e = { numero: '52%', gancho: 'La cifra: "clave"', fecha: '2026-08-24',
                resumen: 'Un resumen.', cantera: 'mercados',
                editorial: 'Primero.\n\nSegundo.', destaque: 'Frase suelta.',
                fuentes: [{ nombre: 'DANE', documento: 'GEIH', anio: '2026', url: 'https://dane.gov.co' }] };
    return { texto: m.construirMarkdown(e), archivo: m.nombreArchivo(e.fecha, e.gancho),
             problemas: m.problemasParaPublicar(e) };
  });
  comprobar('sin problemas cuando está completo', md.problemas.length === 0, md.problemas.join(' | '));
  comprobar('entrecomilla el número', md.texto.includes('numero: "52%"'));
  comprobar('escapa las comillas del título', md.texto.includes('titulo: "La cifra: \\"clave\\""'));
  comprobar('mete la fuente', md.texto.includes('nombre: "DANE"') && md.texto.includes('anio: 2026'));
  comprobar('destaca la frase como cita', md.texto.includes('> Frase suelta.'));
  comprobar('el nombre del archivo sale de la fecha y el título',
    md.archivo === '2026-08-24-la-cifra-clave.md', md.archivo);

  // Sin llave de GitHub el boton no puede quedarse mudo: tiene que dar el
  // archivo para subirlo a mano.
  await p.fill('#numNumero', '52'); await p.fill('#numGancho', 'Prueba');
  await p.fill('#numEditorial', 'Un texto.'); await p.fill('#numResumen', 'Resumen corto.');
  await p.selectOption('#numCantera', 'mercados');
  await p.click('#numPublicarBtn'); await p.waitForTimeout(800);
  comprobar('ofrece el archivo a mano sin llave', await p.locator('#numPubMd').count() === 1);
  const contenido = await p.inputValue('#numPubMd');
  comprobar('el archivo ofrecido lleva el editorial', contenido.includes('Un texto.'));
});

prueba('Los párrafos del editor se separan como los quiere Markdown', async (b) => {
  // En el editor un parrafo se separa del siguiente con un solo Enter. Sin
  // traducirlo, Markdown pega todo el editorial en un unico bloque ilegible.
  const p = await nuevaPagina(b);
  const r = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    const e = { numero: '300', gancho: 'Los Medici', fecha: '2026-08-21',
                resumen: 'R', cantera: 'vida',
                editorial: 'Primero.\nSegundo.\n\n\nTercero.  \n' };
    return { md: m.construirMarkdown(e), sep: m.separarParrafos('Uno.\nDos.') };
  });
  comprobar('un Enter se vuelve renglón en blanco', r.sep === 'Uno.\n\nDos.', r.sep);
  comprobar('no deja líneas pegadas', !/Primero\.\nSegundo/.test(r.md));
  comprobar('separa los tres párrafos', r.md.includes('Primero.\n\nSegundo.\n\nTercero.'));
});

prueba('Un borrador no promete una dirección que da 404', async (b) => {
  const p = await nuevaPagina(b);
  const r = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    const e = { numero: '1', gancho: 'T', fecha: '2026-01-01', resumen: 'R',
                cantera: 'vida', editorial: 'X', borrador: true };
    return { md: m.construirMarkdown(e) };
  });
  comprobar('marca el borrador en el archivo', r.md.includes('borrador: true'));
});

prueba('Una fuente con enlace inválido no llega a la web', async (b) => {
  const p = await nuevaPagina(b);
  const problemas = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    const base = { numero: '1', gancho: 'T', fecha: '2026-01-01', resumen: 'R', cantera: 'vida', editorial: 'X' };
    return {
      urlMala: m.problemasParaPublicar({ ...base, fuentes: [{ nombre: 'DANE', url: 'dane.gov.co' }] }),
      sinNombre: m.problemasParaPublicar({ ...base, fuentes: [{ documento: 'Informe' }] }),
      vacia: m.problemasParaPublicar({ ...base, fuentes: [] }),
    };
  });
  comprobar('rechaza un enlace sin http', problemas.urlMala.length === 1);
  comprobar('rechaza una fuente sin institución', problemas.sinNombre.length === 1);
  comprobar('permite publicar sin fuentes', problemas.vacia.length === 0);
});

prueba('La llave de GitHub se limpia de lo que cambia el teclado', async (b) => {
  const p = await nuevaPagina(b);
  const r = await p.evaluate(async () => {
    const m = await import('./js/publicar.js');
    return {
      limpia: m.normalizeToken(' github_pat_11ABC\u2010DEF '),
      buena: m.describeTokenProblem('github_pat_11ABCDEF'),
      mala: m.describeTokenProblem('sk-ant-api03-xxx'),
      vacia: m.describeTokenProblem(''),
    };
  });
  comprobar('endereza el guion tipográfico', r.limpia === 'github_pat_11ABC-DEF', r.limpia);
  comprobar('acepta una llave con forma correcta', r.buena === null);
  comprobar('rechaza una key de Claude por error', typeof r.mala === 'string');
  comprobar('avisa si no hay llave', typeof r.vacia === 'string');
});

prueba('El prompt de corrección no invita a reescribir', async (b) => {
  const p = await nuevaPagina(b);
  await p.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    get() { return { writeText: () => Promise.reject(new DOMException('x')) }; },
  }));
  await p.reload(); await p.waitForTimeout(900);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.fill('#numNumero', '18'); await p.fill('#numEditorial', 'Texto base.');
  await p.click('#numCorreccionBtn'); await p.waitForTimeout(1500);
  const prompt = await p.inputValue('#numCorreccionPaste');
  comprobar('pide solo ortografía y puntuación', /solo ortograf[íi]a, puntuaci[óo]n/i.test(prompt));
  comprobar('prohíbe reescribir frases correctas', /No reescribas frases que ya son correctas/i.test(prompt));
  comprobar('prohíbe conectores y rayas largas', /No agregues conectores ni rayas largas/i.test(prompt));
  comprobar('pide el formato de cambios', prompt.includes('===CAMBIO==='));
  comprobar('ya no pide cuidar el arco ni el ritmo', !/claridad y ritmo|El arco:/i.test(prompt));
});

prueba('Las ideas rotan de cantera y evitan lo ya publicado', async (b) => {
  const p = await nuevaPagina(b);
  await p.evaluate(async () => {
    const db = await import('/js/db.js');
    await db.saveNumber({ id: 'n1', numero: '600', gancho: 'Lo del arte', editorial: 'x', createdAt: '2026-08-01' });
  });
  await p.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    get() { return { writeText: () => Promise.reject(new DOMException('x')) }; },
  }));
  await p.reload(); await p.waitForTimeout(900);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.click('#numIdeaBtn'); await p.waitForTimeout(9000);
  const prompt = await p.inputValue('#numIdeaPaste');
  comprobar('incluye lo ya publicado', prompt.includes('YA PUBLICADO') && prompt.includes('Lo del arte'));
  comprobar('exige canteras distintas', /canteras distintas entre s[íi]/i.test(prompt));
  comprobar('exige algo fuera de economía', /NO sea econom[íi]a ni mercados/i.test(prompt));
  comprobar('pide 4 candidatos, no 3', /Prop[óo]n 4 n[úu]meros/i.test(prompt));
  const canteras = (prompt.match(/^\(\d+\) .+$/gm) || []).length;
  comprobar('ofrece más de cinco canteras', canteras >= 6, `${canteras} canteras`);
});

prueba('Los botones de Claude siempre dan texto para copiar', async (b) => {
  const p = await nuevaPagina(b);
  // Safari: el portapapeles falla fuera del gesto del usuario.
  await p.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    get() { return { writeText: () => Promise.reject(new DOMException('x')) }; },
  }));
  await p.reload(); await p.waitForTimeout(900);
  await p.click('.tab[data-view="numero"]'); await p.waitForTimeout(500);
  await p.click('#newNumeroBtn'); await p.waitForTimeout(300);
  await p.fill('#numNumero', '18'); await p.fill('#numEditorial', 'Texto base.');
  for (const [btn, caja] of [['#numCorreccionBtn', '#numCorreccionPaste'],
                             ['#numMontajeBtn', '#numMontajePaste'],
                             ['#numPodcastBtn', '#numPodcastPaste']]) {
    await p.click(btn); await p.waitForTimeout(1500);
    comprobar(`${btn} rellena su caja`, (await p.inputValue(caja)).length > 100);
  }
});

prueba('Exportar y fusionar traslada recuerdos, libros y entregas', async (b) => {
  const pc = await nuevaPagina(b);
  const copia = await pc.evaluate(async () => {
    const db = await import('/js/db.js');
    await db.saveEntry({ id: 'e1', title: 'Recuerdo', text: 't', date: '2026-05-01', photos: [], createdAt: 1 });
    await db.saveBook({ id: 'b1', title: 'Libro del PC', entryIds: ['e1'], updatedAt: 5000 });
    await db.saveNumber({ id: 'n1', numero: '600', gancho: 'g', editorial: 'e', createdAt: '2026-05-01' });
    return db.exportBackup();
  });
  comprobar('la copia incluye el libro', copia.books.length === 1);

  const cel = await nuevaPagina(b);
  const r = await cel.evaluate(async (bk) => {
    const db = await import('/js/db.js');
    const res = await db.mergeBackup(bk);
    return { res, libros: (await db.getAllBooks()).length, entregas: (await db.getAllNumbers()).length };
  }, copia);
  comprobar('el libro llega al fusionar', r.libros === 1);
  comprobar('la entrega llega al fusionar', r.entregas === 1);
  comprobar('el recuerdo llega al fusionar', r.res.added === 1);

  const r2 = await cel.evaluate(async (bk) => {
    const db = await import('/js/db.js');
    await db.mergeBackup(bk);
    return (await db.getAllBooks()).length;
  }, copia);
  comprobar('fusionar dos veces no duplica', r2 === 1);
});

prueba('Las copias automáticas recuperan un recuerdo borrado', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.fill('#entryTitle', 'Recuerdo valioso');
  await p.click('#saveEntry'); await p.waitForTimeout(900);
  await p.click('.entry-card'); await p.waitForTimeout(300);
  await p.click('#deleteEntry'); await p.waitForTimeout(900);
  comprobar('se borró', await p.locator('.entry-card').count() === 0);
  await p.click('.tab[data-view="settings"]'); await p.waitForTimeout(900);
  comprobar('hay copias listadas', await p.locator('.snap-row').count() > 0);
  await p.locator('.snap-row button').first().click(); await p.waitForTimeout(1200);
  await p.click('.tab[data-view="timeline"]'); await p.waitForTimeout(600);
  comprobar('el recuerdo vuelve', await p.locator('.entry-card').count() === 1);
});

prueba('Ajustes avisa si el navegador no guarda nada', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('.tab[data-view="settings"]'); await p.waitForTimeout(1200);
  comprobar('sin alarma cuando todo va bien', !(await p.isVisible('#stBlocked')));
  comprobar('muestra la versión', /^v\d+$/.test((await p.textContent('#appVersion')).trim()),
    await p.textContent('#appVersion'));

  const p2 = await b.newContext({ viewport: { width: 390, height: 844 } }).then((c) => c.newPage());
  await p2.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() { return { open() { const r = {}; setTimeout(() => r.onerror && r.onerror(), 10); return r; } }; },
    });
  });
  await p2.goto(`http://localhost:${PUERTO}/index.html`); await p2.waitForTimeout(1500);
  await p2.click('.tab[data-view="settings"]'); await p2.waitForTimeout(1200);
  comprobar('avisa cuando el almacenamiento está bloqueado', await p2.isVisible('#stBlocked'));
});

prueba('La API key se limpia de lo que cambia el teclado', async (b) => {
  const p = await nuevaPagina(b);
  const r = await p.evaluate(async () => {
    const { normalizeApiKey, describeApiKeyProblem } = await import('/js/claude-api.js');
    const prueba = (k) => {
      const limpia = normalizeApiKey(k);
      let cabecera = true;
      try { new Headers({ 'x-api-key': limpia }); } catch { cabecera = false; }
      return { cabecera, problema: describeApiKeyProblem(limpia) };
    };
    return {
      guionLargo: prueba('sk-ant—api03-AbC123'),
      invisible: prueba('sk-ant-api03​AbC123'),
      buena: prueba('sk-ant-api03-AbC123_xyz'),
      mala: prueba('sk-ant-api03-Abñ123'),
    };
  });
  comprobar('el guion largo se corrige', r.guionLargo.cabecera && !r.guionLargo.problema);
  comprobar('el carácter invisible se quita', r.invisible.cabecera && !r.invisible.problema);
  comprobar('una clave buena pasa', r.buena.cabecera && !r.buena.problema);
  comprobar('una clave imposible se rechaza con motivo', !!r.mala.problema);
});

prueba('El PDF de un recuerdo abre y cierra sin atascar la app', async (b) => {
  const p = await nuevaPagina(b);
  await p.click('#fab'); await p.waitForTimeout(250);
  await p.fill('#entryTitle', 'Para PDF'); await p.fill('#entryText', 'Contenido.');
  await p.click('#saveEntry'); await p.waitForTimeout(800);
  await p.click('.entry-card'); await p.waitForTimeout(400);
  await p.click('#exportEntryPdfBtn'); await p.waitForTimeout(600);
  comprobar('el botón de guardar existe', await p.locator('#printOverlayPrint').count() === 1);
  comprobar('el botón de cerrar existe', await p.locator('#printOverlayClose').count() === 1);
  comprobar('sin errores al abrir el PDF', p.erroresJS.length === 0, p.erroresJS.join(' | '));
  await p.click('#printOverlayClose'); await p.waitForTimeout(400);
  comprobar('se cierra y devuelve la app', await p.locator('#printOverlay').count() === 0);
});

prueba('El código no tiene comillas tipográficas en atributos HTML', async () => {
  const archivos = ['js/app.js', 'js/numero.js', 'js/db.js', 'js/claude-api.js', 'js/publicar.js', 'index.html'];
  for (const f of archivos) {
    const txt = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    const malas = txt.match(/=\s*[“”]/g);
    comprobar(`${f} sin comillas curvas en atributos`, !malas, malas ? malas.length + ' casos' : '');
  }
});

// ── ejecutar ─────────────────────────────────────────────────────────────────
(async () => {
  const servidor = await servir();
  const navegador = await chromium.launch({ executablePath: EXE });
  console.log('\nPruebas de Memorias\n' + '='.repeat(60));
  for (const [nombre, fn] of pruebas) {
    console.log(`\n${nombre}`);
    try { await fn(navegador); }
    catch (err) { fallos.push(`${nombre} — ${err.message}`); console.log(`  ✗ excepción: ${err.message}`); }
  }
  await navegador.close();
  servidor.close();

  console.log('\n' + '='.repeat(60));
  console.log(`${pasadas} comprobaciones correctas, ${fallos.length} fallos`);
  if (fallos.length) {
    console.log('\nFALLOS:');
    fallos.forEach((f) => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('Todo en orden.\n');
})();
