const express = require("express");

const app = express();

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";

const SUBTITLECAT =
  "https://subtitlecat.com";

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "*"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --------------------------------------------------
// MANIFEST
// --------------------------------------------------

app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",
    logo:
      "https://www.stremio.com/website/stremio-logo-small.png",
    resources: [
      {
        name: "subtitles",
        types: ["movie", "series"],
        idPrefixes: ["tt"]
      }
    ],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  });
});

// --------------------------------------------------
// STREMIO SUBTITLE ENDPOINT
// --------------------------------------------------

app.get(
  "/subtitles/:type/:id.json",
  async (req, res) => {
    try {
      const target =
        `${UPSTREAM}/subtitles/` +
        `${req.params.type}/` +
        `${req.params.id}.json`;

      console.log("Proxying:", target);

      const response = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      });

      const text = await response.text();

      console.log(
        "Upstream status:",
        response.status
      );

      console.log(
        "Upstream content-type:",
        response.headers.get("content-type")
      );

      res.status(response.status);

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.send(text);

    } catch (error) {
      console.error(
        "SUBTITLE PROXY ERROR:",
        error
      );

      res.status(502).json({
        error: "Subtitle proxy error",
        message: error.message
      });
    }
  }
);

// --------------------------------------------------
// SUBTITLE DOWNLOAD PROXY
// --------------------------------------------------

app.get(
  "/api/subtitles/download",
  async (req, res) => {
    try {
      const query = new URLSearchParams();

      for (
        const [key, value]
        of Object.entries(req.query)
      ) {
        if (typeof value === "string") {
          query.set(key, value);
        }
      }

      const target =
        `${UPSTREAM}/api/subtitles/download?` +
        query.toString();

      console.log(
        "Proxying subtitle download:",
        target
      );

      const response = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        }
      });

      const body =
        await response.arrayBuffer();

      res.status(response.status);

      const contentType =
        response.headers.get(
          "content-type"
        );

      res.setHeader(
        "Content-Type",
        contentType ||
          "text/plain; charset=utf-8"
      );

      res.send(Buffer.from(body));

    } catch (error) {
      console.error(
        "DOWNLOAD PROXY ERROR:",
        error
      );

      res.status(502).send(
        "Subtitle download proxy error"
      );
    }
  }
);

// --------------------------------------------------
// TEST SEARCH
// --------------------------------------------------

app.get("/test-search", async (req, res) => {
  try {
    const q =
      req.query.q ||
      "The Matrix 1999";

    const searchUrl =
      `${SUBTITLECAT}/index.php?search=` +
      `${encodeURIComponent(q)}&show=1000`;

    console.log(
      "SubtitleCat search:",
      searchUrl
    );

    const response = await fetch(
      searchUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }
    );

    const html =
      await response.text();

    const regex =
      /href\s*=\s*["']([^"']*\/subs\/[^"']+)["']/gi;

    const results = [];

    let match;

    while (
      (match = regex.exec(html)) !== null
    ) {
      let href = match[1];

      if (href.startsWith("//")) {
        href = "https:" + href;
      } else if (href.startsWith("/")) {
        href =
          SUBTITLECAT + href;
      } else if (
        href.startsWith("subs/")
      ) {
        href =
          SUBTITLECAT + "/" + href;
      }

      let name = href
        .split("/")
        .pop();

      try {
        name = decodeURIComponent(
          name
        );
      } catch (e) {
        // keep original name
      }

      name = name.replace(
        /\.html$/i,
        ""
      );

      results.push({
        url: href,
        name: name
      });
    }

    // Remove duplicates
    const unique = [];

    const seen = new Set();

    for (const item of results) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        unique.push(item);
      }
    }

    res.json({
      ok: true,
      query: q,
      status: response.status,
      htmlLength: html.length,
      resultsFound: unique.length,
      results: unique
    });

  } catch (error) {
    console.error(
      "TEST SEARCH ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// --------------------------------------------------
// DEBUG SUBTITLECAT
// --------------------------------------------------

app.get(
  "/debug-subtitlecat",
  async (req, res) => {
    try {
      const url =
        `${SUBTITLECAT}/index.php?search=` +
        `The%20Matrix%201999&show=1000`;

      const response = await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          }
        }
      );

      const html =
        await response.text();

      const lower =
        html.toLowerCase();

      const words = [
        "matrix",
        "cookie",
        "captcha",
        "cloudflare",
        "subtitle",
        "search",
        "result",
        "javascript"
      ];

      const found = {};

      for (const word of words) {
        found[word] =
          lower.includes(word);
      }

      const links = [];

      const regex =
        /href\s*=\s*["']([^"']+)["']/gi;

      let match;

      while (
        (match = regex.exec(html)) !== null
      ) {
        const href = match[1];

        if (
          href
            .toLowerCase()
            .includes("subtitle") ||
          href
            .toLowerCase()
            .includes(".html") ||
          href
            .toLowerCase()
            .includes("/subs/")
        ) {
          links.push(href);
        }
      }

      res.json({
        ok: true,
        status: response.status,
        contentType:
          response.headers.get(
            "content-type"
          ),
        htmlLength: html.length,
        found: found,
        linksFound: links.length,
        links: links.slice(0, 100)
      });

    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
  res.send(
    "SubtitleCat Serbian Latin proxy is running."
  );
});

// --------------------------------------------------
// SERVER
// --------------------------------------------------

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SubtitleCat Serbian Latin proxy running on port ${PORT}`
    );
  }
);
