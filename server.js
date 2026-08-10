const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const SUBTITLECAT = "https://subtitlecat.com";
const CINEMETA = "https://v3-cinemeta.strem.io";

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
res.send("SubtitleCat Serbian Latin addon is running.");
});

/* =========================================================
MANIFEST
========================================================= */

app.get("/manifest.json", function (req, res) {
res.json({
id: "org.subtitlecat.serbianlatin",
version: "2.0.0",
name: "SubtitleCat Serbian Latin",
description: "SubtitleCat subtitles translated to Serbian Latin",
logo: "https://www.stremio.com/website/stremio-logo-small.png",

```
resources: [
  {
    name: "subtitles",
    types: ["movie", "series"],
    idPrefixes: ["tt"]
  }
],

types: ["movie", "series"],
idPrefixes: ["tt"]
```

});
});

/* =========================================================
GET MOVIE / SERIES TITLE FROM CINEMETA
========================================================= */

async function getTitle(type, id) {
try {
let cleanId = id;

```
/*
  Series subtitle IDs can look like:

  tt1234567:1:2

  For metadata we only need:

  tt1234567
*/

if (cleanId.includes(":")) {
  cleanId = cleanId.split(":")[0];
}

const metaUrl =
  CINEMETA +
  "/meta/" +
  type +
  "/" +
  cleanId +
  ".json";

console.log("CINEMETA:", metaUrl);

const response = await fetch(metaUrl, {
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
  }
});

if (!response.ok) {
  console.log("CINEMETA STATUS:", response.status);
  return null;
}

const data = await response.json();

if (!data || !data.meta) {
  return null;
}

const meta = data.meta;

console.log("TITLE:", meta.name);
console.log("YEAR:", meta.releaseInfo || "");

let title = meta.name || "";

if (meta.releaseInfo) {
  const yearMatch = String(meta.releaseInfo).match(/\b(19|20)\d{2}\b/);

  if (yearMatch) {
    title += " " + yearMatch[0];
  }
}

return title.trim();
```

} catch (error) {
console.error("CINEMETA ERROR:", error.message);
return null;
}
}

/* =========================================================
SEARCH SUBTITLECAT
========================================================= */

