// Cloudflare Worker — proxy para Memorias app
// Despliega este archivo en https://workers.cloudflare.com (plan gratuito)
// Pasos:
//   1. Crea una cuenta en cloudflare.com
//   2. Ve a Workers & Pages → Create → Create Worker
//   3. Reemplaza el código por este y haz Deploy
//   4. Copia la URL del worker (ej. https://memorias-proxy.tuusuario.workers.dev)
//   5. Pégala en Memorias → Ajustes → Claude API → URL del proxy

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://sdagerj.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
};

export default {
  async fetch(request) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = request.headers.get('x-api-key') || '';
    if (!apiKey.startsWith('sk-ant-')) {
      return new Response(JSON.stringify({ error: { message: 'API key inválida' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const body = await request.text();

    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  },
};
