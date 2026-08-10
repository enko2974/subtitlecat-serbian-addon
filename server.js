const express = require("express");

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";

const CINEMETA =
  "https://v3-cinemeta.strem.io";


/* =========================================================
   CORS
   ========================================================= */

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "*"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


/* =========================================================
   HOME
   ========================================================= */

app.get("/", function (req, res) {
  res.type("text/plain").send(
    "SubtitleCat Serbian Latin addon is running."
  );
});


/* =========================================================
   MANIFEST
   ========================================================= */

app.get("/manifest.json", function (req, res) {
  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "3.0.0",
    name: "SubtitleCat Serbian Latin",
    description:
      "Serbian Latin subtitles via SubtitleCat translation service",

    logo:
      "https://www.stremio.com/website/stremio-logo-small.png",

    resources: [
      "subtitles"
    ],

    types: [
      "movie",
      "series"
    ],

    idPrefixes: [
      "tt"
    ]
  });
});


/* =========================================================
   PARSE STREMIO ID
   ========================================================= */

function parseStremioId(id) {

  const parts =
    String(id || "").split(":");

  return {
    imdbId: parts[0],
    season: parts[1] || null,
    episode: parts[2] || null
  };
}


/* =========================================================
   CINEMETA
   Used mainly for debugging/fallback information.
   ========================================================= */

async function getCinemetaTitle(type, id) {

  try {

    const parsed =
      parseStremioId(id);

    const url =
      CINEMETA +
      "/meta/" +
      encodeURIComponent(type) +
      "/" +
      encodeURIComponent(parsed.imdbId) +
      ".json";

    console.log(
      "CINEMETA REQUEST:",
      url
    );

    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "SubtitleCat-Serbian-Latin/3.0",
          "Accept":
            "application/json"
        }
      });

    if (!response.ok) {
      console.log(
        "CINEMETA STATUS:",
        response.status
      );

      return null;
    }

    const data =
      await response.json();

    if (
      !data ||
      !data.meta
    ) {
      return null;
    }

    let title =
      data.meta.name || "";

    const releaseInfo =
      String(
        data.meta.releaseInfo || ""
      );

    const yearMatch =
      releaseInfo.match(
        /\b(?:19|20)\d{2}\b/
      );

    if (
      yearMatch &&
      !title.includes(yearMatch[0])
    ) {
      title =
        title +
        " " +
        yearMatch[0];
    }

    return title.trim() || null;

  } catch (error) {

    console.error(
      "CINEMETA ERROR:",
      error.message
    );

    return null;
  }
}


/* =========================================================
   FETCH SUBTITLES FROM UPSTREAM
   ========================================================= */

async function fetchUpstreamSubtitles(
  type,
  id
) {

  const url =
    UPSTREAM +
    "/subtitles/" +
    encodeURIComponent(type) +
    "/" +
    encodeURIComponent(id) +
    ".json";

  console.log(
    "UPSTREAM SUBTITLE REQUEST:",
    url
  );

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",

        "Accept":
          "application/json, text/plain, */*"
      }
    });

  const text =
    await response.text();

  console.log(
    "UPSTREAM STATUS:",
    response.status
  );

  console.log(
    "UPSTREAM CONTENT TYPE:",
    response.headers.get(
      "content-type"
    )
  );

  console.log(
    "UPSTREAM LENGTH:",
    text.length
  );

  if (!response.ok) {

    throw new Error(
      "Upstream returned HTTP " +
      response.status
    );
  }

  let data;

  try {

    data =
      JSON.parse(text);

  } catch (error) {

    throw new Error(
      "Upstream did not return valid JSON"
    );
  }

  return data;
}


/* =========================================================
   NORMALIZE SUBTITLES
   ========================================================= */

function normalizeSubtitleList(data) {

  if (
    !data ||
    !Array.isArray(data.subtitles)
  ) {
    return [];
  }

  return data.subtitles
    .filter(function (item) {

      return (
        item &&
        item.url
      );

    })
    .map(function (item, index) {

      return {

        id:
          String(
            item.id ||
            "subtitlecat-" +
            index
          ),

        url:
          String(item.url),

        lang:
          "srp",

        label:
          "🇷🇸 Serbian Latin"
      };

    });
}


/* =========================================================
   STREMIO SUBTITLE ENDPOINT
   ========================================================= */

