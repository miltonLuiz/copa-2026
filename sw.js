const CACHE_NAME = 'copa2026-v23';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './data/standings.json',
  './data/matches.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Retorna true se a requisição é uma navegação para o HTML do app.
// Cobre: mode 'navigate', /copa-2026/ (GitHub Pages), /copa-2026/index.html,
// raiz '/' e '/index.html' (domínio próprio/local).
function ehNavegacao(request, url) {
  if (request.mode === 'navigate') return true;
  const p = url.pathname;
  return p === '/'
    || p === '/index.html'
    || p === '/copa-2026/'
    || p === '/copa-2026/index.html'
    || p.endsWith('/index.html');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // standings.json e matches.json: network-first para garantir dados atualizados;
  // cai no cache apenas se a rede falhar (offline).
  if (url.pathname.endsWith('/data/standings.json') || url.pathname.endsWith('/data/matches.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copia));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Navegação (HTML): network-first para que o usuário veja a versão nova ao abrir
  // o atalho PWA, mesmo sem botão de reload. Usamos e.request.url (string) em vez
  // de e.request direto porque alguns browsers rejeitem fetch() com um Request de
  // mode 'navigate' passado diretamente — string é universalmente aceita.
  // cache: 'no-cache' força revalidação no CDN do GitHub Pages (max-age=600),
  // eliminando a janela de ~10 min de HTML velho.
  if (ehNavegacao(e.request, url)) {
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache' })
        .then(res => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request.url, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request)
            .then(cached => cached
              || caches.match('./index.html')
              || caches.match('./'))
        )
    );
    return;
  }

  // Demais recursos: cache-first (comportamento original)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
