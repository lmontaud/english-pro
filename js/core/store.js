/* English Pro — état de l'application : valeurs par défaut, sauvegarde locale,
   export / import JSON, gestion des « Mes mots ». */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  var STORAGE_KEY = 'english-pro-state-v1';
  var APP_ID = 'english-pro';
  var VERSION = 1;

  /** Identifiant aléatoire de l'appareil : sert à additionner l'XP de plusieurs appareils sans doublon. */
  function newDeviceId() {
    var s = '';
    for (var i = 0; i < 8; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'.charAt(Math.floor(Math.random() * 32));
    return s;
  }

  function defaultState(nowMs) {
    return {
      version: VERSION,
      deviceId: newDeviceId(),
      createdAt: nowMs || 0,
      settings: {
        goalMinutes: 5,          // 5, 10 ou 15
        voice: 'en-GB',          // en-GB ou en-US
        rate: 1,                 // 1 ou 0.75
        listening: true,         // exercices d'écoute activés
        reminderTime: '19:00',
        notifications: false,
        flashFront: 'fr'         // recto des flashcards : fr ou en
      },
      cards: {},                 // fiches de révision par id d'item
      hearts: { count: 5, ts: null },
      xp: { total: 0, days: {} },  // XP gagnée sur CET appareil
      peers: {},                 // XP des autres appareils synchronisés : { idAppareil: { total, days } }
      streak: { count: 0, best: 0, last: null, freezes: 0, frozen: [] },
      custom: [],                // « Mes mots »
      customSeq: 0,
      customDeleted: [],         // mots supprimés (pour que la suppression se propage à la synchronisation)
      sessions: 0,
      lastExport: null
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  /** Complète un état partiel ou ancien avec les valeurs par défaut (sans rien écraser). */
  function migrate(raw, nowMs) {
    var d = defaultState(nowMs);
    if (!isObj(raw)) return d;
    var s = d;
    s.createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : d.createdAt;
    if (typeof raw.deviceId === 'string' && /^[a-z0-9]{4,32}$/.test(raw.deviceId)) s.deviceId = raw.deviceId;
    if (isObj(raw.settings)) {
      Object.keys(d.settings).forEach(function (k) {
        if (raw.settings[k] !== undefined && typeof raw.settings[k] === typeof d.settings[k]) s.settings[k] = raw.settings[k];
      });
    }
    if ([5, 10, 15].indexOf(s.settings.goalMinutes) === -1) s.settings.goalMinutes = 5;
    if (s.settings.voice !== 'en-US') s.settings.voice = 'en-GB';
    if (s.settings.rate !== 0.75) s.settings.rate = 1;
    if (!/^\d{2}:\d{2}$/.test(s.settings.reminderTime)) s.settings.reminderTime = '19:00';
    if (isObj(raw.cards)) {
      Object.keys(raw.cards).forEach(function (id) {
        var c = raw.cards[id];
        if (!isObj(c)) return;
        s.cards[id] = {
          step: Math.max(0, Math.min(7, c.step | 0)),
          due: typeof c.due === 'string' ? c.due : null,
          seen: c.seen | 0, ok: c.ok | 0, ko: c.ko | 0,
          last: typeof c.last === 'string' ? c.last : null,
          ts: typeof c.ts === 'number' ? c.ts : 0
        };
      });
    }
    if (isObj(raw.hearts)) {
      s.hearts.count = Math.max(0, Math.min(5, raw.hearts.count == null ? 5 : raw.hearts.count | 0));
      s.hearts.ts = typeof raw.hearts.ts === 'number' ? raw.hearts.ts : null;
    }
    if (isObj(raw.xp)) {
      s.xp.total = Math.max(0, raw.xp.total | 0);
      if (isObj(raw.xp.days)) {
        Object.keys(raw.xp.days).forEach(function (k) { s.xp.days[k] = raw.xp.days[k] | 0; });
      }
    }
    if (isObj(raw.peers)) {
      Object.keys(raw.peers).forEach(function (id) {
        var p = raw.peers[id];
        if (!isObj(p) || id === s.deviceId) return;
        var days = {};
        if (isObj(p.days)) Object.keys(p.days).forEach(function (k) { days[k] = Math.max(0, p.days[k] | 0); });
        s.peers[id] = { total: Math.max(0, p.total | 0), days: days };
      });
    }
    if (isObj(raw.streak)) {
      s.streak.count = Math.max(0, raw.streak.count | 0);
      s.streak.best = Math.max(s.streak.count, raw.streak.best | 0);
      s.streak.last = typeof raw.streak.last === 'string' ? raw.streak.last : null;
      s.streak.freezes = Math.max(0, Math.min(2, raw.streak.freezes | 0));
      s.streak.frozen = Array.isArray(raw.streak.frozen) ? raw.streak.frozen.filter(function (x) { return typeof x === 'string'; }) : [];
    }
    if (Array.isArray(raw.custom)) {
      raw.custom.forEach(function (w) {
        if (isObj(w) && typeof w.id === 'string' && typeof w.en === 'string' && typeof w.fr === 'string') {
          s.custom.push({
            id: w.id, en: w.en, fr: w.fr,
            example: typeof w.example === 'string' ? w.example : '',
            theme: typeof w.theme === 'string' ? w.theme : 'custom',
            createdAt: typeof w.createdAt === 'number' ? w.createdAt : 0
          });
        }
      });
    }
    s.customSeq = Math.max(raw.customSeq | 0, s.custom.length);
    if (Array.isArray(raw.customDeleted)) s.customDeleted = raw.customDeleted.filter(function (x) { return typeof x === 'string'; }).slice(-500);
    s.sessions = raw.sessions | 0;
    s.lastExport = typeof raw.lastExport === 'number' ? raw.lastExport : null;
    return s;
  }

  /** Texte JSON du fichier d'export. */
  function exportState(state, nowMs) {
    return JSON.stringify({ app: APP_ID, version: VERSION, exportedAt: nowMs || 0, state: state }, null, 2);
  }

  /** Lit un fichier d'export. Renvoie { ok, state } ou { ok: false, error }. */
  function importState(text, nowMs) {
    var data;
    try { data = JSON.parse(text); } catch (err) {
      return { ok: false, error: 'Ce fichier n\'est pas un JSON valide.' };
    }
    if (!isObj(data) || data.app !== APP_ID || !isObj(data.state)) {
      return { ok: false, error: 'Ce fichier n\'est pas une sauvegarde English Pro.' };
    }
    if (typeof data.version === 'number' && data.version > VERSION) {
      return { ok: false, error: 'Cette sauvegarde vient d\'une version plus récente de l\'application.' };
    }
    return { ok: true, state: migrate(data.state, nowMs) };
  }

  /**
   * Accès au stockage local. `backend` suit l'interface de localStorage.
   * Si le stockage est indisponible (navigation privée, iframe…), l'état reste en mémoire
   * et `persistent` vaut false : l'interface prévient l'utilisateur.
   */
  function createStore(backend) {
    var memory = null;
    var persistent = true;
    try {
      if (!backend) throw new Error('no storage');
      backend.setItem(STORAGE_KEY + ':test', '1');
      backend.removeItem(STORAGE_KEY + ':test');
    } catch (err) { persistent = false; }
    return {
      get persistent() { return persistent; },
      load: function (nowMs) {
        var raw = null;
        try { raw = persistent ? backend.getItem(STORAGE_KEY) : memory; } catch (err) { persistent = false; raw = memory; }
        if (!raw) return defaultState(nowMs);
        try { return migrate(JSON.parse(raw), nowMs); } catch (err2) { return defaultState(nowMs); }
      },
      save: function (state) {
        var text = JSON.stringify(state);
        memory = text;
        if (!persistent) return false;
        try { backend.setItem(STORAGE_KEY, text); return true; } catch (err) { persistent = false; return false; }
      },
      clear: function () {
        memory = null;
        try { if (persistent) backend.removeItem(STORAGE_KEY); } catch (err) { /* rien */ }
      }
    };
  }

  /* ---------- Mes mots ---------- */

  /** Ajoute un mot personnel. Renvoie { ok, word } ou { ok: false, error }. */
  function addCustomWord(state, input, nowMs) {
    var en = String((input && input.en) || '').trim();
    var fr = String((input && input.fr) || '').trim();
    var example = String((input && input.example) || '').trim();
    var theme = String((input && input.theme) || 'custom').trim() || 'custom';
    if (!en) return { ok: false, error: 'Indiquez le terme anglais.' };
    if (!fr) return { ok: false, error: 'Indiquez la traduction française.' };
    if (en.length > 120 || fr.length > 120 || example.length > 300) return { ok: false, error: 'Texte trop long.' };
    var norm = EP.grading ? EP.grading.normalize : function (x) { return x.toLowerCase(); };
    var dup = state.custom.some(function (w) { return norm(w.en) === norm(en) && norm(w.fr) === norm(fr); });
    if (dup) return { ok: false, error: 'Ce mot est déjà dans votre liste.' };
    state.customSeq = (state.customSeq | 0) + 1;
    // l'identifiant de l'appareil évite qu'un mot créé sur le téléphone et un autre créé sur le PC portent le même id
    var word = { id: 'custom-' + (state.deviceId ? state.deviceId + '-' : '') + state.customSeq, en: en, fr: fr, example: example, theme: theme, createdAt: nowMs || 0 };
    state.custom.push(word);
    return { ok: true, word: word };
  }

  function removeCustomWord(state, id) {
    var before = state.custom.length;
    state.custom = state.custom.filter(function (w) { return w.id !== id; });
    delete state.cards[id];
    if (state.custom.length < before) {
      if (!Array.isArray(state.customDeleted)) state.customDeleted = [];
      state.customDeleted.push(id);
      return true;
    }
    return false;
  }

  EP.store = {
    STORAGE_KEY: STORAGE_KEY, APP_ID: APP_ID, VERSION: VERSION,
    newDeviceId: newDeviceId, defaultState: defaultState, migrate: migrate, exportState: exportState, importState: importState,
    createStore: createStore, addCustomWord: addCustomWord, removeCustomWord: removeCustomWord
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.store;
})(typeof self !== 'undefined' ? self : globalThis);