app.get(
  "/subtitles/:type/:id.json",
  async function (req, res) {

    const type =
      req.params.type;

    const id =
      req.params.id;

    console.log(
      "========================================"
    );

    console.log(
      "STREMIO SUBTITLE REQUEST"
    );

    console.log(
      "TYPE:",
      type
    );

    console.log(
      "ID:",
      id
    );


    /* -----------------------------------------
       Validate type
       ----------------------------------------- */

    if (
      type !== "movie" &&
      type !== "series"
    ) {

      return res.json({
        subtitles: []
      });
    }


    /* -----------------------------------------
       Validate IMDb ID
       ----------------------------------------- */

    if (
      !String(id).startsWith("tt")
    ) {

      return res.json({
        subtitles: []
      });
    }


    try {

      /*
       * The important part:
       *
       * We directly call the upstream service
       * that already produced the Serbian Latin
       * SubtitleCat results.
       */

      const upstreamData =
        await fetchUpstreamSubtitles(
          type,
          id
        );


      const subtitles =
        normalizeSubtitleList(
          upstreamData
        );


      console.log(
        "SUBTITLES FOUND:",
        subtitles.length
      );


      /* ---------------------------------------
         Return subtitles to Stremio
         --------------------------------------- */

      return res.json({
        subtitles: subtitles
      });


    } catch (error) {

      console.error(
        "SUBTITLE ERROR:",
        error.message
      );

      /*
       * Stremio expects valid JSON.
       * Never return broken HTML here.
       */

      return res.json({
        subtitles: []
      });
    }

  }
);


/* =========================================================
   DOWNLOAD PROXY
   ========================================================= */

app.get(
  "/api/subtitles/download",
  async function (req, res) {

    try {

      const detailUrl =
        req.query.detailUrl;

      const name =
        req.query.name ||
        "subtitle.srt";


      if (
        !detailUrl ||
        typeof detailUrl !== "string"
      ) {

        return res
          .status(400)
          .send(
            "Missing detailUrl"
          );
      }


      const target =
        new URL(detailUrl);


      /*
       * Security:
       * only allow our upstream service
       * and SubtitleCat.
       */

      const allowedHosts =
        new Set([
          new URL(UPSTREAM).hostname,
          "subtitlecat.com",
          "www.subtitlecat.com"
        ]);


      if (
        !allowedHosts.has(
          target.hostname
        )
      ) {

        return res
          .status(403)
          .send(
            "Host not allowed"
          );
      }


      console.log(
        "DOWNLOAD PROXY:",
        target.href
      );


      const response =
        await fetch(
          target.href,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",

              "Accept":
                "*/*"
            }
          }
        );


      const body =
        Buffer.from(
          await response.arrayBuffer()
        );


      res.status(
        response.status
      );


      res.setHeader(
        "Content-Type",
        response.headers.get(
          "content-type"
        ) ||
        "text/plain; charset=utf-8"
      );


      const safeName =
        String(name)
          .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );


      res.setHeader(
        "Content-Disposition",
        'inline; filename="' +
        safeName +
        '"'
      );


      return res.send(body);


    } catch (error) {

      console.error(
        "DOWNLOAD ERROR:",
        error.message
      );

      return res
        .status(502)
        .send(
          "Subtitle download proxy error"
        );
    }

  }
);


/* =========================================================
   TEST ENDPOINT
   ========================================================= */

app.get(
  "/test-search",
  async function (req, res) {

    try {

      const type =
        req.query.type ||
        "movie";

      const id =
        req.query.id ||
        "tt0133093";


      const data =
        await fetchUpstreamSubtitles(
          type,
          id
        );


      const subtitles =
        normalizeSubtitleList(
          data
        );


      return res.json({

        ok: true,

        type: type,

        id: id,

        subtitlesFound:
          subtitles.length,

        subtitles:
          subtitles

      });


    } catch (error) {

      return res
        .status(502)
        .json({

          ok: false,

          error:
            error.message

        });
    }

  }
);


/* =========================================================
   DEBUG
   ========================================================= */

app.get(
  "/debug",
  async function (req, res) {

    const result = {

      ok: true,

      addon:
        "SubtitleCat Serbian Latin",

      version:
        "3.0.0",

      node:
        process.version,

      upstream:
        UPSTREAM

    };


    try {

      const data =
        await fetchUpstreamSubtitles(
          "movie",
          "tt0133093"
        );


      const subtitles =
        normalizeSubtitleList(
          data
        );


      result.matrix = {

        subtitlesFound:
          subtitles.length,

        first:
          subtitles.length > 0
            ? subtitles[0]
            : null

      };


    } catch (error) {

      result.matrix = {

        subtitlesFound:
          0,

        error:
          error.message

      };
    }


    return res.json(
      result
    );

  }
);


/* =========================================================
   START SERVER
   ========================================================= */

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
