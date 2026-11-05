// Módulo "Mi esencia": análisis introspectivo de los recuerdos con ayuda de Claude.
import * as db from './db.js';
import { callClaude, getApiKey, hasApiKey, describeApiKeyProblem } from './claude-api.js';

// Para que el texto quepa: los recuerdos más recientes, cada uno recortado.
const MAX_RECUERDOS = 60;
const MAX_CARACTERES = 1200;

const $ = (sel) => document.querySelector(sel);

// Prompt introspectivo que se envía a Claude junto con los recuerdos.
function buildEssencePrompt(entries, authorName) {
  const lines = [];
  lines.push(`Eres un guía introspectivo profundo y empático. Tu tarea es analizar los recuerdos personales de ${authorName || 'esta persona'} y revelarle quién es en esta etapa de su vida.`);
  lines.push('');
  lines.push('Con los recuerdos que te comparto a continuación, hazme un análisis introspectivo profundo que incluya:');
  lines.push('');
  lines.push('1. **Lo que me importa de verdad** — Qué temas, personas, momentos y emociones aparecen con más fuerza. Qué me mueve.');
  lines.push('2. **Mis valores en acción** — Qué valores se pueden ver en cómo vivo y qué elijo recordar. No lo que digo que valoro, sino lo que se ve en los hechos.');
  lines.push('3. **Quién soy en esta etapa** — Una imagen honesta y profunda de cómo estoy viviendo ahora. Qué emociones predominan. Qué tipo de persona emerge de estos recuerdos.');
  lines.push('4. **Lo que busco sin saberlo** — Qué anhelos, necesidades o deseos se intuyen entre líneas, aunque no los haya mencionado explícitamente.');
  lines.push('5. **Mi llamada en esta etapa** — Basándote en todo lo anterior, ¿hacia dónde parecen apuntar todos estos recuerdos? ¿Qué quiere emerger en esta etapa de mi vida?');
  lines.push('6. **Las historias que solo yo puedo contar** — Tres temas que salen de estos recuerdos y que podrían ser una columna de El Número (una cifra verificable + mi historia). Una línea cada uno, con la cifra que buscaría y en qué fuente primaria. No inventes cifras.');
  lines.push('');
  lines.push('Tono: cálido, honesto, sin clichés. Habla en segunda persona (tú). No hagas listas frías — escribe como si me hablaras directamente al alma. Extensión: 4-6 párrafos profundos.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('MIS RECUERDOS:');
  lines.push('');

  const sorted = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0)).slice(-MAX_RECUERDOS);
  sorted.forEach((e, i) => {
    const fecha = e.date ? ` (${e.date})` : '';
    const mood = e.mood ? ` — estado de ánimo: ${e.mood}` : '';
    const lugar = e.location?.place ? ` — lugar: ${e.location.place}` : '';
    lines.push(`[${i + 1}] ${e.title || 'Sin título'}${fecha}${mood}${lugar}`);
    if (e.text) lines.push(e.text.length > MAX_CARACTERES ? e.text.slice(0, MAX_CARACTERES) + '…' : e.text);
    lines.push('');
  });

  return lines.join('\n');
}

export async function initEssence() {
  const copyBtn = $('#essenceCopyBtn');
  const pasteArea = $('#essencePaste');
  const saveBtn = $('#essenceSaveBtn');
  const clearBtn = $('#essenceClearBtn');
  const profileEl = $('#essenceProfile');
  const emptyEl = $('#essenceEmpty');
  const countEl = $('#essenceCount');

  async function refreshProfile() {
    const saved = await db.getSetting('essenceProfile', null);
    const savedDate = await db.getSetting('essenceDate', null);
    const entries = await db.getAllEntries();
    countEl.textContent = `${entries.length} recuerdo${entries.length !== 1 ? 's' : ''} analizados`;

    if (saved) {
      profileEl.hidden = false;
      emptyEl.hidden = true;
      profileEl.querySelector('.essence-text').textContent = saved;
      profileEl.querySelector('.essence-date').textContent = savedDate
        ? `Generado el ${new Date(savedDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : '';
    } else {
      profileEl.hidden = true;
      emptyEl.hidden = false;
    }
  }

  async function guardar(v) {
    await db.setSetting('essenceProfile', v);
    await db.setSetting('essenceDate', new Date().toISOString());
    await refreshProfile();
  }

  copyBtn.addEventListener('click', async () => {
    const entries = await db.getAllEntries();
    if (!entries.length) {
      showToast('Aún no tienes recuerdos guardados');
      return;
    }
    const authorName = await db.getSetting('authorName', '');
    const text = buildEssencePrompt(entries, authorName);
    const key = await getApiKey();
    if (hasApiKey(key)) {
      copyBtn.disabled = true;
      copyBtn.textContent = 'Leyendo tus recuerdos…';
      try {
        await guardar(await callClaude(text));
        $('#essenceHint').hidden = true;
        profileEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Tu esencia está lista ✨');
      } catch (err) {
        const m = err && err.message;
        showToast(m === 'NO_KEY' || m === 'KEY_INVALID' ? 'Revisa tu API key en Ajustes → Claude API' : 'No se pudo conectar con Claude: ' + (m || 'error'));
      }
      copyBtn.disabled = false;
      copyBtn.textContent = '🔮 Ver mi esencia';
      return;
    }
    if (key) showToast('No se pudo usar tu API key. ' + describeApiKeyProblem(key));
    // Sin llave, el texto queda a la vista para copiarlo a claude.ai.
    pasteArea.value = text;
    $('#essenceHint').hidden = false;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado ✨ Pégalo en claude.ai y trae la respuesta');
    } catch {
      showToast('Copia el texto de la caja y pégalo en claude.ai');
    }
  });

  saveBtn.addEventListener('click', async () => {
    const v = pasteArea.value.trim();
    if (!v || v.startsWith('Eres un guía introspectivo')) {
      showToast('Primero pega la respuesta de Claude');
      return;
    }
    pasteArea.value = '';
    await guardar(v);
    showToast('Tu esencia guardada ✨');
  });

  clearBtn.addEventListener('click', () => {
    pasteArea.value = '';
  });

  document.getElementById('essenceResetBtn')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar tu perfil guardado y empezar de nuevo?')) return;
    await db.setSetting('essenceProfile', null);
    await db.setSetting('essenceDate', null);
    await refreshProfile();
  });

  await refreshProfile();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2600);
}
