# CHINA101R Practice

Mobile-first Chinese practice site built from *New Practical Chinese Reader 1* (Lessons 1–14).

Run locally: `python -m http.server 8000` in this folder, then open http://localhost:8000 (on your phone use your PC's LAN IP).
Or deploy the folder as-is to GitHub Pages / Netlify (static, no build step).

- Pick a lesson range with the red pill at the top (e.g. 3–4); earlier lessons are mixed in as review (toggle in the picker).
- Voice uses your device's built-in Chinese text-to-speech (Progress tab → Voice).
- Stroke-order animation loads hanzi-writer from a CDN (needs internet). Voice recognition for oral practice works in Chrome/Safari.
- Lesson data: `data/lesson-N.js` (transcribed from the scanned textbook; spot-check against your book).
