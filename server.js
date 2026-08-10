const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 10000;

const SUBTITLECAT = 'https://subtitlecat.com';
const CINEMETA = 'https://v3-cinemeta.strem.io';
const TRANSLATOR =
  'https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app';

app.disable('x-powered-by');

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

/* =========================
   HOME
========================= */

app.get('/', (req, res) => {
  res.type('text').send(
    'SubtitleCat Serbian Latin addon is running.'
  );
});

/* =========================
   HEALTH
========================= */

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    addon: 'SubtitleCat Serbian Latin',
    version: '4.0.0'
  });
});

/* =========================
   MANIFEST
========================= */

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.subtitlecat.serbianlatin',
    version: '4.0.0',
    name: 'SubtitleCat Serbian Latin',
    description: 'SubtitleCat subtitles translated to Serbian Latin',
    logo: 'https://www.stremio.com/website/stremio-logo-small.png',
    resources: [
      {
        name: 'subtitles',
        types: ['movie', 'series'],
        idPrefixes: ['tt']
      }
    ],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
  });
});

/* =========================
   HELPERS
========================= */

function cleanImdbId(id) {
  return String(id || '').split(':')[0];
}

function getSeriesParts(id) {
  const parts = String(id || '').split(':');

  if (parts.length >= 3) {
    return {
      season: parts[1],
      episode: parts[2]
    };
  }

  return {
    season: null,
    episode: null
  };
}

/* =========================
   CINEMETA
========================= */

async function getMeta(type, id) {
  const cleanId = cleanImdbId(id);

  const url =
    `${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(cleanId)}.json`;

  console.log('CINEMETA:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return data && data.meta ? data.meta : null;
  } catch (error) {
    console.error(
      'CINEMETA ERROR:',
      error.message
    );

    return null;
  }
}

/* =========================
   SEARCH QUERIES
========================= */

function buildSearchQueries(type, id, meta) {
  const queries = [];

  const title =
    meta && meta.name
      ? String(meta.name)
      : '';

  let year = '';

  if (meta && meta.releaseInfo) {
    const match =
      String(meta.releaseInfo).match(
        /\b(?:19|20)\d{2}\b/
      );

    if (match) {
      year = match[0];
    }
  }

  if (type === 'series') {
    const parts = getSeriesParts(id);

    if (
      title &&
      parts.season &&
      parts.episode
    ) {
      const season =
        String(parts.season).padStart(2, '0');

      const episode =
        String(parts.episode).padStart(2, '0');

      queries.push(
        `${title} S${season}E${episode}`
      );

      if (year) {
        queries.push(
          `${title} ${year} S${season}E${episode}`
        );
      }
    }
  }

  if (title && year) {
    queries.push(
      `${title} ${year}`
    );
  }

  if (title) {
    queries.push(title);
  }

  return [...new Set(queries)]
    .filter(Boolean)
    .slice(0, 4);
}

/* =========================
   ABSOLUTE URL
========================= */

function absoluteUrl(link) {
  try {
    return new URL(
      link,
      SUBTITLECAT
    ).href;
  } catch (error) {
    return null;
  }
}

/* =========================
   EXTRACT LINKS
========================= */

function extractSubtitleLinks(html) {
  const results = [];

  /*
   * SubtitleCat may change its HTML structure.
   *
   * Instead of relying only on /subs/,
   * inspect every href and select likely
   * subtitle/detail pages.
   */

  const hrefRegex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match;

  while (
    (match = hrefRegex.exec(html)) !== null
  ) {
    const rawLink =
      match[1].trim();

    if (!rawLink) {
      continue;
    }

    const link =
      absoluteUrl(rawLink);

    if (!link) {
      continue;
    }

    /*
     * Only keep SubtitleCat links.
     */

    if (
      !link.startsWith(
        SUBTITLECAT
      )
    ) {
      continue;
    }

    /*
     * Ignore normal website pages.
     */

    if (
      link.includes('/index.php')
    ) {
      continue;
    }

    if (
      link.includes('#')
    ) {
      continue;
    }

    if (
      link === SUBTITLECAT ||
      link === `${SUBTITLECAT}/`
    ) {
      continue;
    }

    /*
     * Look for common subtitle/detail
     * URL patterns.
     */

    const lower =
      link.toLowerCase();

    const looksLikeSubtitle =
      lower.includes('/subs/') ||
      lower.includes('subtitle') ||
      lower.includes('subtitles') ||
      lower.includes('/subtitle/') ||
      lower.endsWith('.html');

    if (!looksLikeSubtitle) {
      continue;
    }

    if (
      !results.includes(link)
    ) {
      results.push(link);
    }

    if (
      results.length >= 40
    ) {
      break;
    }
  }

  return results;
}

/* =========================
   SEARCH SUBTITLECAT
========================= */

async function searchSubtitleCat(query) {
  const url =
    `${SUBTITLECAT}/index.php?search=${encodeURIComponent(query)}&show=1000`;

  console.log(
    'SUBTITLECAT SEARCH:',
    url
  );

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',

      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },

    redirect: 'follow'
  });

  const html =
    await response.text();

  console.log(
    'SUBTITLECAT STATUS:',
    response.status
  );

  console.log(
    'SUBTITLECAT HTML LENGTH:',
    html.length
  );

  if (!response.ok) {
    return [];
  }

  const links =
    extractSubtitleLinks(html);

  console.log(
    'EXTRACTED LINKS:',
    links.length
  );

  if (links.length > 0) {
    console.log(
      'FIRST LINKS:',
      links.slice(0, 5)
    );
  }

  return links;
}

