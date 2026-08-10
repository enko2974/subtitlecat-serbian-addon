const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const SUBTITLECAT = "https://subtitlecat.com";
const CINEMETA = "https://v3-cinemeta.strem.io";


// ============================================================
// CORS
// ============================================================

app.use(function (req, res, next) {
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


// ============================================================
// HOME
// ============================================================

app.get("/", function (req, res) {
  res.send(
    "SubtitleCat Serbian Latin addon is running."
  );
});


// ============================================================
// MANIFEST
// ============================================================

app.get("/manifest.json", function (req, res) {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "2.2.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles translated to Serbian Latin",

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


// ============================================================
// GET MOVIE / SERIES TITLE FROM CINEMETA
// ============================================================

async function getTitle(type, id) {
  try {
    // Remove possible :season:episode parts
    const cleanId = id.split(":")[0];

    const url =
      CINEMETA +
      "/meta/" +
      type +
      "/" +
      cleanId +
      ".json";

    console.log("CINEMETA:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    console.log(
      "CINEMETA STATUS:",
      response.status
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data || !data.meta) {
      return null;
    }

    let title = data.meta.name || "";

    const releaseInfo =
      data.meta.releaseInfo || "";

    const yearMatch =
      String(releaseInfo).match(
        /\b(19|20)\d{2}\b/
      );

    if (yearMatch) {
      title += " " + yearMatch[0];
    }

    return title.trim();

  } catch (error) {

    console.error(
      "CINEMETA ERROR:",
      error.message
    );

    return null;
  }
}


// ============================================================
// SEARCH SUBTITLECAT
// ============================================================

async function searchSubtitleCat(title) {

  const url =
    SUBTITLECAT +
    "/index.php?search=" +
    encodeURIComponent(title) +
    "&show=1000";

  console.log(
    "SUBTITLECAT SEARCH:",
    url
  );

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  const html =
    await response.text();

  console.log(
    "SUBTITLECAT STATUS:",
    response.status
  );

  console.log(
    "HTML LENGTH:",
    html.length
  );


  // IMPORTANT:
  // Correct regular expression.
  //
  // The old version contained:
  //
  // (\[^%22']*subs/\[^%22']+
  //
  // which is INVALID JavaScript regex.
  //
  // This version is correct:
  //

  const regex =
    /href=["']([^"']*\/subs\/[^"']+\.html)["']/gi;


  const results = [];

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {

    let link = match[1];

    // Convert relative URL to absolute
    if (!link.startsWith("http")) {

      link =
        SUBTITLECAT +
        "/" +
        link.replace(/^\/+/, "");
    }

    // Avoid duplicates
    if (!results.includes(link)) {
      results.push(link);
    }

    // Maximum 30 subtitles
    if (results.length >= 30) {
      break;
    }
  }


  console.log(
    "SUBTITLECAT RESULTS:",
    results.length
  );

  return results;
}


// ============================================================
// STREMIO SUBTITLE ENDPOINT
// ============================================================

app.get(
  "/subtitles/:type/:id.json",
  async function (req, res) {

    try {

      const type =
        req.params.type;

      const id =
        req.params.id;


      console.log(
        "================================"
      );

      console.log(
        "STREMIO REQUEST"
      );

      console.log(
        "TYPE:",
        type
      );

      console.log(
        "ID:",
        id
      );


      // --------------------------------------------------------
      // Get title from Cinemeta
      // --------------------------------------------------------

      let title =
        await getTitle(
          type,
          id
        );


      // Allow manual title
      // for testing
      if (req.query.title) {
        title =
          req.query.title;
      }


      if (!title) {
        title =
          "The Matrix 1999";
      }


      console.log(
        "TITLE:",
        title
      );


      // --------------------------------------------------------
      // Search SubtitleCat
      // --------------------------------------------------------

      const links =
        await searchSubtitleCat(
          title
        );


      const subtitles = [];


      // --------------------------------------------------------
      // Create Stremio subtitle objects
      // --------------------------------------------------------

      for (
        let i = 0;
        i < links.length;
        i++
      ) {

        const detailUrl =
          links[i];


        const downloadUrl =
          "https://" +
          req.get("host") +
          "/api/subtitles/download?detailUrl=" +
          encodeURIComponent(
            detailUrl
          );


        subtitles.push({

          id:
            "subtitlecat-" +
            i,

          url:
            downloadUrl,

          lang:
            "srp",

          label:
            "🇷🇸 Serbian Latin"

        });
      }


      console.log(
        "SUBTITLES FOUND:",
        subtitles.length
      );


      // --------------------------------------------------------
      // Stremio response
      // --------------------------------------------------------

      res.json({
        subtitles:
          subtitles
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
  }
);


// ============================================================
// SUBTITLE DOWNLOAD PROXY
// ============================================================

app.get(
  "/api/subtitles/download",
  async function (req, res) {

    try {

      const detailUrl =
        req.query.detailUrl;


      if (!detailUrl) {

        return res
          .status(400)
          .send(
            "Missing detailUrl"
          );
      }


      console.log(
        "================================"
      );

      console.log(
        "DETAIL URL:",
        detailUrl
      );


      // --------------------------------------------------------
      // Download SubtitleCat detail page
      // --------------------------------------------------------

      const response =
        await fetch(
          detailUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",

              "Accept":
                "text/html,application/xhtml+xml"
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


      // --------------------------------------------------------
      // Look for subtitle file
      // --------------------------------------------------------

      const patterns = [

        /href=["']([^"']+\.srt[^"']*)["']/gi,

        /href=["']([^"']+\.vtt[^"']*)["']/gi,

        /href=["']([^"']*download[^"']*)["']/gi

      ];


      let subtitleUrl =
        null;


      // --------------------------------------------------------
      // Find subtitle URL
      // --------------------------------------------------------

      for (
        const pattern of patterns
      ) {

        const match =
          pattern.exec(html);


        if (
          match &&
          match[1]
        ) {

          subtitleUrl =
            match[1];


          // Convert relative URL
          // into absolute URL

          if (
            !subtitleUrl.startsWith(
              "http"
            )
          ) {

            subtitleUrl =
              new URL(
                subtitleUrl,
                detailUrl
              ).href;
          }


          break;
        }
      }


      // --------------------------------------------------------
      // No subtitle file found
      // --------------------------------------------------------

      if (!subtitleUrl) {

        console.log(
          "NO SUBTITLE FILE LINK"
        );


        return res
          .status(404)
          .send(
            "Subtitle file not found"
          );
      }


      console.log(
        "SUBTITLE FILE:",
        subtitleUrl
      );


      // --------------------------------------------------------
      // Download actual subtitle
      // --------------------------------------------------------

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


      console.log(
        "SUBTITLE STATUS:",
        subtitleResponse.status
      );


      if (
        !subtitleResponse.ok
      ) {

        return res
          .status(
            subtitleResponse.status
          )
          .send(
            "Subtitle download failed"
          );
      }


      const body =
        await subtitleResponse.arrayBuffer();


      // --------------------------------------------------------
      // Return subtitle to Stremio
      // --------------------------------------------------------

      res.status(200);


      res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
      );


      res.setHeader(
        "Content-Disposition",
        'inline; filename="subtitle.srt"'
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
  }
);


// ============================================================
// TEST SEARCH
// ============================================================

app.get(
  "/test-search",
  async function (req, res) {

    try {

      const q =
        req.query.q ||
        "The Matrix 1999";


      const results =
        await searchSubtitleCat(
          q
        );


      res.json({

        ok: true,

        query: q,

        resultsFound:
          results.length,

        results:
          results

      });


    } catch (error) {

      res.status(500).json({

        ok: false,

        error:
          error.message

      });
    }
  }
);


// ============================================================
// DEBUG
// ============================================================

app.get(
  "/debug",
  async function (req, res) {

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

        status:
          response.status,

        contentType:
          response.headers.get(
            "content-type"
          ),

        htmlLength:
          html.length,

        matrix:
          html.includes(
            "Matrix"
          ),

        subtitleLinks:
          html.includes(
            "subs/"
          ),

        captcha:
          html
            .toLowerCase()
            .includes(
              "captcha"
            ),

        cloudflare:
          html
            .toLowerCase()
            .includes(
              "cloudflare"
            )

      });


    } catch (error) {

      res.status(500).json({

        ok: false,

        error:
          error.message

      });
    }
  }
);


// ============================================================
// START SERVER
// ============================================================

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
```
