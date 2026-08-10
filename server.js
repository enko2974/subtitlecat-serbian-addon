```javascript
const express = require("express");

const app = express();

const PORT = process.env.PORT || 10000;

const SUBTITLECAT = "https://subtitlecat.com";

const UPSTREAM =
  "https://ais-dev-cn6q5ffycxqvz5s5vap4qy-683609148507.europe-west2.run.app";


// ================================
// CORS
// ================================

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "*"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});


// ================================
// HOME
// ================================

app.get("/", function (req, res) {
  res.send(
    "SubtitleCat Serbian Latin proxy is running."
  );
});


// ================================
// MANIFEST
// ================================

app.get("/manifest.json", function (req, res) {

  res.json({
    id: "org.subtitlecat.serbianlatin",
    version: "1.0.3",
    name: "SubtitleCat Serbian Latin",
    description:
      "SubtitleCat subtitles automatically translated to Serbian Latin",

    logo:
      "https://www.stremio.com/website/stremio-logo-small.png",

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


// ================================
// TEST SUBTITLECAT SEARCH
// ================================

app.get("/test-search", async function (req, res) {

  try {

    var query =
      req.query.q || "The Matrix 1999";

    var searchUrl =
      SUBTITLECAT +
      "/index.php?search=" +
      encodeURIComponent(query) +
      "&show=1000";

    console.log(
      "SubtitleCat search:",
      searchUrl
    );

    var response = await fetch(searchUrl, {

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }

    });

    var html =
      await response.text();

    console.log(
      "Status:",
      response.status
    );

    console.log(
      "HTML length:",
      html.length
    );


    // Find /subs/...html links

    var regex =
      /href=["']([^"']*subs\/[^"']+\.html)["']/gi;

    var results = [];

    var match;

    while (
      (match = regex.exec(html)) !== null
    ) {

      var href = match[1];

      if (
        href.indexOf("http") !== 0
      ) {

        href =
          SUBTITLECAT +
          "/" +
          href.replace(/^\/+/, "");

      }

      if (
        results.indexOf(href) === -1
      ) {

        results.push(href);

      }

    }


    res.json({

      ok: true,

      query: query,

      status: response.status,

      htmlLength: html.length,

      resultsFound:
        results.length,

      results: results

    });

  } catch (error) {

    console.error(
      "SEARCH ERROR:",
      error
    );

    res.status(500).json({

      ok: false,

      error:
        error.message

    });

  }

});


// ================================
// STREMIO SUBTITLES
// ================================

app.get(
  "/subtitles/:type/:id.json",
  async function (req, res) {

    try {

      var type =
        req.params.type;

      var id =
        req.params.id;


      console.log(
        "Stremio request:",
        type,
        id
      );


      // First ask the existing AI Studio
      // subtitle service.

      var upstreamUrl =
        UPSTREAM +
        "/subtitles/" +
        type +
        "/" +
        id +
        ".json";


      console.log(
        "Upstream:",
        upstreamUrl
      );


      var upstreamResponse =
        await fetch(
          upstreamUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0",

              "Accept":
                "*/*"
            }
          }
        );


      var upstreamText =
        await upstreamResponse.text();


      var upstreamType =
        upstreamResponse.headers.get(
          "content-type"
        ) || "";


      console.log(
        "Upstream status:",
        upstreamResponse.status
      );

      console.log(
        "Upstream type:",
        upstreamType
      );


      // If it is valid JSON,
      // return it directly.

      if (
        upstreamType.indexOf(
          "application/json"
        ) !== -1
      ) {

        try {

          var upstreamJson =
            JSON.parse(
              upstreamText
            );

          return res.json(
            upstreamJson
          );

        } catch (e) {

          console.log(
            "Invalid upstream JSON"
          );

        }

      }


      // ====================================
      // DIRECT SUBTITLECAT SEARCH
      // ====================================

      var query =
        req.query.title ||
        "The Matrix 1999";


      var searchUrl =
        SUBTITLECAT +
        "/index.php?search=" +
        encodeURIComponent(query) +
        "&show=1000";


      console.log(
        "Direct search:",
        searchUrl
      );


      var searchResponse =
        await fetch(
          searchUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          }
        );


      var html =
        await searchResponse.text();


      var regex =
        /href=["']([^"']*subs\/[^"']+\.html)["']/gi;


      var subtitles = [];

      var match;

      var number = 0;


      while (
        (match = regex.exec(html)) !== null
      ) {

        var detailUrl =
          match[1];


        if (
          detailUrl.indexOf("http") !== 0
        ) {

          detailUrl =
            SUBTITLECAT +
            "/" +
            detailUrl.replace(
              /^\/+/,
              ""
            );

        }


        // Avoid duplicates

        var exists =
          subtitles.some(
            function (item) {
              return (
                item.detailUrl ===
                detailUrl
              );
            }
          );


        if (exists) {
          continue;
        }


        subtitles.push({

          id:
            "subtitlecat-" +
            number,

          url:
            UPSTREAM +
            "/api/subtitles/download?" +
            new URLSearchParams({

              detailUrl:
                detailUrl,

              name:
                detailUrl
                  .split("/")
                  .pop()

            }).toString(),

          lang:
            "srp",

          label:
            "🇷🇸 Serbian Latin"

        });


        number++;


        if (
          subtitles.length >= 30
        ) {

          break;

        }

      }


      console.log(
        "Subtitles found:",
        subtitles.length
      );


      return res.json({

        subtitles:
          subtitles

      });


    } catch (error) {

      console.error(
        "SUBTITLE ERROR:",
        error
      );


      return res.status(500).json({

        subtitles: []

      });

    }

  }
);


// ================================
// SUBTITLE DOWNLOAD
// ================================

app.get(
  "/api/subtitles/download",
  async function (req, res) {

    try {

      var query =
        new URLSearchParams();


      Object.entries(
        req.query
      ).forEach(
        function (entry) {

          var key =
            entry[0];

          var value =
            entry[1];


          if (
            typeof value ===
            "string"
          ) {

            query.set(
              key,
              value
            );

          }

        }
      );


      var downloadUrl =
        UPSTREAM +
        "/api/subtitles/download?" +
        query.toString();


      console.log(
        "Download:",
        downloadUrl
      );


      var response =
        await fetch(
          downloadUrl,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0",

              "Accept":
                "*/*"
            }
          }
        );


      var body =
        await response.arrayBuffer();


      var contentType =
        response.headers.get(
          "content-type"
        );


      res.status(
        response.status
      );


      res.setHeader(
        "Content-Type",
        contentType ||
          "text/plain; charset=utf-8"
      );


      res.send(
        Buffer.from(body)
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

  }
);


// ================================
// DEBUG
// ================================

app.get(
  "/debug",
  async function (req, res) {

    try {

      var url =
        SUBTITLECAT +
        "/index.php?search=The%20Matrix%201999&show=1000";


      var response =
        await fetch(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            }
          }
        );


      var html =
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

        containsMatrix:
          html.indexOf(
            "Matrix"
          ) !== -1,

        containsSubtitle:
          html.indexOf(
            "subs/"
          ) !== -1

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


// ================================
// START SERVER
// ================================

app.listen(
  PORT,
  "0.0.0.0",
  function () {

    console.log(
      "SubtitleCat Serbian Latin proxy running on port " +
      PORT
    );

  }
);
```
