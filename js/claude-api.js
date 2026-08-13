// Módulo de conexión con la API de Claude (Anthropic).
// La key se guarda solo en el dispositivo del usuario (IndexedDB).
// Las llamadas pasan por un Cloudflare Worker propio para evitar el bloqueo CORS.
import { getSetting } from './db.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function getApiKey() {
  // Se normaliza tambien al leer: puede haber una clave ya guardada con los
  // guiones cambiados por el teclado, de antes de que existiera esta limpieza.
  return normalizeApiKey(await getSetting('claudeApiKey', ''));
}

export async function getProxyUrl() {
  return getSetting('claudeProxyUrl', '');
}

// Los teclados de móvil "corrigen" los guiones y las comillas por versiones
// tipográficas (— – " ') y a veces cuelan espacios invisibles al pegar. Una
// clave con cualquiera de esos caracteres hace que fetch falle antes de salir
// a la red, con un error incomprensible sobre ISO-8859-1. Aquí se deshace esa
// corrección: son sustituciones seguras porque una clave de Anthropic solo
// contiene ASCII.
export function normalizeApiKey(raw) {
  return String(raw || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')      // guiones tipograficos y signo menos
    .replace(/[\u2018\u2019\u201B]/g, "'")      // comillas simples curvas
    .replace(/[\u201C\u201D\u201F]/g, '"')      // comillas dobles curvas
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');  // espacios y caracteres invisibles
}

// Devuelve null si la clave es utilizable, o una explicación de qué le pasa.
export function describeApiKeyProblem(key) {
  if (!key) return 'Escribe tu clave de Anthropic.';
  if (!key.startsWith('sk-ant-')) return 'La clave debe empezar por sk-ant-…';
  const malo = [...key].find((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126);
  if (malo) {
    const pos = [...key].indexOf(malo) + 1;
    return `La clave tiene un carácter no válido en la posición ${pos} (${JSON.stringify(malo)}). ` +
           'Suele pasar al copiarla: bórrala y pégala de nuevo sin espacios.';
  }
  return null;
}

export function hasApiKey(key) {
  return typeof key === 'string' && key.startsWith('sk-ant-') && !describeApiKeyProblem(key);
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
