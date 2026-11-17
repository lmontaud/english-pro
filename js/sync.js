/* English Pro — synchronisation entre appareils via un Gist GitHub privé (gratuit).
   La progression est stockée dans un fichier « english-pro-progression.json » d'un Gist secret.
   La clé (jeton GitHub, permission « gist » seulement) reste sur l'appareil : elle n'est jamais
   incluse dans la progression ni dans les fichiers d'export.
   createClient() reçoit fetch et le stockage en paramètre : testable sans réseau. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  var CONFIG_KEY = 'english-pro-sync-v1';
  var FILE = 'english-pro-progression.json';
  var API = 'https://api.github.com';

  function SyncError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  var MESSAGES = {
    auth: 'La clé GitHub est refusée : elle est incorrecte, expirée ou n\'a pas la permission « gist ».',
    scope: 'Cette clé n\'a pas la permission « gist ». Créez-en une nouvelle en cochant uniquement « gist ».',
    offline: 'Pas de connexion à GitHub pour l\'instant. La synchronisation reprendra plus tard.',
    blocked: 'La synchronisation n\'est pas possible dans cette prévisualisation. Elle fonctionnera une fois l\'application en ligne.',
    remote: 'La sauvegarde en ligne est illisible. Rien n\'a été modifié sur cet appareil.',
    server: 'GitHub ne répond pas correctement pour l\'instant. Réessayez dans quelques minutes.'
  };

  function createClient(opts) {
    var fetchFn = opts.fetch;
    var storage = opts.storage;
    var config = null;
    try { config = JSON.parse(storage.getItem(CONFIG_KEY) || 'null'); } catch (e) { config = null; }

    function saveConfig() {
      try {
        if (config) storage.setItem(CONFIG_KEY, JSON.stringify(config));
        else storage.removeItem(CONFIG_KEY);
      } catch (e) { /* stockage indisponible : la connexion durera le temps de la session */ }
    }

    function request(method, path, token, body) {
      var init = {
        method: method,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        cache: 'no-store'
      };
      if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
      return Promise.resolve().then(function () { return fetchFn(path.indexOf('http') === 0 ? path : API + path, init); })
        .then(function (res) {
          if (res.status === 401) throw SyncError('auth', MESSAGES.auth);
          if (res.status === 403 || res.status === 422) {
            return res.json().catch(function () { return {}; }).then(function (j) {
              var limited = res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining') === '0';
              throw limited ? SyncError('server', MESSAGES.server) : SyncError('scope', MESSAGES.scope + (j && j.message ? ' (' + j.message + ')' : ''));
            });
          }
          if (res.status === 404) throw SyncError('notfound', 'Introuvable');
          if (!res.ok) throw SyncError('server', MESSAGES.server);
          return res.json();
        }, function (err) {
          if (err && err.code) throw err;
          throw SyncError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network', MESSAGES.offline);
        });
    }

    /** Lit le contenu du fichier de progression dans un Gist (ou null s'il n'y est pas). */
    function readFile(gist, token) {
      var f = gist && gist.files && gist.files[FILE];
      if (!f) return Promise.resolve(null);
      if (!f.truncated && typeof f.content === 'string') return Promise.resolve(f.content);
      return fetchFn(f.raw_url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw SyncError('server', MESSAGES.server);
        return r.text();
      });
    }

    /** Cherche parmi les Gists du compte celui qui contient la progression. */
    function findGist(token) {
      return request('GET', '/gists?per_page=100', token).then(function (list) {
        var found = (list || []).filter(function (g) { return g.files && g.files[FILE]; });
        found.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
        return found.length ? found[0].id : null;
      });
    }

    function createGist(token, content) {
      return request('POST', '/gists', token, {
        description: 'English Pro : progression (synchronisation entre appareils)',
        public: false,
        files: (function () { var f = {}; f[FILE] = { content: content }; return f; })()
      }).then(function (g) { return g.id; });
    }

    /**
     * Connecte l'appareil : vérifie la clé, retrouve le Gist existant ou en crée un.
     * Renvoie { login, created }.
     */
    function connect(token, initialContent) {
      token = String(token || '').trim();
      if (!/^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[0-9a-f]{40})$/.test(token)) {
        return Promise.reject(SyncError('format', 'Ce texte ne ressemble pas à une clé GitHub (elle commence par « ghp_ »). Copiez-la en entier.'));
      }
      var login = '';
      return request('GET', '/user', token).then(function (u) {
        login = (u && u.login) || '';
        return findGist(token);
      }).then(function (id) {
        if (id) return { id: id, created: false };
        return createGist(token, initialContent).then(function (newId) { return { id: newId, created: true }; });
      }).then(function (r) {
        config = { token: token, gistId: r.id, login: login, lastSync: null, connectedAt: Date.now() };
        saveConfig();
        return { login: login, created: r.created };
      });
    }

    function disconnect() { config = null; saveConfig(); }

    /**
     * Synchronise : télécharge la progression en ligne, la fusionne avec celle de l'appareil
     * (via merge(localState, remoteState) fourni par l'appelant) et renvoie le résultat en ligne.
     * Renvoie { state, pulled, pushed }.
     */
    function sync(localState, merge, exportFn, importFn) {
      if (!config) return Promise.reject(SyncError('off', 'Synchronisation non configurée.'));
      var token = config.token;
      var remote = null;
      return request('GET', '/gists/' + config.gistId, token).then(function (gist) {
        return readFile(gist, token);
      }, function (err) {
        if (err.code === 'notfound') {               // Gist supprimé entre-temps : on en recrée un
          return createGist(token, exportFn(localState)).then(function (id) { config.gistId = id; saveConfig(); return null; });
        }
        throw err;
      }).then(function (content) {
        if (content) {
          var parsed = importFn(content);
          if (!parsed.ok) throw SyncError('remote', MESSAGES.remote);
          remote = parsed.state;
        }
        var merged = remote ? merge(localState, remote) : localState;
        var fp = EP.merge.fingerprint;
        var needPush = !remote || fp(merged) !== fp(remote) || remote.deviceId !== merged.deviceId;
        var push = needPush
          ? request('PATCH', '/gists/' + config.gistId, token, { files: (function () { var f = {}; f[FILE] = { content: exportFn(merged) }; return f; })() })
          : Promise.resolve();
        return push.then(function () {
          config.lastSync = Date.now();
          saveConfig();
          return { state: merged, pulled: !!remote, pushed: needPush };
        });
      });
    }

    return {
      get config() { return config; },
      isConnected: function () { return !!(config && config.token && config.gistId); },
      connect: connect, disconnect: disconnect, sync: sync
    };
  }

  EP.syncCore = { createClient: createClient, CONFIG_KEY: CONFIG_KEY, FILE: FILE, MESSAGES: MESSAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.syncCore;
})(typeof self !== 'undefined' ? self : globalThis);
