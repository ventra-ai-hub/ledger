/* Ventra Ledger — Service Worker.
   Registered from /ledger/sw.js so its scope is /ledger/ — never the root.
   Strategy:
     • Precache the local app shell (relative URLs that resolve under scope)
     • Stale-while-revalidate for the Tailwind CDN + Google Fonts
     • Bypass api.github.com entirely — sync always hits the live network
     • On activate, drop any older `ledger-v*` caches
*/
const CACHE_NAME = 'ledger-v1';

// All paths relative to the SW's scope (/ledger/). Resolves to /ledger/...
const APP_SHELL = [
  './',
  './ledger.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-maskable-512.png'
];

const STALE_WHILE_REVALIDATE_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Precache best-effort: don't fail install if one resource is briefly
    // unavailable. Each addAll member is fetched fresh.
    await Promise.all(APP_SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] precache failed for', url, err); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('ledger-v') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GETs. PATCH/POST to GitHub etc. always pass through.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept GitHub API — sync always hits live network.
  if (url.hostname === 'api.github.com') return;

  // Stale-while-revalidate for Tailwind + Google Fonts.
  if (STALE_WHILE_REVALIDATE_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Same-origin: cache-first with network fallback (precache covers the
  // app shell; anything else falls through to fetch).
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Offline + nothing cached — fall back to the app shell so the user
    // at least gets the UI (loaded from localStorage).
    if (req.mode === 'navigate') {
      const shell = await cache.match('./ledger.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetched = fetch(req).then(res => {
    if (res && res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return cached || (await fetched) || Promise.reject(new Error('SW fetch failed'));
}
