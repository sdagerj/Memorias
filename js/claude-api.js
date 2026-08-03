// Módulo de conexión con la API de Claude (Anthropic).
// La key se guarda solo en el dispositivo del usuario (IndexedDB).
// Las llamadas pasan por un Cloudflare Worker propio para evitar el bloqueo CORS.
import { getSetting } from './db.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function getApiKey() {
  return getSetting('claudeApiKey', '');
}

export async function getProxyUrl() {
  return getSetting('claudeProxyUrl', '');
}

export function hasApiKey(key) {
  return typeof key === 'string' && key.startsWith('sk-ant-');
}

export function hasProxyUrl(url) {
  return typeof url === 'string' && url.startsWith('https://');
}

// Llama a la API de Claude a través del proxy Cloudflare Worker.
export async function callClaude(prompt) {
  const key = await getApiKey();
  if (!hasApiKey(key)) throw new Error('NO_KEY');

  const proxyUrl = await getProxyUrl();
  const endpoint = hasProxyUrl(proxyUrl) ? proxyUrl : ANTHROPIC_URL;

  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  };
  // El header especial solo se envía en llamadas directas al navegador (sin proxy)
  if (endpoint === ANTHROPIC_URL) {
    headers['anthropic-dangerous-direct-browser-calls'] = 'true';
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (networkErr) {
    throw new Error('NETWORK: ' + (networkErr.message || 'sin conexión'));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('KEY_INVALID');
    if (res.status === 429) throw new Error('RATE_LIMIT');
    throw new Error('HTTP_' + res.status + ': ' + (err?.error?.message || 'error desconocido'));
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}
