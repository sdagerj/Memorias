// Módulo de conexión con la API de Claude (Anthropic).
// La key se guarda solo en el dispositivo del usuario (IndexedDB).
import { getSetting } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function getApiKey() {
  return getSetting('claudeApiKey', '');
}

export function hasApiKey(key) {
  return typeof key === 'string' && key.startsWith('sk-ant-');
}

// Llama a la API de Claude y devuelve el texto de la respuesta.
// onChunk(text) se llama con cada fragmento si se quiere streaming visual.
export async function callClaude(prompt, { onChunk } = {}) {
  const key = await getApiKey();
  if (!hasApiKey(key)) throw new Error('NO_KEY');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('KEY_INVALID');
    if (res.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}
