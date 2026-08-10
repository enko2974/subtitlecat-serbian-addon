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

app.get("/manifest.json", async (req, res) => {
  try {
    const response = await fetch(`${UPSTREAM}/manifest.json`);

    const text = await response.text();

    res.status(response.status);
    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.send(text);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "Unable to reach addon server"
    });
  }
});

app.use(async (req, res) => {
  try {
    const target = `${UPSTREAM}${req.originalUrl}`;

    const response = await fetch(target, {
      method: req.method,
      headers: {
        "User-Agent": "Stremio-SubtitleCat-Proxy",
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
  console.log(`Proxy running on port ${PORT}`);
});
