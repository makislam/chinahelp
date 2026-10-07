/* Offline cache. Bump VERSION when you change any file so users get updates. */
const VERSION = 'ch101-v3';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', "css/style.css","data/lesson-1.js","data/lesson-10.js","data/lesson-11.js","data/lesson-12.js","data/lesson-13.js","data/lesson-14.js","data/lesson-2.js","data/lesson-3.js","data/lesson-4.js","data/lesson-5.js","data/lesson-6.js","data/lesson-7.js","data/lesson-8.js","data/lesson-9.js","js/app.js","js/data.js","js/quizzes.js","js/util.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
