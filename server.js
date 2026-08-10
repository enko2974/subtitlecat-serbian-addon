```javascript
const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const SUBTITLECAT = "https://subtitlecat.com";

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --------------------------------------------------
// HOME
// --------------------------------------------------

app.get("/", (req, res) => {
  res.send("SubtitleCat Serbian Latin proxy is running.");
});

// --------------------------------------------------
// MANIFEST
// --------------------------------------------------

app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.2",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",
    logo: "https://www.stremio.com/website/stremio-logo-small.png",
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
// TEST SUBTITLECAT SEARCH
// --------------------------------------------------

app.get("/test-search", async (req, res) => {
  try {
    const query =
      req.query.q || "The Matrix 1999";

    const url =
      SUBTITLECAT +
      "/index.php?search=" +
      encodeURIComponent(query) +
      "&show=1000";

    console.log("Searching SubtitleCat:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await response.text();

    console.log("SubtitleCat status:", response.status);
    console.log("HTML length:", html.length);

    // Find subtitle links
    const regex =
      /href=["']([^"']*subs\/[^"']+\.html)["']/gi;

    const results = [];

    let match;

    while ((match = regex.exec(html)) !== null) {
      let href = match[1];

      if (!href.startsWith("http")) {
        href = SUBTITLECAT + "/" + href.replace(/^\/+/, "");
      }

      if (!results.includes(href)) {
        results.push(href);
      }
    }

    res.json({
      ok: true,
      query,
      status: response.status,
      htmlLength: html.length,
      resultsFound: results.length,
      results
    });
  } catch (error) {
    console.error("SEARCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// --------------------------------------------------
// STREMIO SUBTITLE ENDPOINT
// --------------------------------------------------

app.get("/subtitles/:type/:id.json", async (req, res) => {
  try {
    const type = req.params.type;
    const id = req.params.id;

    console.log(
      "Stremio subtitle request:",
      type,
      id
    );

    // IMDb ID -> search upstream service first
    const target =
      `${UPSTREAM}/subtitles/${type}/${id}.json`;

    console.log("Calling upstream:", target);

    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const contentType =
      response.headers.get("content-type") || "";

    const text = await response.text();

    console.log(
      "Upstream:",
      response.status,
      contentType,
      text.length
    );

    // If upstream already returned JSON, pass it through.
    if (
      contentType.includes("application/json") ||
      text.trim().startsWith("{")
    ) {
      try {
        const json = JSON.parse(text);

        return res.json(json);
      } catch (e) {
        console.log(
          "Upstream looked like JSON but could not parse."
        );
      }
    }

    // Otherwise search SubtitleCat directly.
    const title =
      req.query.title ||
      id;

    const searchUrl =
      SUBTITLECAT +
      "/index.php?search=" +
      encodeURIComponent(title) +
      "&show=1000";

    console.log(
      "Direct SubtitleCat search:",
      searchUrl
    );

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await searchResponse.text();

    const regex =
      /href=["']([^"']*subs\/[^"']+\.html)["']/gi;

    const subtitles = [];

    let match;
    let index = 0;

    while ((match = regex.exec(html)) !== null) {
      let detailUrl = match[1];

      if (!detailUrl.startsWith("http")) {
        detailUrl =
          SUBTITLECAT +
          "/" +
          detailUrl.replace(/^\/+/, "");
      }

      if (
        subtitles.some(
          s => s.detailUrl === detailUrl
        )
      ) {
        continue;
      }

      subtitles.push({
        id:
          "subtitlecat-" +
          index++,

        url:
          `${UPSTREAM}/api/subtitles/download?` +
          new URLSearchParams({
            detailUrl,
            name: detailUrl.split("/").pop()
          }).toString(),

        lang: "srp",

        label:
          "🇷🇸 Serbian Latin"
      });

      // Maximum 30 subtitles
      if (subtitles.length >= 30) {
        break;
      }
    }

    console.log(
      "SubtitleCat subtitles found:",
      subtitles.length
    );

    return res.json({
      subtitles
    });
  } catch (error) {
    console.error(
      "SUBTITLE ENDPOINT ERROR:",
      error
    );

    res.status(500).json({
      subtitles: []
    });
  }
});

// --------------------------------------------------
// SUBTITLE DOWNLOAD PROXY
// --------------------------------------------------

app.get(
  "/api/subtitles/download",
  async (req, res) => {
    try {
      const query =
        new URLSearchParams();

      for (
        const [key, value]
        of Object.entries(req.query)
      ) {
        if (typeof value === "string") {
          query.set(key, value);
        }
      }

      const target =
        `${UPSTREAM}/api/subtitles/download?${query.toString()}`;

      console.log(
        "Subtitle download:",
        target
      );

      const response = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        }
      });

      const body =
        await response.arrayBuffer();

      const contentType =
        response.headers.get(
          "content-type"
        );

      res.status(response.status);

      if (contentType) {
        res.setHeader(
          "Content-Type",
          contentType
        );
      } else {
        res.setHeader(
          "Content-Type",
          "text/plain; charset=utf-8"
        );
      }

      res.send(Buffer.from(body));
    } catch (error) {
      console.error(
        "DOWNLOAD ERROR:",
        error
      );

      res
        .status(502)
        .send(
          "Subtitle download proxy error"
        );
    }
  }
);

// --------------------------------------------------
// DEBUG
// --------------------------------------------------

app.get("/debug", async (req, res) => {
  try {
    const url =
      SUBTITLECAT +
      "/index.php?search=The%20Matrix%201999&show=1000";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html =
      await response.text();

    res.json({
      ok: true,
      status: response.status,
      contentType:
        response.headers.get(
          "content-type"
        ),
      htmlLength: html.length,
      containsMatrix:
        html.includes("Matrix"),
      containsSubtitle:
        html.includes("subtitle") ||
        html.includes("subs/")
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// --------------------------------------------------
// START
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SubtitleCat Serbian Latin proxy running on port ${PORT}`
    );
  }
);
```
