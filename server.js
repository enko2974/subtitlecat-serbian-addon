const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = Number(process.env.PORT) || 10000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => {
  res.type('text').send('SubtitleCat Serbian Latin Addon v6 is active.');
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.subtitlecat.serbianlatin.ai',
    version: '6.0.0',
    name: 'SubtitleCat Serbian (Gemini AI)',
    description: 'Automatic translation via Gemini AI',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
  });
});

async function translateToSerbian(subtitleText) {
  try {
    const prompt = `Преведи го следниов текст (SRT/VTT формат) исклучиво на СРПСКА ЛАТИНИЦА (č, ć, ž, š, đ). 
Задолжително задржи ги временските ознаки и броевите.
\n${subtitleText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || subtitleText;
  } catch (error) {
    console.error('GEMINI ERROR:', error.message);
    return subtitleText;
  }
}

// Оваа функција ги опслужува сите барања од Stremio
const handleSubtitles = async (req, res) => {
  const { type, id } = req.params;
  console.log(`=== LIVE REQUEST: ${type} ${id} ===`);

  const host = req.get('host');
  // Го форсираме https линкот кој ќе го користи Stremio
  const directSubUrl = `https://subtitle-cat.com/subs/${id}/en.vtt`;

  const subtitles = [
    {
      id: `sub-gemini-${id}`,
      url: `https://${host}/translate-sub.srt?url=${encodeURIComponent(directSubUrl)}`,
      lang: 'srp',
      label: '🇷🇸 Serbian Latin (Gemini AI)'
    }
  ];

  res.setHeader('Cache-Control', 'no-store');
  res.json({ subtitles });
};

// ОВА БЕШЕ ГРЕШКАТА: Додадени се двете рути за да ги фаќаат барањата со и без videoHash!
app.get('/subtitles/:type/:id.json', handleSubtitles);
app.get('/subtitles/:type/:id/:extra.json', handleSubtitles);

app.get('/translate-sub.srt', async (req, res) => {
  const subUrl = req.query.url;
  if (!subUrl) return res.status(400).send('Missing url');

  try {
    console.log(`FETCHING SUBTITLE FROM: ${subUrl}`);
    const response = await fetch(subUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 
      redirect: 'follow' 
    });
    
    if (!response.ok) {
      console.log(`SUBTITLE NOT FOUND ON SOURCE (${response.status})`);
      return res.status(404).send('Subtitle not found');
    }
    
    let subtitleText = await response.text();
    console.log('TRANSLATING WITH GEMINI...');
    const translatedText = await translateToSerbian(subtitleText);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(translatedText);
  } catch (error) {
    console.error('TRANSLATE ERROR:', error);
    res.status(500).send('Error processing subtitle');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Addon running on port ${PORT}`);
});
