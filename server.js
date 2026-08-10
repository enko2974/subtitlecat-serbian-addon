const express = require("express");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* =========================
   CONFIG
   ========================= */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

/* =========================
   STREMIO MANIFEST
   ========================= */

app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "2.0.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  });
});

/* =========================
   TEST GEMINI
   ========================= */

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

/* =========================
   TEST SUBTITLECAT
   ========================= */

app.get("/test-subtitlecat", async (req, res) => {
  try {
    const url =
      "https://subtitlecat.com/index.php?search=The%20Matrix%201999&show=1000";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });

    const text = await response.text();

    res.json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      length: text.length,
      containsMatrix: text.toLowerCase().includes("matrix")
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================
   HOME
   ========================= */

app.get("/", (req, res) => {
  res.send("SubtitleCat Serbian Latin proxy is running.");
});

/* =========================
   SERVER
   ========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `SubtitleCat Serbian Latin proxy running on port ${PORT}`
  );
});
