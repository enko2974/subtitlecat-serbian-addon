const express = require("express");

const app = express();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});


/* =========================================
   STREMIO MANIFEST
   ========================================= */

app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "3.0.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  });
});


/* =========================================
   HOME
   ========================================= */

app.get("/", (req, res) => {
  res.send("SubtitleCat Serbian Latin addon is running.");
});


/* =========================================
   GEMINI TEST
   ========================================= */

app.get("/test-gemini", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is missing"
      });
    }

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Reply with exactly: GEMINI OK"
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        gemini: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({
      ok: true,
      message: text.trim()
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


/* =========================================
   SUBTITLECAT SEARCH
   ========================================= */

async function searchSubtitleCat(query) {
  const searchUrl =
    "https://subtitlecat.com/index.php?search=" +
    encodeURIComponent(query) +
    "&show=1000";

  console.log("SubtitleCat search:", searchUrl);

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const html = await response.text();

  console.log("SubtitleCat status:", response.status);
  console.log("SubtitleCat HTML length:", html.length);

  if (!response.ok) {
    throw new Error(
      "SubtitleCat returned HTTP " + response.status
    );
  }

  return html;
}


/* =========================================
   EXTRACT SUBTITLE LINKS
   ========================================= */

function extractSubtitleLinks(html) {
  const results = [];

  const regex =
    /href=["']([^"']*\/subs\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    let href = match[1];
    let title = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!href.startsWith("http")) {
      href = "https://subtitlecat.com" + href;
    }

    if (
      !results.some(
        item => item.url === href
      )
    ) {
      results.push({
        url: href,
        title: title
      });
    }
  }

  return results;
}


/* =========================================
   TEST SEARCH
   ========================================= */

app.get("/test-search", async (req, res) => {
  try {
    const query =
      req.query.q || "The Matrix 1999";

    const html =
      await searchSubtitleCat(query);

    const results =
      extractSubtitleLinks(html);

    res.json({
      ok: true,
      query,
      htmlLength: html.length,
      resultsFound: results.length,
      results: results.slice(0, 20)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


/* =========================================
   GET SUBTITLECAT DETAIL PAGE
   ========================================= */

async function getSubtitlePage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(
      "Subtitle detail page returned HTTP " +
      response.status
    );
  }

  return html;
}


/* =========================================
   FIND DOWNLOAD URL
   ========================================= */

function extractDownloadUrl(html) {
  const patterns = [
    /href=["']([^"']+)["'][^>]*download/gi,
    /href=["']([^"']*download[^"']*)["']/gi,
    /href=["']([^"']+\.srt[^"']*)["']/gi
  ];

  for (const regex of patterns) {
    const match = regex.exec(html);

    if (match && match[1]) {
      let url = match[1];

      if (!url.startsWith("http")) {
        url = "https://subtitlecat.com" + url;
      }

      return url;
    }
  }

  return null;
}


/* =========================================
   DOWNLOAD ORIGINAL SUBTITLE
   ========================================= */

async function downloadSubtitle(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept":
        "text/plain,text/srt,*/*"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      "Subtitle download failed: HTTP " +
      response.status
    );
  }

  return text;
}


/* =========================================
   GEMINI TRANSLATION
   ========================================= */

async function translateToSerbianLatin(srt) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const prompt = `
Translate the following subtitle file to Serbian Latin.

Rules:

- Serbian language.
- Latin alphabet only.
- Preserve the exact SRT numbering.
- Preserve the exact timestamps.
- Do not add explanations.
- Do not add markdown.
- Do not remove subtitle entries.
- Translate only the dialogue text.
- Keep names and proper nouns natural.
- Return ONLY valid SRT.

SUBTITLE:

${srt}
`;

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      "Gemini HTTP " +
      response.status +
      ": " +
      JSON.stringify(data)
    );
  }

  let result =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  result = result
    .replace(/^```srt\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return result;
}


/* =========================================
   STREMIO SUBTITLE ENDPOINT
   ========================================= */

app.get(
  "/subtitles/:type/:id.json",
  async (req, res) => {

    try {

      const type = req.params.type;
      const imdbId = req.params.id;

      console.log(
        "Stremio request:",
        type,
        imdbId
      );

      /*
       * Temporary title lookup.
       *
       * For testing tt0133093 we know:
       * The Matrix 1999
       */

      let searchQuery = "";

      if (imdbId === "tt0133093") {
        searchQuery = "The Matrix 1999";
      } else {
        searchQuery = imdbId;
      }

      const html =
        await searchSubtitleCat(searchQuery);

      const subtitles =
        extractSubtitleLinks(html);

      console.log(
        "SubtitleCat results:",
        subtitles.length
      );

      if (!subtitles.length) {
        return res.json({
          subtitles: []
        });
      }

      /*
       * For the first working version,
       * return SubtitleCat entries directly.
       *
       * Translation is performed when
       * the subtitle URL is opened.
       */

      const output = subtitles
        .slice(0, 10)
        .map((item, index) => {

          const translatedUrl =
            "/translate?url=" +
            encodeURIComponent(item.url);

          return {
            id:
              "subtitlecat-srp-" +
              index,

            url:
              `${req.protocol}://${req.get("host")}${translatedUrl}`,

            lang: "srp",

            label:
              "🇷🇸 Serbian Latin" +
              (item.title
                ? " (" + item.title + ")"
                : "")
          };
        });

      res.json({
        subtitles: output
      });

    } catch (error) {

      console.error(
        "STREMIO ERROR:",
        error
      );

      res.status(200).json({
        subtitles: []
      });
    }
  }
);


/* =========================================
   TRANSLATE ENDPOINT
   ========================================= */

app.get("/translate", async (req, res) => {

  try {

    const url = req.query.url;

    if (!url) {
      return res.status(400).send(
        "Missing subtitle URL"
      );
    }

    console.log(
      "Downloading subtitle:",
      url
    );

    const detailHtml =
      await getSubtitlePage(url);

    const downloadUrl =
      extractDownloadUrl(detailHtml);

    if (!downloadUrl) {
      return res.status(502).send(
        "Could not find subtitle download URL"
      );
    }

    console.log(
      "Download URL:",
      downloadUrl
    );

    const original =
      await downloadSubtitle(downloadUrl);

    if (!original || original.length < 20) {
      return res.status(502).send(
        "Subtitle file is empty"
      );
    }

    console.log(
      "Original subtitle length:",
      original.length
    );

    const translated =
      await translateToSerbianLatin(original);

    res.setHeader(
      "Content-Type",
      "application/x-subrip; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      'inline; filename="serbian-latin.srt"'
    );

    res.send(translated);

  } catch (error) {

    console.error(
      "TRANSLATION ERROR:",
      error
    );

    res.status(502).send(
      "Translation error: " +
      error.message
    );
  }
});


/* =========================================
   START SERVER
   ========================================= */

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "SubtitleCat Serbian Latin proxy running on port " +
      PORT
    );
  }
);
