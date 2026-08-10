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

app.get("/manifest.json", function (req, res) {
res.json({
id: "org.subtitlecat.serbianlatin",
version: "2.1.0",
name: "SubtitleCat Serbian Latin",
description: "SubtitleCat subtitles translated to Serbian Latin",
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

async function getTitle(type, id) {
try {
const cleanId = id.split(":")[0];

```
const url =
  CINEMETA +
  "/meta/" +
  type +
  "/" +
  cleanId +
  ".json";

console.log("CINEMETA:", url);

const response = await fetch(url);

if (!response.ok) {
  console.log("CINEMETA STATUS:", response.status);
  return null;
}

const data = await response.json();

if (!data.meta) {
  return null;
}

let title = data.meta.name || "";

const releaseInfo = data.meta.releaseInfo || "";

const yearMatch =
  String(releaseInfo).match(/\b(19|20)\d{2}\b/);

if (yearMatch) {
  title += " " + yearMatch[0];
}

return title.trim();
```

} catch (error) {
console.error("CINEMETA ERROR:", error.message);
return null;
}
}

async function searchSubtitleCat(title) {
const url =
SUBTITLECAT +
"/index.php?search=" +
encodeURIComponent(title) +
"&show=1000";

console.log("SUBTITLECAT SEARCH:", url);

const response = await fetch(url, {
headers: {
"User-Agent": "Mozilla/5.0",
"Accept": "text/html,application/xhtml+xml"
}
});

const html = await response.text();

console.log("SUBTITLECAT STATUS:", response.status);
console.log("HTML LENGTH:", html.length);

const regex =
/href=["']([^%22']*subs/[^%22']+.html)["']/gi;

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

return results;
}

app.get(
"/subtitles/:type/:id.json",
async function (req, res) {

```
try {

  const type = req.params.type;
  const id = req.params.id;

  console.log("================================");
  console.log("STREMIO REQUEST");
  console.log("TYPE:", type);
  console.log("ID:", id);

  let title = await getTitle(type, id);

  if (req.query.title) {
    title = req.query.title;
  }

  if (!title) {
    title = "The Matrix 1999";
  }

  console.log("TITLE:", title);

  const links =
    await searchSubtitleCat(title);

  const subtitles = [];

  for (let i = 0; i < links.length; i++) {

    const detailUrl = links[i];

    const downloadUrl =
      "https://" +
      req.get("host") +
      "/api/subtitles/download?detailUrl=" +
      encodeURIComponent(detailUrl);

    subtitles.push({
      id: "subtitlecat-" + i,
      url: downloadUrl,
      lang: "srp",
      label: "🇷🇸 Serbian Latin"
    });
  }

  console.log(
    "SUBTITLES FOUND:",
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

app.get(
"/api/subtitles/download",
async function (req, res) {

```
try {

  const detailUrl =
    req.query.detailUrl;

  if (!detailUrl) {
    return res
      .status(400)
      .send("Missing detailUrl");
  }

  console.log(
    "DETAIL URL:",
    detailUrl
  );

  const response = await fetch(
    detailUrl,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    }
  );

  const html =
    await response.text();

  console.log(
    "DETAIL STATUS:",
    response.status
  );

  console.log(
    "DETAIL LENGTH:",
    html.length
  );

  const patterns = [
    /href=["']([^"']+\.srt[^"']*)["']/gi,
    /href=["']([^"']+\.vtt[^"']*)["']/gi,
    /href=["']([^"']*download[^"']*)["']/gi
  ];

  let subtitleUrl = null;

  for (const pattern of patterns) {

    const match =
      pattern.exec(html);

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

  if (!subtitleUrl) {

    console.log(
      "NO SUBTITLE FILE LINK"
    );

    return res
      .status(404)
      .send("Subtitle file not found");
  }

  console.log(
    "SUBTITLE FILE:",
    subtitleUrl
  );

  const subtitleResponse =
    await fetch(
      subtitleUrl,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

  const body =
    await subtitleResponse.arrayBuffer();

  res.status(
    subtitleResponse.status
  );

  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.send(
    Buffer.from(body)
  );

} catch (error) {

  console.error(
    "DOWNLOAD ERROR:",
    error.message
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

app.get(
"/debug",
async function (req, res) {

```
try {

  const url =
    SUBTITLECAT +
    "/index.php?search=The%20Matrix%201999&show=1000";

  const response =
    await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

  const html =
    await response.text();

  res.json({
    ok: true,
    status: response.status,
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
        .includes("cloudflare")
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

app.listen(
PORT,
"0.0.0.0",
function () {
console.log(
"SubtitleCat Serbian Latin addon running on port " +
PORT
);
}
);
