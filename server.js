const express = require("express");

const app = express();

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/*
 * Stremio manifest
 * Served DIRECTLY by Render.
 */
app.get("/manifest.json", (req, res) => {
  res.type("application/json");

  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  });
});

/*
 * Proxy all Stremio subtitle requests to AI Studio.
 */
app.get("/subtitles/:type/:id.json", async (req, res) => {
  try {
    const target =
      `${UPSTREAM}/subtitles/${req.params.type}/${req.params.id}.json`;

    console.log("Proxying:", target);

    const response = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    console.log("Upstream status:", response.status);
    console.log("Upstream content-type:", response.headers.get("content-type"));

    res.status(response.status);
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") ||
        "application/json; charset=utf-8"
    );

    res.send(text);
  } catch (error) {
    console.error("SUBTITLE PROXY ERROR:", error);
    res.status(502).json({
      error: "Subtitle proxy error",
      message: error.message
    });
  }
});

/*
 * Proxy subtitle download/translation requests.
 */
app.get("/api/subtitles/download", async (req, res) => {
  try {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        query.set(key, value);
      }
    }

    const target =
      `${UPSTREAM}/api/subtitles/download?${query.toString()}`;

    console.log("Proxying subtitle download:", target);

    const response = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const body = await response.arrayBuffer();

    res.status(response.status);

    const contentType = response.headers.get("content-type");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    res.send(Buffer.from(body));
  } catch (error) {
    console.error("DOWNLOAD PROXY ERROR:", error);
    res.status(502).send("Subtitle download proxy error");
  }
});

/*
 * Health check
 */
app.get("/", (req, res) => {
  res.send("SubtitleCat Serbian Latin proxy is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `SubtitleCat Serbian Latin proxy running on port ${PORT}`
  );
});
