/* English Pro — service worker : rend l'application utilisable hors ligne.
   Stratégie « cache d'abord, mise à jour en arrière-plan » : l'app s'ouvre instantanément,
   même sans réseau, et toute modification (code ou contenu) apparaît au lancement suivant.
   Il n'y a donc rien à modifier ici quand vous ajoutez du contenu. */
'use strict';

var CACHE = 'english-pro-v2';

var CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/core/util.js',
  'js/core/srs.js',
  'js/core/grading.js',
  'js/core/game.js',
  'js/core/content.js',
  'js/core/session.js',
  'js/core/store.js',
  'js/core/reminder.js',
  'js/core/chart.js',
  'js/core/merge.js',
  'js/sync.js',
  'js/tts.js',
  'js/ui.js',
  'js/exercises.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'content/index.json'
];

/** Met en cache le socle, puis tous les fichiers de thèmes listés dans content/index.json. */
function precache() {
  return caches.open(CACHE).then(function (cache) {
    return cache.addAll(CORE).then(function () {
      return fetch('content/index.json', { cache: 'no-cache' })
        .then(function (r) { return r.json(); })
        .then(function (index) {
          var files = (index.files || []).map(function (f) { return 'content/' + f; });
          return Promise.all(files.map(function (url) {
            return cache.add(url).catch(function () { /* fichier manquant : ignoré */ });
          }));
        })
        .catch(function () { /* hors ligne à l'installation : les thèmes seront mis en cache à la demande */ });
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k !== CACHE && k.indexOf('english-pro-') === 0 ? caches.delete(k) : null; }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () {
          if (cached) return cached;
          if (req.mode === 'navigate') return cache.match('index.html');
          return new Response('', { status: 504, statusText: 'Hors ligne' });
        });
        if (cached) { event.waitUntil(network); return cached; }
        return network;
      });
    })
  );
});

/* Un appui sur la notification de rappel ouvre (ou réaffiche) l'application. */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
