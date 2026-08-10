const express = require("express");

const app = express();

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/*
 * IMPORTANT:
 * Serve the Stremio manifest DIRECTLY from Render.
 * Do NOT fetch it from AI Studio because AI Studio may
 * return its cookie-check page instead of JSON.
 */
app.get("/manifest.json", (req, res) => {
  res.status(200);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.0",
    name: "SubtitleCat Serbian Latin",
    description: "SubtitleCat subtitles automatically translated to Serbian Latin",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  });
});

/*
 * Forward the actual subtitle requests to the AI Studio app.
 */
app.use(async (req, res) => {
  try {
    const target = `${UPSTREAM}${req.originalUrl}`;

    const response = await fetch(target, {
      method: req.method,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": req.headers.accept || "*/*"
      }
    });

    const contentType = response.headers.get("content-type");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    res.status(response.status);

    const body = Buffer.from(await response.arrayBuffer());

    res.send(body);
  } catch (error) {
    console.error(error);
    res.status(502).send("Proxy error");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SubtitleCat Stremio proxy running on port ${PORT}`);
});
