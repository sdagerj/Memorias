// Módulo RSS: jala titulares de fuentes externas via rss2json proxy (sin backend propio).

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';

export async function fetchHeadlines(sources, maxPerSource = 8) {
  const results = [];
  await Promise.allSettled(
    sources
      .filter((s) => s.active)
      .map(async (source) => {
        try {
          const url = `${RSS2JSON}?rss_url=${encodeURIComponent(source.url)}&count=${maxPerSource}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return;
          const data = await res.json();
          if (data.status !== 'ok' || !Array.isArray(data.items)) return;
          for (const item of data.items) {
            results.push({
              source: source.name,
              category: source.category,
              title: item.title || '',
              pubDate: item.pubDate || '',
            });
          }
        } catch {
          // fuente no disponible — silencioso
        }
      })
  );
  return results;
}

export const DEFAULT_SOURCES = [
  // Colombia
  { id: 'semana',        name: 'Semana',              url: 'https://www.semana.com/rss/',                                                        category: 'general',   active: true  },
  { id: 'eltiempo',      name: 'El Tiempo',           url: 'https://www.eltiempo.com/rss/economia.xml',                                         category: 'economía',  active: true  },
  { id: 'portafolio',    name: 'Portafolio',          url: 'https://www.portafolio.co/rss/portafolio.xml',                                      category: 'economía',  active: true  },
  { id: 'dinero',        name: 'Dinero',              url: 'https://www.dinero.com/rss/home.xml',                                               category: 'economía',  active: true  },
  { id: 'larepublica',   name: 'La República',        url: 'https://www.larepublica.co/rss/economia',                                           category: 'economía',  active: true  },
  // Internacional español
  { id: 'bbc-mundo',     name: 'BBC Mundo',           url: 'https://feeds.bbci.co.uk/mundo/rss.xml',                                            category: 'general',   active: true  },
  { id: 'cnn-espanol',   name: 'CNN en Español',      url: 'https://cnnespanol.cnn.com/feed/',                                                  category: 'general',   active: true  },
  { id: 'elpais-eco',    name: 'El País Economía',    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada',  category: 'economía',  active: true  },
  { id: 'expansion-mx',  name: 'Expansión',           url: 'https://expansion.mx/rss/economia',                                                 category: 'economía',  active: true  },
  // Cultura y mujeres
  { id: 'elpais-cult',   name: 'El País Cultura',     url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada',   category: 'cultura',   active: true  },
  { id: 'forbes-women',  name: 'Forbes Women',        url: 'https://www.forbes.com/women/feed/',                                                category: 'mujeres',   active: true  },
  { id: 'forbes-co',     name: 'Forbes Colombia',     url: 'https://forbes.co/feed/',                                                           category: 'mujeres',   active: true  },
];
