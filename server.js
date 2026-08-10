const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const SUBTITLECAT = "https://subtitlecat.com";

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";


app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});


app.get("/", function (req, res) {
  res.send("SubtitleCat Serbian Latin proxy is running.");
});


app.get("/manifest.json", function (req, res) {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.4",
    name: "SubtitleCat Serbian Latin",
    description: "SubtitleCat subtitles automatically translated to Serbian Latin",
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


app.get("/test-search", async function (req, res) {
  try {

    const q = req.query.q || "The Matrix 1999";

    const url =
      SUBTITLECAT +
      "/index.php?search=" +
      encodeURIComponent(q) +
      "&show=1000";

    console.log("SEARCH:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await response.text();

    const regex = /href=["']([^"']*subs\/[^"']+\.html)["']/gi;

    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null) {

      let link = match[1];

      if (!link.startsWith("http")) {
        link =
          SUBTITLECAT +
          "/" +
          link.replace(/^\/+/, "");
      }

      if (!results.includes(link)) {
        results.push(link);
      }

      if (results.length >= 30) {
        break;
      }
    }

    res.json({
      ok: true,
      query: q,
      status: response.status,
      htmlLength: html.length,
      resultsFound: results.length,
      results: results
    });

  } catch (error) {

    console.error("SEARCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


app.get("/subtitles/:type/:id.json", async function (req, res) {
  try {

    const type = req.params.type;
    const id = req.params.id;

    console.log("STREMIO:", type, id);

    const upstreamUrl =
      UPSTREAM +
      "/subtitles/" +
      type +
      "/" +
      id +
      ".json";

    const response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const text = await response.text();

    const contentType =
      response.headers.get("content-type") || "";

    console.log("UPSTREAM STATUS:", response.status);
    console.log("UPSTREAM TYPE:", contentType);

    if (contentType.includes("application/json")) {

      try {
        return res.json(JSON.parse(text));
      } catch (e) {
        console.log("Upstream JSON invalid");
      }

    }

    const title =
      req.query.title || "The Matrix 1999";

    const searchUrl =
      SUBTITLECAT +
      "/index.php?search=" +
      encodeURIComponent(title) +
      "&show=1000";

    console.log("DIRECT SEARCH:", searchUrl);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const html = await searchResponse.text();

    const regex = /href=["']([^"']*subs\/[^"']+\.html)["']/gi;

    const subtitles = [];

    let match;
    let counter = 0;

    while ((match = regex.exec(html)) !== null) {

      let detailUrl = match[1];

      if (!detailUrl.startsWith("http")) {
        detailUrl =
          SUBTITLECAT +
          "/" +
          detailUrl.replace(/^\/+/, "");
      }

      const duplicate = subtitles.some(function (item) {
        return item.detailUrl === detailUrl;
      });

      if (duplicate) {
        continue;
      }

      subtitles.push({
        id: "subtitlecat-" + counter,
        url:
          UPSTREAM +
          "/api/subtitles/download?detailUrl=" +
          encodeURIComponent(detailUrl) +
          "&name=" +
          encodeURIComponent(
            detailUrl.split("/").pop()
          ),
        lang: "srp",
        label: "🇷🇸 Serbian Latin",
        detailUrl: detailUrl
      });

      counter++;

      if (subtitles.length >= 30) {
        break;
      }
    }

    console.log(
      "SUBTITLES FOUND:",
      subtitles.length
    );

    res.json({
      subtitles: subtitles
    });

  } catch (error) {

    console.error("SUBTITLE ERROR:", error);

    res.status(500).json({
      subtitles: []
    });

  }
});


app.get("/api/subtitles/download", async function (req, res) {
  try {

    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query)) {

      if (typeof value === "string") {
        query.set(key, value);
      }

    }

    const url =
      UPSTREAM +
      "/api/subtitles/download?" +
      query.toString();

    console.log("DOWNLOAD:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const body = await response.arrayBuffer();

    res.status(response.status);

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") ||
      "text/plain; charset=utf-8"
    );

    res.send(Buffer.from(body));

  } catch (error) {

    console.error("DOWNLOAD ERROR:", error);

    res.status(502).send(
      "Subtitle download proxy error"
    );

  }
});


app.get("/debug", async function (req, res) {
  try {

    const url =
      SUBTITLECAT +
      "/index.php?search=The%20Matrix%201999&show=1000";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    res.json({
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type"),
      htmlLength: html.length,
      matrix: html.includes("Matrix"),
      subtitleLinks: html.includes("subs/"),
      cookie: html.toLowerCase().includes("cookie"),
      captcha: html.toLowerCase().includes("captcha"),
      cloudflare: html.toLowerCase().includes("cloudflare")
    });

  } catch (error) {

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }
});


app.listen(PORT, "0.0.0.0", function () {
  console.log(
    "SubtitleCat Serbian Latin proxy running on port " +
    PORT
  );
});
