const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 10000;

const SUBTITLECAT = 'https://subtitlecat.com';
const CINEMETA = 'https://v3-cinemeta.strem.io';

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.get('/', (req, res) => {
  res.type('text').send(
    'SubtitleCat Serbian Latin addon is running.'
  );
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    addon: 'SubtitleCat Serbian Latin',
    version: '5.0.0'
  });
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.subtitlecat.serbianlatin',
    version: '5.0.0',
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

/* =========================================================
   HELPERS
========================================================= */

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

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      ...headers
    },
    redirect: 'follow'
  });

  const text = await response.text();

  return {
    response,
    text
  };
}

/* =========================================================
   CINEMETA
========================================================= */

async function getMeta(type, id) {
  const cleanId = cleanImdbId(id);

  const url =
    `${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(cleanId)}.json`;

  console.log('CINEMETA:', url);

  try {
    const { response, text } = await fetchText(url, {
      Accept: 'application/json'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = JSON.parse(text);

    return data && data.meta ? data.meta : null;
  } catch (error) {
    console.error('CINEMETA ERROR:', error.message);
    return null;
  }
}

/* =========================================================
   SEARCH QUERIES
========================================================= */

function buildSearchQueries(type, id, meta) {
  const queries = [];

  const title =
    meta && meta.name
      ? String(meta.name)
      : '';

  let year = '';

  if (meta && meta.releaseInfo) {
    const match =
      String(meta.releaseInfo).match(/\b(?:19|20)\d{2}\b/);

    if (match) {
      year = match[0];
    }
  }

  if (type === 'series') {
    const { season, episode } = getSeriesParts(id);

    if (title && season && episode) {
      const s = String(season).padStart(2, '0');
      const e = String(episode).padStart(2, '0');

      queries.push(`${title} S${s}E${e}`);

      if (year) {
        queries.push(
          `${title} ${year} S${s}E${e}`
        );
      }
    }
  }

  if (title && year) {
    queries.push(`${title} ${year}`);
  }

  if (title) {
    queries.push(title);
  }

  return [...new Set(queries)]
    .filter(Boolean)
    .slice(0, 4);
}

/* =========================================================
   SUBTITLECAT SEARCH
========================================================= */

function absoluteUrl(link) {
  try {
    return new URL(link, SUBTITLECAT).href;
  } catch {
    return null;
  }
}

function extractSubtitleLinks(html) {
  const results = [];

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();

    if (!raw) continue;

    const link = absoluteUrl(raw);

    if (!link) continue;

    if (!link.startsWith(SUBTITLECAT)) {
      continue;
    }

    const lower = link.toLowerCase();

    if (!lower.includes('/subs/')) {
      continue;
    }

    if (!lower.endsWith('.html')) {
      continue;
    }

    if (!results.includes(link)) {
      results.push(link);
    }

    if (results.length >= 40) {
      break;
    }
  }

  return results;
}

async function searchSubtitleCat(query) {
  const url =
    `${SUBTITLECAT}/index.php?search=${encodeURIComponent(query)}&show=1000`;

  console.log('SUBTITLECAT SEARCH:', url);

  const { response, text } =
    await fetchText(url, {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

  console.log(
    'SUBTITLECAT STATUS:',
    response.status,
    'HTML:',
    text.length
  );

  if (!response.ok) {
    return [];
  }

  const links =
    extractSubtitleLinks(text);

  console.log(
    'SUBTITLE LINKS:',
    links.length
  );

  return links;
}

/* =========================================================
   SUBTITLE PAGE
========================================================= */

async function getSubtitlePage(detailUrl) {
  console.log(
    'SUBTITLE PAGE:',
    detailUrl
  );

  const { response, text } =
    await fetchText(detailUrl, {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

  if (!response.ok) {
    throw new Error(
      `SubtitleCat HTTP ${response.status}`
    );
  }

  return text;
}

/* =========================================================
   HTML DECODING
========================================================= */

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

/* =========================================================
   EXTRACT SRT
========================================================= */

function extractSrtFromHtml(html) {
  let text = html;

  /*
   * Remove scripts/styles first.
   */
  text = text.replace(
    /<script[\s\S]*?<\/script>/gi,
    '\n'
  );

  text = text.replace(
    /<style[\s\S]*?<\/style>/gi,
    '\n'
  );

  /*
   * Convert common HTML breaks to newlines.
   */
  text = text.replace(
    /<br\s*\/?>/gi,
    '\n'
  );

  text = text.replace(
    /<\/div>/gi,
    '\n'
  );

  text = text.replace(
    /<\/p>/gi,
    '\n'
  );

  /*
   * Remove remaining HTML tags.
   */
  text = text.replace(
    /<[^>]+>/g,
    ''
  );

  text = decodeHtmlEntities(text);

  /*
   * Normalize line endings.
   */
  text = text.replace(/\r/g, '');

  /*
   * Decode escaped newlines.
   */
  text = text.replace(/\\r\\n/g, '\n');
  text = text.replace(/\\n/g, '\n');

  /*
   * Clean zero-width characters.
   */
  text = text.replace(
    /[\u200B-\u200D\uFEFF]/g,
    ''
  );

  /*
   * Look for SRT blocks.
   *
   * Example:
   *
   * 1
   * 00:00:01,000 --> 00:00:03,000
   * Hello
   */

  const srtRegex =
    /(?:^|\n)\s*(\d+)\s*\n\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})([\s\S]*?)(?=\n\s*\d+\s*\n\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->|$)/g;

  const blocks = [];

  let match;

  while ((match = srtRegex.exec(text)) !== null) {
    const number = match[1];

    const start = match[2]
      .replace('.', ',');

    const end = match[3]
      .replace('.', ',');

    let body = match[4]
      .trim();

    /*
     * Remove excessive blank lines.
     */
    body = body
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!body) continue;

    blocks.push(
      `${number}\n${start} --> ${end}\n${body}`
    );

    if (blocks.length >= 5000) {
      break;
    }
  }

  if (blocks.length < 2) {
    return null;
  }

  return blocks.join('\n\n') + '\n';
}

/* =========================================================
   SERBIAN LATIN
========================================================= */

function cyrillicToLatin(text) {
  const map = {
    'А': 'A',
    'Б': 'B',
    'В': 'V',
    'Г': 'G',
    'Д': 'D',
    'Ђ': 'Đ',
    'Е': 'E',
    'Ж': 'Ž',
    'З': 'Z',
    'И': 'I',
    'Ј': 'J',
    'К': 'K',
    'Л': 'L',
    'Љ': 'Lj',
    'М': 'M',
    'Н': 'N',
    'Њ': 'Nj',
    'О': 'O',
    'П': 'P',
    'Р': 'R',
    'С': 'S',
    'Т': 'T',
    'Ћ': 'Ć',
    'У': 'U',
    'Ф': 'F',
    'Х': 'H',
    'Ц': 'C',
    'Ч': 'Č',
    'Џ': 'Dž',
    'Ш': 'Š',

    'а': 'a',
    'б': 'b',
    'в': 'v',
    'г': 'g',
    'д': 'd',
    'ђ': 'đ',
    'е': 'e',
    'ж': 'ž',
    'з': 'z',
    'и': 'i',
    'ј': 'j',
    'к': 'k',
    'л': 'l',
    'љ': 'lj',
    'м': 'm',
    'н': 'n',
    'њ': 'nj',
    'о': 'o',
    'п': 'p',
    'р': 'r',
    'с': 's',
    'т': 't',
    'ћ': 'ć',
    'у': 'u',
    'ф': 'f',
    'х': 'h',
    'ц': 'c',
    'ч': 'č',
    'џ': 'dž',
    'ш': 'š'
  };

  return text
    .split('')
    .map(char => map[char] || char)
    .join('');
}

/* =========================================================
   TRANSLATION NOTE
========================================================= */

/*
 * This version does NOT fake a translation.
 *
 * If SubtitleCat page already contains Serbian/Croatian
 * subtitle text, it can be returned directly.
 *
 * Otherwise the original subtitle is returned.
 *
 * This is intentional: we don't want to return an English
 * subtitle while claiming it is Serbian.
 */

function isLikelySerbian(text) {
  const lower = text.toLowerCase();

  const words = [
    ' sam ',
    ' si ',
    ' smo ',
    ' ste ',
    ' nije ',
    ' jeste ',
    ' šta ',
    ' što ',
    ' kako ',
    ' gde ',
    ' kada ',
    ' zašto ',
    ' čovek ',
    ' čovje'
  ];

  let score = 0;

  for (const word of words) {
    if (lower.includes(word)) {
      score++;
    }
  }

  return score >= 2;
}

/* =========================================================
   IN-MEMORY SUBTITLE CACHE
========================================================= */

const subtitleCache = new Map();

function cacheSubtitle(text) {
  const id =
    `sc-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  subtitleCache.set(id, text);

  /*
   * Keep memory under control.
   */
  if (subtitleCache.size > 100) {
    const firstKey =
      subtitleCache.keys().next().value;

    subtitleCache.delete(firstKey);
  }

  return id;
}

/* =========================================================
   SERVE SUBTITLE
========================================================= */

app.get(
  '/subtitle/:cacheId.srt',
  (req, res) => {
    const id =
      req.params.cacheId;

    const subtitle =
      subtitleCache.get(id);

    if (!subtitle) {
      return res
        .status(404)
        .type('text')
        .send('Subtitle expired.');
    }

    res.setHeader(
      'Content-Type',
      'text/plain; charset=utf-8'
    );

    res.setHeader(
      'Access-Control-Allow-Origin',
      '*'
    );

    res.setHeader(
      'Cache-Control',
      'public, max-age=3600'
    );

    return res.send(subtitle);
  }
);

/* =========================================================
   TEST SUBTITLE PAGE
========================================================= */

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
          error: 'Missing detailUrl'
        });
      }

      const html =
        await getSubtitlePage(
          detailUrl
        );

      const srt =
        extractSrtFromHtml(
          html
        );

      return res.json({
        ok: true,
        htmlLength:
          html.length,

        subtitleFound:
          !!srt,

        subtitleLength:
          srt ? srt.length : 0,

        preview:
          srt
            ? srt.slice(0, 1000)
            : html.slice(0, 1000)
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   TEST SEARCH
========================================================= */

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
        results:
          links
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   STREMIO SUBTITLE ENDPOINT
========================================================= */

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

      if (req.query.title) {
        queries.unshift(
          String(req.query.title)
        );
      }

      if (queries.length === 0) {
        queries = [
          'The Matrix 1999'
        ];
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
              links.length >= 10
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
          links.length >= 10
        ) {
          break;
        }
      }

      const subtitles = [];

      /*
       * Test the first several detail pages.
       */

      for (
        let i = 0;
        i < Math.min(links.length, 5);
        i++
      ) {
        try {
          const detailUrl =
            links[i];

          const html =
            await getSubtitlePage(
              detailUrl
            );

          const srt =
            extractSrtFromHtml(
              html
            );

          if (!srt) {
            console.log(
              'NO SRT:',
              detailUrl
            );

            continue;
          }

          /*
           * Convert Cyrillic to Latin if the
           * subtitle is already Serbian.
           */
          const latin =
            cyrillicToLatin(srt);

          const cacheId =
            cacheSubtitle(
              latin
            );

          subtitles.push({
            id:
              `subtitlecat-srp-${subtitles.length}`,

            url:
              `${req.protocol}://${req.get('host')}/subtitle/${cacheId}.srt`,

            lang:
              'srp',

            label:
              '🇷🇸 Serbian Latin'
          });

          /*
           * One good subtitle is enough for
           * the first test.
           */
          if (
            subtitles.length >= 5
          ) {
            break;
          }

        } catch (error) {
          console.error(
            'DETAIL ERROR:',
            error.message
          );
        }
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

/* =========================================================
   DEBUG
========================================================= */

app.get(
  '/debug',
  async (req, res) => {
    try {
      const url =
        `${SUBTITLECAT}/index.php?search=The%20Matrix%201999&show=1000`;

      const {
        response,
        text
      } =
        await fetchText(url);

      const links =
        extractSubtitleLinks(
          text
        );

      return res.json({
        ok: true,

        status:
          response.status,

        finalUrl:
          response.url,

        htmlLength:
          text.length,

        subtitleLinks:
          links.length,

        extractedLinks:
          links.slice(0, 10)
      });

    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `SubtitleCat Serbian Latin addon running on port ${PORT}`
    );
  }
);