/* =========================
   DOWNLOAD URL
========================= */

function makeDownloadUrl(detailUrl) {
  const name =
    detailUrl.split('/').pop() ||
    'subtitle.html';

  return (
    `${TRANSLATOR}/api/subtitles/download` +
    `?detailUrl=${encodeURIComponent(detailUrl)}` +
    `&name=${encodeURIComponent(name)}`
  );
}

/* =========================
   STREMIO SUBTITLES
========================= */

app.get(
  '/subtitles/:type/:id.json',
  async (req, res) => {
    try {
      const type =
        req.params.type;

      const id =
        req.params.id;

      console.log(
        '========================================'
      );

      console.log(
        'STREMIO REQUEST:',
        type,
        id
      );

      if (
        type !== 'movie' &&
        type !== 'series'
      ) {
        return res.json({
          subtitles: []
        });
      }

      const meta =
        await getMeta(
          type,
          id
        );

      let queries =
        buildSearchQueries(
          type,
          id,
          meta
        );

      /*
       * Stremio may provide title
       */

      if (req.query.title) {
        queries.unshift(
          String(req.query.title)
        );
      }

      /*
       * Fallback
       */

      if (queries.length === 0) {
        queries.push(
          'The Matrix 1999'
        );
      }

      queries =
        [...new Set(queries)];

      console.log(
        'SEARCH QUERIES:',
        queries
      );

      const links = [];

      for (
        const query of queries
      ) {
        try {
          const found =
            await searchSubtitleCat(
              query
            );

          for (
            const link of found
          ) {
            if (
              !links.includes(link)
            ) {
              links.push(link);
            }

            if (
              links.length >= 30
            ) {
              break;
            }
          }
        } catch (error) {
          console.error(
            'SEARCH ERROR:',
            error.message
          );
        }

        if (
          links.length >= 30
        ) {
          break;
        }
      }

      const subtitles = [];

      for (
        let i = 0;
        i < links.length;
        i++
      ) {
        const subtitle = {
          id:
            `subtitlecat-srp-${i}`,

          url:
            makeDownloadUrl(
              links[i]
            ),

          lang: 'srp',

          label:
            '🇷🇸 Serbian Latin'
        };

        if (
          type === 'series'
        ) {
          subtitle.title =
            'Serbian Latin';
        }

        subtitles.push(
          subtitle
        );
      }

      console.log(
        'SUBTITLES FOUND:',
        subtitles.length
      );

      res.setHeader(
        'Cache-Control',
        'public, max-age=300'
      );

      return res.json({
        subtitles
      });

    } catch (error) {
      console.error(
        'SUBTITLE ERROR:',
        error
      );

      return res.status(200).json({
        subtitles: []
      });
    }
  }
);

/* =========================
   TEST SEARCH
========================= */

app.get(
  '/test-search',
  async (req, res) => {
    try {
      const query =
        String(
          req.query.q ||
          'The Matrix 1999'
        );

      const links =
        await searchSubtitleCat(
          query
        );

      return res.json({
        ok: true,
        query,
        resultsFound:
          links.length,
        results: links
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================
   TEST SUBTITLE
========================= */

app.get(
  '/test-subtitle',
  async (req, res) => {
    try {
      const detailUrl =
        String(
          req.query.detailUrl || ''
        );

      if (!detailUrl) {
        return res.status(400).json({
          ok: false,
          error:
            'Missing detailUrl'
        });
      }

      const url =
        makeDownloadUrl(
          detailUrl
        );

      console.log(
        'TRANSLATOR URL:',
        url
      );

      const response =
        await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0',

            'Accept':
              '*/*'
          },

          redirect: 'follow'
        });

      const body =
        await response.text();

      return res.json({
        ok: response.ok,

        status:
          response.status,

        contentType:
          response.headers.get(
            'content-type'
          ),

        length:
          body.length,

        preview:
          body.slice(0, 500)
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================
   DEBUG
========================= */

app.get(
  '/debug',
  async (req, res) => {
    try {
      const url =
        `${SUBTITLECAT}/index.php?search=The%20Matrix%201999&show=1000`;

      const response =
        await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0'
          },

          redirect: 'follow'
        });

      const html =
        await response.text();

      const extracted =
        extractSubtitleLinks(
          html
        );

      return res.json({
        ok: true,

        status:
          response.status,

        finalUrl:
          response.url,

        contentType:
          response.headers.get(
            'content-type'
          ),

        htmlLength:
          html.length,

        matrix:
          html
            .toLowerCase()
            .includes('matrix'),

        subtitleLinks:
          html.includes('/subs/'),

        captcha:
          html
            .toLowerCase()
            .includes('captcha'),

        cloudflare:
          html
            .toLowerCase()
            .includes('cloudflare'),

        extractedLinks:
          extracted.slice(0, 10)
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================
   START
========================= */

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `SubtitleCat Serbian Latin addon running on port ${PORT}`
    );
  }
);
