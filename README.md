# SubtitleCat Serbian Latin – Stremio Addon

A small Express-based Stremio subtitles addon that searches SubtitleCat and returns Serbian Latin subtitle URLs through the existing translation/download proxy.

## Deploy on Render

- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node

No environment variables are required.

## Endpoints

- `/manifest.json`
- `/health`
- `/subtitles/movie/tt0133093.json`
- `/test-search?q=The%20Matrix%201999`
- `/debug`

After deployment, install:

`https://YOUR-RENDER-SERVICE.onrender.com/manifest.json`
