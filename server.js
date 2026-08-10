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
    version: '3.0.0'
  });
});

/* =========================
   MANIFEST
========================= */

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.subtitlecat.serbianlatin',
    version: '3.0.0',
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
   FETCH JSON
========================= */

async function fetchJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} for ${url}`
    );
  }

  return await response.json();
}

/* =========================
   CINEMETA
========================= */

async function getMeta(type, id) {
  const cleanId = cleanImdbId(id);

  const url =
    `${CINEMETA}/meta/` +
    `${encodeURIComponent(type)}/` +
    `${encodeURIComponent(cleanId)}.json`;

  console.log('CINEMETA:', url);

  try {
    const data = await fetchJson(url);

    if (data && data.meta) {
      return data.meta;
    }

    return null;
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

  let title = '';
  let year = '';

  if (meta && meta.name) {
    title = String(meta.name);
  }

  if (meta && meta.releaseInfo) {
    const releaseInfo =
      String(meta.releaseInfo);

    const yearMatch =
      releaseInfo.match(
        /\b(?:19|20)\d{2}\b/
      );

    if (yearMatch) {
      year = yearMatch[0];
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

  return [
    ...new Set(queries)
  ]
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
   EXTRACT SUBTITLE LINKS
========================= */

function extractSubtitleLinks(html) {
  const results = [];

  const regex =
    /href=["']([^"']*\/subs\/[^"']+\.html(?:\?[^"']*)?)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const link =
      absoluteUrl(match[1]);

    if (
      link &&
      !results.includes(link)
    ) {
      results.push(link);
    }

    if (results.length >= 40) {
      break;
    }
  }

  return results;
}

/* =========================
   SUBTITLECAT SEARCH
========================= */

async function searchSubtitleCat(query) {
  const url =
    `${SUBTITLECAT}/index.php?search=` +
    `${encodeURIComponent(query)}&show=1000`;

  console.log(
    'SUBTITLECAT SEARCH:',
    url
  );

  const response = await fetch(url, {
    method: 'GET',

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

  return extractSubtitleLinks(html);
}

/* =========================
   TRANSLATOR DOWNLOAD URL
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

      /* Only movie and series */

      if (
        type !== 'movie' &&
        type !== 'series'
      ) {
        return res.json({
          subtitles: []
        });
      }

      /* Get metadata */

      const meta =
        await getMeta(type, id);

      /* Build search queries */

      let queries =
        buildSearchQueries(
          type,
          id,
          meta
        );

      /* Manual title */

      if (req.query.title) {
        queries.unshift(
          String(req.query.title)
        );
      }

      /* Fallback */

      if (queries.length === 0) {
        queries.push(
          'The Matrix 1999'
        );
      }

      console.log(
        'SEARCH QUERIES:',
        queries
      );

      /* Search SubtitleCat */

      const links = [];

      for (
        const query of [...new Set(queries)]
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

      console.log(
        'SUBTITLES FOUND:',
        links.length
      );

      /* Build Stremio subtitles */

      const subtitles = [];

      for (
        let index = 0;
        index < links.length;
        index++
      ) {
        const detailUrl =
          links[index];

        const subtitle = {
          id:
            `subtitlecat-srp-${index}`,

          url:
            makeDownloadUrl(
              detailUrl
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

      /* Cache */

      res.setHeader(
        'Cache-Control',
        'public, max-age=300'
      );

      return res.json({
        subtitles: subtitles
      });

    } catch (error) {
      console.error(
        'SUBTITLE ERROR:',
        error
      );

      return res
        .status(200)
        .json({
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
        query: query,
        resultsFound:
          links.length,
        results: links
      });

    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,
          error: error.message
        });
    }
  }
);

/* =========================
   TEST TRANSLATOR
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
        return res
          .status(400)
          .json({
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
          method: 'GET',

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
      return res
        .status(500)
        .json({
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
        `${SUBTITLECAT}/index.php?` +
        `search=The%20Matrix%201999&show=1000`;

      const response =
        await fetch(url, {
          method: 'GET',

          headers: {
            'User-Agent':
              'Mozilla/5.0'
          },

          redirect: 'follow'
        });

      const html =
        await response.text();

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
          extractSubtitleLinks(
            html
          ).slice(0, 10)
      });

    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,
          error: error.message
        });
    }
  }
);

/* =========================
   START SERVER
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