async function searchSubtitleCat(title) {
const searchUrl =
SUBTITLECAT +
"/index.php?search=" +
encodeURIComponent(title) +
"&show=1000";

console.log("SUBTITLECAT SEARCH:", searchUrl);

const response = await fetch(searchUrl, {
headers: {
"User-Agent":
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
"Accept":
"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}
});

const html = await response.text();

console.log("SUBTITLECAT STATUS:", response.status);
console.log("HTML LENGTH:", html.length);

const regex =
/href=["']([^%22']*/subs/[^%22']+.html)["']/gi;

const results = [];

let match;

while ((match = regex.exec(html)) !== null) {
let link = match[1];

```
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
```

}

console.log("RESULTS FOUND:", results.length);

return results;
}

/* =========================================================
SUBTITLE REQUEST
========================================================= */

app.get(
"/subtitles/:type/:id.json",
async function (req, res) {

```
try {

  const type = req.params.type;
  const id = req.params.id;

  console.log("");
  console.log("====================================");
  console.log("STREMIO SUBTITLE REQUEST");
  console.log("TYPE:", type);
  console.log("ID:", id);
  console.log("====================================");

  /*
    First try to obtain the real movie/series title.
  */

  let title = await getTitle(type, id);

  /*
    Stremio normally does not send ?title.
    But if it does, prefer it.
  */

  if (req.query.title) {
    title = req.query.title;
  }

  /*
    Safety fallback for testing.
  */

  if (!title) {
    title = "The Matrix 1999";
  }

  console.log("SEARCH TITLE:", title);

  const links = await searchSubtitleCat(title);

  const subtitles = [];

  for (let i = 0; i < links.length; i++) {

    const detailUrl = links[i];

    const filename =
      decodeURIComponent(
        detailUrl.split("/").pop()
      );

    /*
      IMPORTANT:
      Stremio must receive a URL to an actual subtitle file.

      We therefore send the URL to our own proxy,
      not directly to SubtitleCat.
    */

    const downloadUrl =
      "https://" +
      req.get("host") +
      "/api/subtitles/download?detailUrl=" +
      encodeURIComponent(detailUrl);

    subtitles.push({
      id: "subtitlecat-" + i,
      url: downloadUrl,
      lang: "srp",
      label: "🇷🇸 Serbian Latin",
      name: "Serbian Latin - " + filename
    });

  }

  console.log(
    "RETURNING SUBTITLES:",
    subtitles.length
  );

  res.json({
    subtitles: subtitles
  });

} catch (error) {

  console.error(
    "SUBTITLE ERROR:",
    error
  );

  res.status(500).json({
    subtitles: []
  });

}
```

}
);

/* =========================================================
DOWNLOAD / PROXY SUBTITLE
========================================================= */

app.get(
"/api/subtitles/download",
async function (req, res) {

```
try {

  const detailUrl = req.query.detailUrl;

  if (!detailUrl) {
    return res
      .status(400)
      .send("Missing detailUrl");
  }

  console.log(
    "DOWNLOAD DETAIL:",
    detailUrl
  );

  /*
    Load SubtitleCat detail page.
  */

  const response = await fetch(
    detailUrl,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml"
      }
    }
  );

  const html = await response.text();

  console.log(
    "DETAIL STATUS:",
    response.status
  );

  console.log(
    "DETAIL HTML:",
    html.length
  );

  /*
    Find subtitle download links.

    SubtitleCat pages can contain several links.
    We look for .srt / .vtt / download-style URLs.
  */

  const patterns = [
    /href=["']([^"']+\.srt[^"']*)["']/gi,
    /href=["']([^"']+\.vtt[^"']*)["']/gi,
    /href=["']([^"']*download[^"']*)["']/gi
  ];

  let subtitleUrl = null;

  for (const pattern of patterns) {

    const match = pattern.exec(html);

    if (match && match[1]) {

      subtitleUrl = match[1];

      if (!subtitleUrl.startsWith("http")) {

        subtitleUrl =
          new URL(
            subtitleUrl,
            detailUrl
          ).href;

      }

      break;
    }

  }

  /*
    If no direct subtitle URL was found,
    return an error instead of invalid HTML.
  */

  if (!subtitleUrl) {

    console.log(
      "NO DIRECT SUBTITLE URL FOUND"
    );

    return res
      .status(404)
      .send("Subtitle file not found");
  }

  console.log(
    "SUBTITLE FILE:",
    subtitleUrl
  );

  /*
    Download actual subtitle file.
  */

  const subtitleResponse =
    await fetch(
      subtitleUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0"
        }
      }
    );

  const buffer =
    await subtitleResponse.arrayBuffer();

  const contentType =
    subtitleResponse.headers.get(
      "content-type"
    ) ||
    "text/plain; charset=utf-8";

  res.status(
    subtitleResponse.status
  );

  res.setHeader(
    "Content-Type",
    contentType
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.send(
    Buffer.from(buffer)
  );

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
```

}
);

/* =========================================================
TEST SEARCH
========================================================= */

app.get(
"/test-search",
async function (req, res) {

```
try {

  const q =
    req.query.q ||
    "The Matrix 1999";

  const results =
    await searchSubtitleCat(q);

  res.json({
    ok: true,
    query: q,
    resultsFound: results.length,
    results: results
  });

} catch (error) {

  res.status(500).json({
    ok: false,
    error: error.message
  });

}
```

}
);

/* =========================================================
DEBUG
========================================================= */

app.get(
"/debug",
async function (req, res) {

```
try {

  const url =
    SUBTITLECAT +
    "/index.php?search=The%20Matrix%201999&show=1000";

  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0"
        }
      }
    );

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
    matrix:
      html.includes("Matrix"),
    subtitleLinks:
      html.includes("subs/"),
    captcha:
      html.toLowerCase()
        .includes("captcha"),
    cloudflare:
      html.toLowerCase()
        .includes("cloudflare"),
    javascript:
      html.toLowerCase()
        .includes("javascript")
  });

} catch (error) {

  res.status(500).json({
    ok: false,
    error: error.message
  });

}
```

}
);

/* =========================================================
START SERVER
========================================================= */

app.listen(
PORT,
"0.0.0.0",
function () {

```
console.log(
  "SubtitleCat Serbian Latin addon running on port " +
  PORT
);
```

}
);
