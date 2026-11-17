/* English Pro — application : chargement du contenu, écrans, déroulement des sessions. */
(function () {
  'use strict';
  var EP = window.EP;
  var U = EP.util, SRS = EP.srs, G = EP.game, C = EP.content, S = EP.session, ST = EP.store,
    R = EP.reminder, UI = EP.ui, TTS = EP.tts, MG = EP.merge, h = UI.h;

  var APP_VERSION = '1.1.0';
  var CUSTOM_THEME = { id: 'custom', title: 'Mes mots (divers)', icon: '📝', description: 'Vos mots personnels sans thème.' };

  // Horloge décalable (utilisée par les tests de bout en bout pour simuler des dates).
  EP.clock = EP.clock || { offset: 0 };
  function now() { return Date.now() + (EP.clock.offset || 0); }
  function today() { return U.dayKey(new Date(now())); }

  var app = EP.app = {
    version: APP_VERSION, state: null, store: null, themes: [], items: [], byId: {},
    tab: 'accueil', sub: null, session: null, flash: null, contentErrors: [], installPrompt: null,
    swRegistration: null, tick: null, notifTimer: null
  };
  var main, nav;

  function save() {
    var ok = app.store.save(app.state);
    scheduleSync();
    return ok;
  }

  /* ====================== Synchronisation entre appareils ====================== */

  var syncTimer = null;
  var sync = EP.sync = {
    client: null, running: false, pending: false, error: null,
    /** La synchronisation ne fonctionne que sur l'app en ligne (pas dans un fichier ouvert localement ni une page intégrée). */
    available: function () { return typeof fetch === 'function' && /^https?:$/.test(location.protocol) && !UI.inFrame(); },
    isConnected: function () { return !!(sync.client && sync.client.isConnected()); }
  };

  function initSync() {
    var storage;
    try { storage = window.localStorage; storage.getItem('x'); } catch (e) {
      var mem = {};
      storage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
    }
    sync.client = EP.syncCore.createClient({ fetch: function (u, o) { return window.fetch(u, o); }, storage: storage });
  }

  function scheduleSync(delay) {
    if (!sync.isConnected() || !sync.available()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { runSync(false); }, delay == null ? 4000 : delay);
  }

  /** Fusionne la progression en ligne avec celle de l'appareil. manual : déclenché par l'utilisateur. */
  function runSync(manual) {
    if (!sync.isConnected()) return Promise.resolve(null);
    if (!sync.available()) { if (manual) UI.toast(EP.syncCore.MESSAGES.blocked); return Promise.resolve(null); }
    // pendant un exercice, on ne touche pas à la progression : on synchronisera à la sortie
    if (sync.running || app.sub === 'session' || app.sub === 'flash') { sync.pending = true; return Promise.resolve(null); }
    sync.running = true;
    sync.pending = false;
    if (manual) UI.toast('Synchronisation…', 1500);
    return sync.client.sync(app.state,
      function (l, r) { return MG.mergeStates(l, r, today()); },
      function (s) { return ST.exportState(s, now()); },
      function (t) { return ST.importState(t, now()); }
    ).then(function (res) {
      sync.running = false;
      sync.error = null;
      if (app.sub === 'session' || app.sub === 'flash') { sync.pending = true; return res; }   // un exercice a commencé entre-temps
      var before = MG.fingerprint(app.state);
      Object.keys(res.state).forEach(function (k) { app.state[k] = res.state[k]; });   // remplacement sur place
      app.store.save(app.state);
      if (MG.fingerprint(app.state) !== before) {
        rebuildItems();
        if (!app.sub && (app.tab !== 'mots' || manual)) render();
      } else if (!app.sub && app.tab === 'reglages') render();
      if (manual) UI.toast('Progression synchronisée.');
      return res;
    }, function (err) {
      sync.running = false;
      sync.error = err;
      if (err.code === 'offline' || err.code === 'network') sync.pending = true;
      if (manual) UI.modal({ title: 'Synchronisation impossible', body: err.message });
      else if (!app.sub && (err.code === 'auth' || err.code === 'scope')) render();
      return null;
    });
  }

  function syncIfStale() {
    var c = sync.client && sync.client.config;
    if (sync.isConnected() && (sync.pending || !c.lastSync || Date.now() - c.lastSync > 60000)) runSync(false);
  }

  var ICONS = {
    flame: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12.4 2.2c.6 3.2 4.9 5.4 4.9 10.3a5.3 5.3 0 0 1-10.6 0c0-1.7.6-3.1 1.5-4.2.2 1.4.9 2.2 1.8 2.5-.3-3.3 1-6.6 2.4-8.6z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 20.6S4.2 15.9 4.2 10.1A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.5-7.8 10.5z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M13.5 2 5 13.6h5.6L9.8 22 19 10.2h-5.8z"/></svg>',
    snow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/></svg>',
    words: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M12 9v7M8.5 12.5h7"/></svg>',
    stats: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>'
  };
  function icon(name, cls) { return h('span', { class: 'icon ' + (cls || ''), html: ICONS[name] }); }

  /* ====================== Contenu ====================== */

  function fetchJSON(url, isRetry) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' : ' + r.status);
      return r.json();
    }).catch(function (err) {
      if (isRetry) throw err;
      // un second essai après une courte pause (réseau instable, cache en cours d'écriture)
      return new Promise(function (resolve) { setTimeout(resolve, 500); }).then(function () { return fetchJSON(url, true); });
    });
  }

  function loadContent() {
    if (window.EP_CONTENT) return Promise.resolve(window.EP_CONTENT);
    return fetchJSON('content/index.json').then(function (index) {
      return Promise.all((index.files || []).map(function (file) {
        return fetchJSON('content/' + file).catch(function (err) {
          console.warn('[English Pro] Thème illisible :', file, err);
          app.contentErrors.push(file);
          return null;
        });
      }));
    });
  }

  function installContent(files) {
    var seen = {};
    app.themes = [];
    (files || []).forEach(function (t) {
      if (!t || !t.id || !Array.isArray(t.items)) return;
      var theme = { id: t.id, title: t.title || t.id, icon: t.icon || '📘', description: t.description || '', items: [] };
      t.items.forEach(function (it) {
        if (it && !it.theme) it.theme = t.id;
        var errors = C.validateItem(it);
        if (it && seen[it.id]) errors.push('id en double');
        if (errors.length) { console.warn('[English Pro] Item ignoré', it && it.id, errors); return; }
        seen[it.id] = 1;
        theme.items.push(it);
      });
      app.themes.push(theme);
    });
    rebuildItems();
  }

  function rebuildItems() {
    app.items = [];
    app.byId = {};
    function add(it) { app.items.push(it); app.byId[it.id] = it; }
    app.themes.forEach(function (t) { t.items.forEach(add); });
    var known = {};
    app.themes.forEach(function (t) { known[t.id] = 1; });
    app.state.custom.forEach(function (w) {
      var it = C.customToItem(w);
      if (!known[it.theme]) it.theme = CUSTOM_THEME.id;
      add(it);
    });
  }

  function audioOK() { return TTS.status().available && app.state.settings.listening; }

  function availableItems() {
    if (audioOK()) return app.items;
    return app.items.filter(function (it) { return !C.needsAudio(it); });
  }

  function themeList() {
    var list = app.themes.slice();
    if (app.items.some(function (it) { return it.theme === CUSTOM_THEME.id; })) list.push(CUSTOM_THEME);
    return list;
  }

  function themeStats(themeId, items) {
    var cards = app.state.cards, total = 0, learned = 0, sum = 0, fresh = 0;
    (items || availableItems()).forEach(function (it) {
      if (it.theme !== themeId) return;
      total++;
      var c = cards[it.id];
      sum += SRS.mastery(c);
      if (SRS.isLearned(c)) learned++;
      if (SRS.isNew(c)) fresh++;
    });
    return { total: total, learned: learned, fresh: fresh, mastery: total ? Math.round(100 * sum / total) : 0 };
  }

  /* ====================== Navigation ====================== */

  var TABS = [
    { id: 'accueil', label: 'Accueil', icon: 'home' },
    { id: 'mots', label: 'Mes mots', icon: 'words' },
    { id: 'stats', label: 'Stats', icon: 'stats' },
    { id: 'reglages', label: 'Réglages', icon: 'gear' }
  ];
  var useHistory = !UI.inFrame();

  function renderNav() {
    UI.clear(nav);
    TABS.forEach(function (t) {
      nav.appendChild(h('button', {
        class: 'tab', type: 'button', 'aria-current': app.tab === t.id ? 'page' : null,
        onclick: function () { goTab(t.id); }
      }, [icon(t.icon), h('span', { text: t.label })]));
    });
  }

  function goTab(id) {
    app.sub = null; app.session = null; app.flash = null;
    app.tab = id;
    try { if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id); } catch (e) { /* rien */ }
    render();
  }

  function inSubState() { try { return !!(history.state && history.state.ep === 'sub'); } catch (e) { return false; } }

  function openSub(name) {
    app.sub = name;
    // Une entrée d'historique par sous-écran : le geste « retour » du téléphone ferme la session, pas l'application.
    if (useHistory && !inSubState()) { try { history.pushState({ ep: 'sub' }, ''); } catch (e) { /* rien */ } }
  }

  function closeSub() {
    TTS.stop();
    app.sub = null; app.session = null; app.flash = null;
    if (useHistory && inSubState()) { try { history.back(); } catch (e) { /* rien */ } }
    render();
    if (sync.pending) scheduleSync(500);
  }

  /** Ferme le sous-écran en cours et revient à l'onglet Accueil. */
  function goHome() {
    app.tab = 'accueil';
    closeSub();
  }

  function syncHash() {
    try { if (location.hash !== '#' + app.tab) history.replaceState(history.state, '', '#' + app.tab); } catch (e) { /* rien */ }
  }

  function render() {
    clearInterval(app.tick); app.tick = null;
    TTS.stop();
    document.body.classList.toggle('in-sub', !!app.sub);
    nav.hidden = !!app.sub;
    if (!app.sub) renderNav();
    window.scrollTo(0, 0);
    if (app.sub === 'session') return renderSession();
    if (app.sub === 'summary') return;
    if (app.sub === 'flash') return renderFlash();
    if (app.sub === 'theme') return renderTheme(app.themeId);
    ({ accueil: renderHome, mots: renderWords, stats: renderStats, reglages: renderSettings }[app.tab] || renderHome)();
  }

  function setMain(children, cls) {
    UI.clear(main);
    main.className = 'main ' + (cls || '');
    UI.append(main, children);
  }

  /* ====================== Accueil ====================== */

  function pills() {
    var st = app.state, t = today();
    var streak = G.currentStreak(st, t);
    var hearts = G.refreshHearts(st, now());
    var doneToday = st.streak.last === t;
    var freezeEls = [];
    for (var i = 0; i < st.streak.freezes; i++) freezeEls.push(icon('snow', 'freeze'));
    return h('div', { class: 'pills' }, [
      h('div', { class: 'pill pill-streak' + (doneToday ? ' is-on' : ''), title: 'Série : jours consécutifs avec objectif atteint' }, [
        icon('flame'), h('strong', { id: 'streak-count', text: String(streak) }),
        h('span', { class: 'pill-label', text: streak > 1 ? 'jours' : 'jour' }), freezeEls
      ]),
      h('div', { class: 'pill pill-hearts', title: 'Cœurs' }, [
        icon('heart'), h('strong', { id: 'hearts-count', text: String(hearts) }),
        h('span', { class: 'pill-label', id: 'hearts-timer', text: '' })
      ]),
      h('div', { class: 'pill pill-xp', title: 'XP au total' }, [
        icon('bolt'), h('strong', { id: 'xp-total', text: String(G.totalXp(st)) }), h('span', { class: 'pill-label', text: 'XP' })
      ])
    ]);
  }

  function updateHeartsTimer() {
    var el = document.getElementById('hearts-timer'), cnt = document.getElementById('hearts-count');
    if (!el || !cnt) return;
    var before = cnt.textContent;
    var hearts = G.refreshHearts(app.state, now());
    cnt.textContent = String(hearts);
    var ms = G.nextHeartInMs(app.state, now());
    el.textContent = ms > 0 ? UI.formatDuration(ms) : '';
    el.title = ms > 0 ? 'Prochain cœur dans ' + UI.formatDuration(ms) : '';
    if (String(hearts) !== before) { save(); if (!app.sub && app.tab === 'accueil') renderHome(); }
  }

  function banner(kind, text, action) {
    return h('div', { class: 'banner banner-' + kind, role: kind === 'warn' ? 'alert' : 'status' }, [
      h('p', { text: text }),
      action ? h('button', { class: 'link', type: 'button', onclick: action.onClick }, action.label) : null
    ]);
  }

  function progressBar(value, max, cls) {
    var pct = max > 0 ? U.clamp(Math.round(100 * value / max), 0, 100) : 0;
    return h('div', { class: 'bar ' + (cls || ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
      h('div', { class: 'bar-fill', style: 'width:' + pct + '%' }));
  }

  function renderHome() {
    var st = app.state, t = today(), n = now();
    G.settleStreak(st, t);
    var hearts = G.refreshHearts(st, n);
    var goal = G.goalOf(st), xpToday = G.todayXp(st, t);
    var items = availableItems();
    var due = S.countDue(items, st.cards, t);
    var fresh = 0;
    items.forEach(function (it) { if (SRS.isNew(st.cards[it.id])) fresh++; });
    var seen = items.length - fresh;
    var reached = xpToday >= goal.xp;
    var tts = TTS.status();

    var banners = [];
    if (!app.store.persistent) {
      banners.push(banner('warn', 'Ce navigateur ne permet pas d\'enregistrer la progression ici : elle sera perdue à la fermeture. Exportez-la depuis les réglages.'));
    }
    if (app.contentErrors.length) {
      banners.push(banner('warn', 'Contenu illisible : ' + app.contentErrors.join(', ') + '. Vérifiez le format JSON de ces fichiers.'));
    }
    if (!tts.available) banners.push(banner('info', tts.reason));
    if (sync.error && (sync.error.code === 'auth' || sync.error.code === 'scope')) {
      banners.push(banner('warn', 'Synchronisation arrêtée : ' + sync.error.message, { label: 'Réglages', onClick: function () { goTab('reglages'); } }));
    }
    if (!reached && R.isPast(st.settings.reminderTime, new Date(n)) && seen > 0) {
      banners.push(banner('info', 'Il est plus de ' + st.settings.reminderTime.replace(':', ' h ') + ' : votre session du jour vous attend.'));
    }
    if (G.totalXp(st) >= 600 && !EP.sync.isConnected() && (!st.lastExport || n - st.lastExport > 14 * 86400000)) {
      banners.push(banner('info', 'Pensez à sauvegarder votre progression de temps en temps.', { label: 'Exporter', onClick: function () { goTab('reglages'); } }));
    }

    var cta, ctaNote;
    if (hearts <= 0) {
      cta = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: function () { startSession('training'); } }, 'Réviser pour regagner un cœur');
      ctaNote = 'Plus de cœurs : les nouvelles leçons sont en pause, les révisions restent ouvertes.';
    } else if (!fresh && !due) {
      cta = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: function () { startSession('daily'); } }, 'Entraînement libre');
      ctaNote = 'Tout est à jour : aucune révision due et aucun nouvel item.';
    } else {
      cta = h('button', { class: 'btn btn-primary btn-block', id: 'start-daily', type: 'button', onclick: function () { startSession('daily'); } },
        reached ? 'Faire une autre session' : (xpToday > 0 ? 'Continuer la session du jour' : 'Commencer la session du jour'));
      ctaNote = goal.size + ' exercices, environ ' + st.settings.goalMinutes + ' min';
    }

    var themeRows = themeList().map(function (th) {
      var s = themeStats(th.id, items);
      return h('button', { class: 'theme-row', type: 'button', onclick: function () { app.themeId = th.id; openSub('theme'); render(); } }, [
        h('span', { class: 'theme-icon', 'aria-hidden': 'true', text: th.icon }),
        h('span', { class: 'theme-body' }, [
          h('span', { class: 'theme-title', text: th.title }),
          progressBar(s.mastery, 100, 'bar-thin'),
          h('span', { class: 'theme-meta', text: s.learned + ' appris sur ' + s.total })
        ]),
        h('span', { class: 'theme-pct', text: s.mastery + ' %' })
      ]);
    });

    setMain([
      h('header', { class: 'home-head' }, [h('h1', { class: 'brand', text: 'English Pro' }), pills()]),
      banners,
      h('section', { class: 'card goal-card' }, [
        h('div', { class: 'goal-top' }, [
          h('h2', { text: reached ? 'Objectif du jour atteint' : 'Objectif du jour' }),
          h('span', { class: 'goal-xp', id: 'goal-xp', text: Math.min(xpToday, 9999) + ' / ' + goal.xp + ' XP' })
        ]),
        progressBar(xpToday, goal.xp, reached ? 'bar-done' : ''),
        h('p', { class: 'due-line' }, [
          h('strong', { id: 'due-count', text: String(due) }),
          due > 1 ? ' révisions dues' : ' révision due',
          fresh ? ', ' + fresh + ' items à découvrir' : ''
        ]),
        cta,
        h('p', { class: 'cta-note', text: ctaNote })
      ]),
      h('div', { class: 'duo' }, [
        h('button', { class: 'btn btn-soft', type: 'button', id: 'start-training', onclick: function () { startSession('training'); } }, [
          h('span', { class: 'btn-title', text: 'Entraînement' }), h('span', { class: 'btn-sub', text: 'Révisions, +1 cœur' })
        ]),
        h('button', { class: 'btn btn-soft', type: 'button', id: 'start-flash', onclick: function () { startFlashcards(null); } }, [
          h('span', { class: 'btn-title', text: 'Flashcards' }), h('span', { class: 'btn-sub', text: 'Révision libre' })
        ])
      ]),
      h('section', {}, [h('h2', { class: 'section-title', text: 'Thèmes' }), h('div', { class: 'theme-list' }, themeRows)])
    ]);
    clearInterval(app.tick);
    app.tick = setInterval(updateHeartsTimer, 1000);
    updateHeartsTimer();
  }

  /* ====================== Thème ====================== */

  function subHeader(title, onBack) {
    return h('header', { class: 'sub-head' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Retour', onclick: onBack || closeSub }, icon('back')),
      h('h1', { text: title })
    ]);
  }

  function renderTheme(themeId) {
    var th = themeList().filter(function (x) { return x.id === themeId; })[0];
    if (!th) return closeSub();
    var st = app.state, items = availableItems();
    var s = themeStats(themeId, items);
    var hearts = G.refreshHearts(st, now());
    var cards = items.filter(function (it) { return it.theme === themeId && C.flashcardOf(it); }).length;
    var learnedList = items.filter(function (it) { return it.theme === themeId && SRS.isLearned(st.cards[it.id]) && it.term; });
    setMain([
      subHeader(th.title),
      h('section', { class: 'card' }, [
        h('p', { class: 'theme-desc', text: th.description }),
        h('div', { class: 'stat-row' }, [
          statBox(s.mastery + ' %', 'maîtrise'), statBox(s.learned + ' / ' + s.total, 'items appris'), statBox(String(s.fresh), 'à découvrir')
        ]),
        progressBar(s.mastery, 100),
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button', id: 'start-theme',
          onclick: function () { startSession('theme', themeId); }
        }, hearts > 0 ? (s.fresh ? 'Leçon sur ce thème' : 'Réviser ce thème') : 'Réviser (plus de cœurs)'),
        h('p', { class: 'cta-note', text: 'Les nouveautés viennent de ce thème ; les révisions dues de tous les thèmes s\'y ajoutent.' }),
        cards ? h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: function () { startFlashcards(themeId); } }, 'Flashcards du thème (' + cards + ')') : null
      ]),
      learnedList.length ? h('section', {}, [
        h('h2', { class: 'section-title', text: 'Déjà appris' }),
        h('ul', { class: 'term-list' }, learnedList.map(function (it) {
          return h('li', {}, [h('span', { class: 'en', text: it.term }), h('span', { class: 'term-fr', text: it.fr }), UI.speakButton(it.term, 'speak-inline')]);
        }))
      ]) : null
    ], 'main-sub');
  }

  function statBox(value, label) {
    return h('div', { class: 'stat-box' }, [h('strong', { text: value }), h('span', { text: label })]);
  }

  /* ====================== Session ====================== */

  function startSession(mode, themeId) {
    var st = app.state, t = today(), n = now();
    var hearts = G.refreshHearts(st, n);
    var size = mode === 'training' ? 10 : G.goalOf(st).size;
    var built = S.buildSession({
      items: availableItems(), cards: st.cards, today: t, size: size, mode: mode, themeId: themeId,
      themeOrder: app.themes.map(function (x) { return x.id; }), hearts: hearts
    });
    if (!built.entries.length) {
      UI.toast(mode === 'training' || hearts <= 0
        ? 'Rien à réviser pour l\'instant : les révisions arrivent après votre première session.'
        : 'Aucun exercice disponible.');
      return false;
    }
    app.session = {
      mode: built.reviewsOnly ? 'training' : mode, themeId: themeId || null,
      queue: built.entries.slice(), done: 0, first: { n: 0, ok: 0 }, xp: 0, heartsLost: 0,
      goalReached: false, freezeEarned: false, startedAt: n
    };
    openSub('session');
    render();
    return true;
  }

  function quitSession() {
    UI.confirmModal('Quitter la session ?', 'Vos réponses sont déjà enregistrées. Le bonus de fin de session ne sera pas attribué.', 'Quitter', closeSub);
  }

  function applyResult(entry, res) {
    var st = app.state, s = app.session, t = today(), n = now(), id = entry.item.id;
    var info = { xp: 0, heartLost: false, noHearts: false };
    s.queue.shift();
    if (!entry.retry) {
      st.cards[id] = SRS.review(st.cards[id], res.result, t, n);
      s.first.n++;
      if (res.result !== 'wrong') {
        s.first.ok++;
        s.done++;
        info.xp = res.result === 'correct' ? G.XP.correct : G.XP.almost;
      } else {
        if (s.mode !== 'training' && G.refreshHearts(st, n) > 0) {
          G.loseHeart(st, n);
          info.heartLost = true;
          s.heartsLost++;
          if (st.hearts.count === 0) {
            // Plus de cœurs : on retire les nouveautés restantes, les révisions continuent.
            s.queue = s.queue.filter(function (e) { return !e.isNew || e.retry; });
            info.noHearts = true;
          }
        }
        s.queue.push({ item: entry.item, isNew: entry.isNew, wasDue: entry.wasDue, retry: true });
      }
    } else {
      s.done++;
      if (res.result !== 'wrong') info.xp = G.XP.retry;
    }
    if (info.xp) {
      var g = G.addXp(st, info.xp, t);
      s.xp += info.xp;
      if (g.reachedNow) s.goalReached = true;
      if (g.freezeEarned) s.freezeEarned = true;
    }
    save();
    return info;
  }

  var PRAISE = ['Correct !', 'Bien joué !', 'Exact !', 'Parfait !'];

  function renderSession() {
    var s = app.session, st = app.state;
    if (!s) return closeSub();
    var entry = s.queue[0];
    if (!entry) return finishSession();
    var item = entry.item;
    var checker = null, answered = false, hintUsed = false;
    var hearts = G.refreshHearts(st, now());

    var checkBtn = h('button', { class: 'btn btn-primary btn-block', id: 'check', type: 'button', disabled: true, onclick: doCheck }, 'Vérifier');
    var footer = h('div', { class: 'session-foot' }, checkBtn);
    var ctx = {
      settings: st.settings, rng: Math.random,
      ready: function (ok) { if (!answered) checkBtn.disabled = !ok; },
      setChecker: function (fn) { checker = fn; },
      requestCheck: doCheck,
      hideCheck: function (hide) { checkBtn.hidden = !!hide; },
      submit: function (res) { if (!answered) onResult(res); }
    };
    var exercise = EP.exercises.render(item, ctx);

    var tag = entry.retry ? 'À retenter' : entry.isNew ? 'Nouveau' : 'Révision';
    var hintBtn = null;
    if (entry.isNew && !entry.retry && item.term && item.fr && !C.isRecognition(item)) {
      hintBtn = h('button', { class: 'link hint-btn', type: 'button' }, 'Je ne connais pas encore : voir un indice');
      hintBtn.addEventListener('click', function () {
        hintUsed = true;
        hintBtn.replaceWith(h('p', { class: 'hint hint-reveal' }, [h('span', { class: 'en', text: item.term }), ' = ', item.fr]));
      });
    }

    var total = s.done + s.queue.length;
    setMain([
      h('header', { class: 'session-head' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitter la session', onclick: quitSession }, icon('close')),
        progressBar(s.done, total, 'bar-session'),
        h('div', { class: 'session-hearts' + (s.mode === 'training' ? ' is-muted' : ''), title: s.mode === 'training' ? 'Les erreurs ne coûtent pas de cœur en entraînement' : 'Cœurs' },
          [icon('heart'), h('strong', { id: 'session-hearts', text: String(hearts) })])
      ]),
      h('div', { class: 'session-body' }, [
        h('p', { class: 'ex-meta' }, [h('span', { class: 'tag tag-' + (entry.retry ? 'retry' : entry.isNew ? 'new' : 'review'), text: tag })]),
        h('h2', { class: 'instruction', text: C.instructionOf(item) }),
        exercise.el,
        hintBtn
      ]),
      footer
    ], 'main-session');
    main.setAttribute('data-item', item.id);
    main.setAttribute('data-type', item.type);
    if (exercise.focus && window.matchMedia && window.matchMedia('(min-width: 700px)').matches) exercise.focus();

    function doCheck() {
      if (answered || !checker || checkBtn.disabled) return;
      onResult(checker());
    }

    function onResult(res) {
      answered = true;
      if (hintUsed && res.result === 'correct') { res.result = 'almost'; res.assisted = true; }
      exercise.lock(res);
      if (hintBtn && hintBtn.parentNode) hintBtn.remove();
      var info = applyResult(entry, res);
      var heartsEl = document.getElementById('session-hearts');
      if (heartsEl) heartsEl.textContent = String(st.hearts.count);
      showFeedback(res, info);
    }

    function showFeedback(res, info) {
      var title;
      if (res.result === 'correct') title = PRAISE[s.first.n % PRAISE.length];
      else if (res.result === 'almost') title = res.assisted ? 'Correct, avec l\'indice' : 'Presque !';
      else title = 'Incorrect';
      var full = C.fullSentence(item);
      var lines = [];
      if (res.result === 'almost' && !res.assisted) lines.push(h('p', { class: 'fb-label', text: 'Attention à l\'orthographe :' }));
      else if (res.result === 'almost') lines.push(h('p', { class: 'fb-label', text: 'Cet item reviendra demain pour vérifier sans indice.' }));
      else if (res.result === 'wrong') lines.push(h('p', { class: 'fb-label', text: item.type === 'match' ? 'Les bonnes paires :' : 'Bonne réponse :' }));
      if (res.result !== 'correct' || item.type === 'error' || item.type === 'listen' || item.type === 'dictation') {
        lines.push(h('div', { class: 'fb-answer' }, [EP.exercises.answerNode(item), UI.speakButton(full, 'speak-inline')]));
      } else if (full) {
        lines.push(h('div', { class: 'fb-answer fb-answer-quiet' }, [h('p', { class: 'en answer-line', text: full }), UI.speakButton(full, 'speak-inline')]));
      }
      if (item.type === 'error') {
        var seg = C.errorSegments(item);
        lines.unshift(h('p', { class: 'fb-label' }, ['Le mot fautif était « ', h('span', { class: 'en', text: seg.segments[seg.wrongIndex] }), ' ». Phrase correcte :']));
      }
      lines.push(h('p', { class: 'fb-explain', text: item.explanation }));
      if (item.note) lines.push(h('p', { class: 'fb-note', text: item.note }));
      if (info.heartLost) lines.push(h('p', { class: 'fb-heart' }, [icon('heart'), ' −1 cœur']));
      if (info.noHearts) lines.push(h('p', { class: 'fb-note', text: 'Plus de cœurs : la session continue avec les révisions uniquement.' }));
      if (res.result === 'wrong' && !entry.retry) lines.push(h('p', { class: 'fb-note', text: 'Cet exercice reviendra à la fin de la session.' }));

      var cont = h('button', { class: 'btn btn-block btn-continue', id: 'continue', type: 'button', onclick: function () { TTS.stop(); renderSession(); } }, 'Continuer');
      var panel = h('div', { class: 'feedback fb-' + res.result, role: 'status', 'aria-live': 'polite' }, [
        h('h3', { class: 'fb-title', text: title }), lines, cont
      ]);
      UI.clear(footer);
      footer.appendChild(panel);
      footer.classList.add('has-feedback');
      try { cont.focus({ preventScroll: true }); } catch (e) { /* rien */ }
      panel.scrollIntoView({ block: 'end' });
    }
  }

  function finishSession() {
    var s = app.session, st = app.state, t = today(), n = now();
    var acc = s.first.n ? s.first.ok / s.first.n : 0;
    var g = G.addXp(st, G.XP.sessionBonus, t);
    s.xp += G.XP.sessionBonus;
    if (g.reachedNow) s.goalReached = true;
    if (g.freezeEarned) s.freezeEarned = true;
    st.sessions = (st.sessions | 0) + 1;
    var heartGained = false;
    G.refreshHearts(st, n);
    if (s.mode === 'training' && acc >= G.TRAINING_SUCCESS_RATE && st.hearts.count < G.HEART_MAX) {
      G.gainHeart(st, n);
      heartGained = true;
    }
    save();
    app.sub = 'summary';
    var goal = G.goalOf(st), xpToday = G.todayXp(st, t);
    var notes = [];
    if (s.goalReached) notes.push(h('p', { class: 'sum-note sum-good' }, [icon('flame'), ' Objectif du jour atteint : série de ' + st.streak.count + (st.streak.count > 1 ? ' jours.' : ' jour.')]));
    if (s.freezeEarned) notes.push(h('p', { class: 'sum-note' }, [icon('snow'), ' Gel de série gagné : il protégera votre série si vous manquez un jour.']));
    if (heartGained) notes.push(h('p', { class: 'sum-note' }, [icon('heart'), ' Entraînement réussi : +1 cœur.']));
    if (s.mode === 'training' && !heartGained && acc < G.TRAINING_SUCCESS_RATE) {
      notes.push(h('p', { class: 'sum-note', text: 'Il faut au moins 80 % de bonnes réponses du premier coup pour regagner un cœur.' }));
    }
    setMain([
      h('div', { class: 'summary' }, [
        h('div', { class: 'sum-badge', 'aria-hidden': 'true', html: '<svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 25l9 9 16-19"/></svg>' }),
        h('h1', { text: 'Session terminée' }),
        h('div', { class: 'stat-row' }, [
          statBox('+' + s.xp, 'XP gagnés'),
          statBox(Math.round(acc * 100) + ' %', 'du premier coup'),
          statBox(String(st.hearts.count), st.hearts.count > 1 ? 'cœurs restants' : 'cœur restant')
        ]),
        h('section', { class: 'card' }, [
          h('div', { class: 'goal-top' }, [h('h2', { text: 'Objectif du jour' }), h('span', { class: 'goal-xp', text: xpToday + ' / ' + goal.xp + ' XP' })]),
          progressBar(xpToday, goal.xp, xpToday >= goal.xp ? 'bar-done' : ''),
          notes
        ]),
        h('button', { class: 'btn btn-primary btn-block', id: 'summary-home', type: 'button', onclick: goHome }, 'Revenir à l\'accueil'),
        h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: function () { var m = s.mode === 'training' ? 'training' : (s.themeId ? 'theme' : 'daily'); if (!startSession(m, s.themeId)) closeSub(); } }, 'Enchaîner une autre session')
      ])
    ], 'main-sub');
    app.session = null;
  }

  /* ====================== Flashcards ====================== */

  function startFlashcards(themeId) {
    var st = app.state, t = today();
    var due = [], fresh = [], later = [];
    availableItems().forEach(function (it) {
      if (themeId && it.theme !== themeId) return;
      if (!C.flashcardOf(it)) return;
      var c = st.cards[it.id];
      if (SRS.isNew(c)) fresh.push(it); else if (SRS.isDue(c, t)) due.push(it); else later.push(it);
    });
    later.sort(function (a, b) { return st.cards[a.id].due < st.cards[b.id].due ? -1 : 1; });
    var deck = U.shuffle(due).concat(fresh.slice(0, 10)).concat(later).slice(0, 20);
    if (!deck.length) { UI.toast('Aucune flashcard disponible pour l\'instant.'); return false; }
    app.flash = { deck: deck, i: 0, known: 0, xp: 0, themeId: themeId || null };
    openSub('flash');
    render();
    return true;
  }

  function renderFlash() {
    var f = app.flash, st = app.state;
    if (!f) return closeSub();
    if (f.i >= f.deck.length) {
      save();
      setMain([
        h('div', { class: 'summary' }, [
          h('h1', { text: 'Paquet terminé' }),
          h('div', { class: 'stat-row' }, [statBox(f.known + ' / ' + f.deck.length, 'cartes sues'), statBox('+' + f.xp, 'XP gagnés')]),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: goHome }, 'Revenir à l\'accueil'),
          h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: function () { if (!startFlashcards(f.themeId)) closeSub(); } }, 'Nouveau paquet')
        ])
      ], 'main-sub');
      return;
    }
    var item = f.deck[f.i];
    var card = C.flashcardOf(item);
    var frontFr = st.settings.flashFront !== 'en';
    var flipped = false;
    var face = h('div', { class: 'flash-card', id: 'flash-card' });
    var actions = h('div', { class: 'session-foot' });

    function draw() {
      UI.clear(face);
      UI.clear(actions);
      if (!flipped) {
        face.appendChild(h('p', { class: 'flash-side', text: frontFr ? 'Français' : 'Anglais' }));
        face.appendChild(h('p', { class: 'flash-main ' + (frontFr ? 'fr' : 'en') }, [frontFr ? card.fr : card.en, frontFr ? null : UI.speakButton(card.en, 'speak-inline')]));
        actions.appendChild(h('button', { class: 'btn btn-primary btn-block', id: 'flash-flip', type: 'button', onclick: function () { flipped = true; draw(); } }, 'Retourner la carte'));
      } else {
        face.appendChild(h('p', { class: 'flash-main en' }, [card.en, UI.speakButton(card.en, 'speak-inline')]));
        face.appendChild(h('p', { class: 'flash-fr', text: card.fr }));
        if (card.example) face.appendChild(h('p', { class: 'flash-example en' }, [card.example, UI.speakButton(card.example, 'speak-inline')]));
        if (card.explanation) face.appendChild(h('p', { class: 'fb-explain', text: card.explanation }));
        actions.appendChild(h('div', { class: 'trio' }, [
          gradeBtn('Raté', 'wrong', 'btn-bad'), gradeBtn('Hésitant', 'almost', 'btn-mid'), gradeBtn('Je savais', 'correct', 'btn-good')
        ]));
      }
    }
    function gradeBtn(label, result, cls) {
      return h('button', {
        class: 'btn ' + cls, type: 'button', 'data-grade': result,
        onclick: function () {
          var t = today();
          st.cards[item.id] = SRS.review(st.cards[item.id], result, t, now());
          if (result !== 'wrong') { G.addXp(st, G.XP.flashcard, t); f.xp += G.XP.flashcard; }
          if (result === 'correct') f.known++;
          f.i++;
          save();
          TTS.stop();
          renderFlash();
        }
      }, label);
    }
    var toggle = h('button', {
      class: 'link', type: 'button',
      onclick: function () { st.settings.flashFront = frontFr ? 'en' : 'fr'; save(); renderFlash(); }
    }, frontFr ? 'Recto : français (changer)' : 'Recto : anglais (changer)');

    setMain([
      h('header', { class: 'session-head' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer les flashcards', onclick: closeSub }, icon('close')),
        progressBar(f.i, f.deck.length, 'bar-session'),
        h('span', { class: 'flash-count', text: (f.i + 1) + ' / ' + f.deck.length })
      ]),
      h('div', { class: 'session-body' }, [face, h('p', { class: 'center' }, toggle)]),
      actions
    ], 'main-session');
    draw();
  }

  /* ====================== Mes mots ====================== */

  function renderWords() {
    var st = app.state, t = today();
    var error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    var en = field('Terme anglais', 'word-en', { lang: 'en', placeholder: 'ex. write-off' });
    var fr = field('Traduction française', 'word-fr', { placeholder: 'ex. passage en perte' });
    var ex = field('Phrase d\'exemple (facultatif)', 'word-ex', { lang: 'en', placeholder: 'ex. The receivable was written off in March.' });
    var select = h('select', { id: 'word-theme', class: 'input' }, app.themes.map(function (th) {
      return h('option', { value: th.id, text: th.title });
    }).concat([h('option', { value: 'custom', text: 'Sans thème' })]));
    select.value = 'custom';

    function submit(ev) {
      ev.preventDefault();
      var res = ST.addCustomWord(st, { en: en.input.value, fr: fr.input.value, example: ex.input.value, theme: select.value }, now());
      if (!res.ok) { error.textContent = res.error; error.hidden = false; return; }
      save();
      rebuildItems();
      UI.toast('« ' + res.word.en + ' » ajouté à vos révisions.');
      renderWords();
    }

    var list = st.custom.slice().reverse().map(function (w) {
      var c = st.cards[w.id];
      var status = SRS.isNew(c) ? 'à découvrir' : SRS.isDue(c, t) ? 'à réviser' : 'prochaine révision le ' + UI.formatDay(c.due);
      return h('li', { class: 'word-item' }, [
        h('div', { class: 'word-main' }, [
          h('p', {}, [h('span', { class: 'en word-en', text: w.en }), UI.speakButton(w.en, 'speak-inline')]),
          h('p', { class: 'term-fr', text: w.fr }),
          w.example ? h('p', { class: 'en word-ex', text: w.example }) : null,
          h('p', { class: 'word-status', text: status })
        ]),
        h('button', {
          class: 'link link-danger', type: 'button', 'aria-label': 'Supprimer ' + w.en,
          onclick: function () {
            UI.confirmModal('Supprimer ce mot ?', '« ' + w.en + ' » et sa fiche de révision seront supprimés.', 'Supprimer', function () {
              ST.removeCustomWord(st, w.id); save(); rebuildItems(); renderWords();
            }, true);
          }
        }, 'Supprimer')
      ]);
    });

    setMain([
      h('h1', { class: 'page-title', text: 'Mes mots' }),
      h('p', { class: 'lead', text: 'Ajoutez les termes croisés en cours, en stage ou en mission. Ils entrent dans les révisions espacées et les flashcards comme le reste du contenu.' }),
      h('form', { class: 'card form', id: 'word-form', onsubmit: submit, novalidate: true }, [
        en.el, fr.el, ex.el,
        h('label', { class: 'field' }, [h('span', { text: 'Thème' }), select]),
        error,
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Ajouter le mot')
      ]),
      h('h2', { class: 'section-title', text: st.custom.length ? st.custom.length + (st.custom.length > 1 ? ' mots ajoutés' : ' mot ajouté') : 'Aucun mot pour l\'instant' }),
      st.custom.length ? h('ul', { class: 'word-list' }, list) : h('p', { class: 'empty', text: 'Votre premier mot apparaîtra ici, puis dans votre prochaine session.' })
    ]);
  }

  function field(label, id, attrs) {
    var input = h('input', Object.assign({
      class: 'input', id: id, type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false'
    }, attrs || {}));
    return { input: input, el: h('label', { class: 'field' }, [h('span', { text: label }), input]) };
  }

  /* ====================== Statistiques ====================== */

  function renderStats() {
    var st = app.state, t = today(), items = availableItems();
    var streak = G.currentStreak(st, t);
    var learned = 0;
    items.forEach(function (it) { if (SRS.isLearned(st.cards[it.id])) learned++; });

    // XP des 7 derniers jours
    var days = [], maxXp = G.goalOf(st).xp;
    for (var i = 6; i >= 0; i--) {
      var k = U.addDays(t, -i);
      var v = G.todayXp(st, k);
      if (v > maxXp) maxXp = v;
      days.push({ key: k, xp: v });
    }
    var names = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    var week = h('div', { class: 'week', role: 'img', 'aria-label': 'XP des sept derniers jours : ' + days.map(function (d) { return UI.formatDay(d.key) + ' ' + d.xp; }).join(', ') },
      days.map(function (d) {
        var p = d.key.split('-');
        var wd = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
        return h('div', { class: 'week-col' + (d.key === t ? ' is-today' : '') }, [
          h('span', { class: 'week-val', text: d.xp ? String(d.xp) : '' }),
          h('div', { class: 'week-track' }, h('div', { class: 'week-bar' + (st.streak.frozen.indexOf(d.key) !== -1 ? ' is-frozen' : ''), style: 'height:' + Math.round(100 * d.xp / maxXp) + '%' })),
          h('span', { class: 'week-day', text: names[wd] })
        ]);
      }));

    var themeRows = themeList().map(function (th) {
      var s = themeStats(th.id, items);
      return h('tr', {}, [
        h('th', { scope: 'row' }, [h('span', { 'aria-hidden': 'true', text: th.icon + ' ' }), th.title]),
        h('td', { text: s.mastery + ' %' }), h('td', { text: s.learned + ' / ' + s.total })
      ]);
    });

    var missed = [];
    Object.keys(st.cards).forEach(function (id) {
      var c = st.cards[id], it = app.byId[id];
      if (it && c.ko > 0) missed.push({ it: it, ko: c.ko, seen: c.seen });
    });
    missed.sort(function (a, b) { return b.ko - a.ko || b.seen - a.seen; });
    missed = missed.slice(0, 10);

    setMain([
      h('h1', { class: 'page-title', text: 'Statistiques' }),
      h('div', { class: 'stat-grid' }, [
        statBox(String(streak), streak > 1 ? 'jours de série' : 'jour de série'),
        statBox(String(st.streak.best), 'série record'),
        statBox(String(G.totalXp(st)), 'XP au total'),
        statBox(learned + ' / ' + items.length, 'items appris')
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Sept derniers jours' }), week,
        h('p', { class: 'cta-note', text: 'Objectif : ' + G.goalOf(st).xp + ' XP par jour. Gels de série disponibles : ' + st.streak.freezes + '.' })
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Par thème' }),
        h('table', { class: 'table' }, [
          h('thead', {}, h('tr', {}, [h('th', { scope: 'col', text: 'Thème' }), h('th', { scope: 'col', text: 'Maîtrise' }), h('th', { scope: 'col', text: 'Appris' })])),
          h('tbody', {}, themeRows)
        ])
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Items les plus souvent ratés' }),
        missed.length ? h('ol', { class: 'missed' }, missed.map(function (m) {
          var label = m.it.term || C.fullSentence(m.it) || (m.it.answers && m.it.answers[0]) || m.it.id;
          return h('li', {}, [
            h('span', { class: 'en', text: label }),
            m.it.fr ? h('span', { class: 'term-fr', text: m.it.fr }) : null,
            h('span', { class: 'missed-n', text: m.ko + (m.ko > 1 ? ' erreurs' : ' erreur') })
          ]);
        })) : h('p', { class: 'empty', text: 'Aucune erreur enregistrée pour l\'instant.' })
      ])
    ]);
  }

  /* ====================== Réglages ====================== */

  function segmented(label, options, value, onChange, id) {
    var group = h('div', { class: 'seg', role: 'group', 'aria-label': label, id: id || null }, options.map(function (o) {
      return h('button', {
        class: 'seg-btn', type: 'button', 'aria-pressed': String(o.value === value), 'data-value': String(o.value),
        onclick: function () { onChange(o.value); }
      }, o.label);
    }));
    return h('div', { class: 'setting' }, [h('p', { class: 'setting-label', text: label }), group]);
  }

  function formatSyncTime(ms) {
    if (!ms) return 'jamais';
    var d = new Date(ms), t = U.dayKey(d) === today() ? 'aujourd\'hui' : 'le ' + UI.formatDay(U.dayKey(d));
    return t + ' à ' + U.pad(d.getHours()) + ' h ' + U.pad(d.getMinutes());
  }

  function syncSection() {
    var title = h('h2', { text: 'Synchronisation entre appareils' });
    if (!sync.available()) {
      return h('section', { class: 'card', id: 'sync-card' }, [title,
        h('p', { class: 'cta-note', text: 'Disponible une fois l\'application en ligne (GitHub Pages ou Netlify) : votre progression est alors partagée entre votre téléphone et votre ordinateur, gratuitement, via un Gist GitHub privé.' })]);
    }
    if (sync.isConnected()) {
      var c = sync.client.config;
      return h('section', { class: 'card', id: 'sync-card' }, [title,
        h('p', {}, ['Connecté au compte GitHub ', h('strong', { text: c.login || '?' }), '.']),
        h('p', { class: 'cta-note', id: 'sync-last', text: 'Dernière synchronisation : ' + formatSyncTime(c.lastSync) + '. Elle se fait seule à l\'ouverture de l\'app et après chaque session.' }),
        sync.error ? h('p', { class: 'form-error', text: sync.error.message }) : null,
        h('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'sync-now', onclick: function () { runSync(true); } }, 'Synchroniser maintenant'),
        h('button', {
          class: 'btn btn-soft btn-block', type: 'button', id: 'sync-off',
          onclick: function () {
            UI.confirmModal('Déconnecter cet appareil ?', 'La progression reste sur cet appareil et dans votre Gist en ligne, mais ils ne seront plus synchronisés. Vous pourrez vous reconnecter avec la même clé.', 'Déconnecter', function () {
              sync.client.disconnect(); sync.error = null; renderSettings();
            });
          }
        }, 'Déconnecter cet appareil')
      ]);
    }
    var input = h('input', { class: 'input code-input', id: 'sync-token', type: 'password', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ghp_…', 'aria-label': 'Clé GitHub' });
    var err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    var btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit', id: 'sync-connect' }, 'Connecter cet appareil');
    function submit(ev) {
      ev.preventDefault();
      err.hidden = true;
      btn.disabled = true; btn.textContent = 'Connexion…';
      sync.client.connect(input.value, ST.exportState(app.state, now())).then(function (r) {
        return runSync(false).then(function () {
          sync.error = null;
          UI.toast(r.created ? 'Connecté. Votre progression est sauvegardée en ligne.' : 'Connecté. Progression fusionnée avec celle de vos autres appareils.');
          renderSettings();
        });
      }, function (e) {
        btn.disabled = false; btn.textContent = 'Connecter cet appareil';
        err.textContent = UI.typo(e.message); err.hidden = false;
      });
    }
    return h('section', { class: 'card', id: 'sync-card' }, [title,
      h('p', { class: 'cta-note', text: 'Pour retrouver la même progression sur votre téléphone et votre ordinateur. Gratuit : elle est rangée dans un Gist privé de votre compte GitHub.' }),
      h('details', { class: 'howto' }, [
        h('summary', { text: 'Créer la clé GitHub (une seule fois)' }),
        h('ol', {}, [
          h('li', { text: 'Sur github.com, connecté à votre compte : photo de profil → Settings → Developer settings → Personal access tokens → Tokens (classic).' }),
          h('li', { text: 'Generate new token (classic). Note : « English Pro ». Expiration : No expiration (ou 1 an).' }),
          h('li', { text: 'Cochez uniquement la case « gist », puis Generate token.' }),
          h('li', { text: 'Copiez la clé (elle commence par ghp_) et collez-la ci-dessous. Gardez-la dans une note : vous la collerez aussi sur votre autre appareil.' })
        ])
      ]),
      h('form', { class: 'form', onsubmit: submit, novalidate: true }, [
        h('label', { class: 'field' }, [h('span', { text: 'Clé GitHub' }), input]),
        err, btn
      ]),
      h('p', { class: 'cta-note', text: 'La clé reste sur cet appareil et n\'est jamais incluse dans vos exports. Avec la seule permission « gist », elle ne donne accès à rien d\'autre sur votre compte.' })
    ]);
  }

  function renderSettings() {
    var keepY = window.scrollY || 0;               // un rafraîchissement des réglages ne remonte pas en haut de page
    setTimeout(function () { window.scrollTo(0, keepY); }, 0);
    var st = app.state, set = st.settings;
    var tts = TTS.status();
    var notif = R.notificationSupport(window);
    var framed = UI.inFrame();

    function update(key, value) { set[key] = value; var g = G.checkGoal(st, today()); save(); renderSettings(); if (g.reachedNow) UI.toast('Objectif du jour atteint.'); }

    // --- Rappel ---
    var timeInput = h('input', { class: 'input input-time', type: 'time', id: 'reminder-time', value: set.reminderTime, 'aria-label': 'Heure du rappel' });
    timeInput.addEventListener('change', function () {
      if (R.parseTime(timeInput.value)) { set.reminderTime = timeInput.value; save(); scheduleNotification(); }
    });
    function makeICS() {
      var url = /^https?:/.test(location.href) && !framed ? location.href.split('#')[0] : '';
      var ics = R.buildICS({ time: set.reminderTime, now: new Date(now()), url: url });
      var ok = UI.downloadText('rappel-english-pro.ics', ics, 'text/calendar');
      UI.modal({
        title: 'Rappel dans le calendrier',
        body: h('div', {}, [
          h('p', { text: ok && !framed ? 'Le fichier rappel-english-pro.ics a été généré. Ouvrez-le : votre téléphone propose d\'ajouter un événement quotidien à ' + set.reminderTime + ' avec une alerte.' : 'Le téléchargement est bloqué dans cette prévisualisation. Il fonctionnera une fois l\'application déployée.' }),
          h('p', { class: 'cta-note', text: 'Sur iPhone : touchez le fichier téléchargé puis « Ajouter au calendrier ». Sur Android : ouvrez-le avec Google Agenda.' })
        ])
      });
    }
    var notifToggle = h('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!set.notifications && notif.permission === 'granted'),
      disabled: !notif.supported, id: 'notif-switch',
      onclick: function () {
        if (set.notifications) { set.notifications = false; save(); scheduleNotification(); return renderSettings(); }
        var p;
        try { p = window.Notification.requestPermission(); } catch (e) { p = null; }
        Promise.resolve(p).then(function (perm) {
          set.notifications = perm === 'granted';
          save(); scheduleNotification(); renderSettings();
          if (perm !== 'granted') UI.toast('Notifications refusées par le navigateur.');
        });
      }
    }, h('span', { class: 'switch-knob' }));

    // --- Sauvegarde ---
    function doExport() {
      var text = ST.exportState(st, now());
      st.lastExport = now(); save();
      var ok = UI.downloadText('english-pro-progression-' + today() + '.json', text, 'application/json');
      UI.toast(ok && !framed ? 'Fichier de sauvegarde téléchargé.' : 'Téléchargement bloqué ici : utilisez « Copier la sauvegarde ».');
    }
    function doCopy() {
      var text = ST.exportState(st, now());
      UI.copyText(text).then(function (ok) {
        if (ok) { st.lastExport = now(); save(); UI.toast('Sauvegarde copiée : collez-la dans une note ou un mail.'); }
        else showExportText(text);
      });
    }
    function showExportText(text) {
      var ta = h('textarea', { class: 'input code', rows: '8', readonly: true });
      ta.value = text;
      UI.modal({ title: 'Votre sauvegarde', body: h('div', {}, [h('p', { text: 'Sélectionnez tout le texte et copiez-le.' }), ta]) });
    }
    function applyImport(text) {
      var res = ST.importState(text, now());
      if (!res.ok) { UI.modal({ title: 'Import impossible', body: res.error }); return; }
      var n = Object.keys(res.state.cards).length;
      UI.confirmModal('Remplacer la progression actuelle ?', 'La sauvegarde contient ' + n + ' fiches de révision, ' + G.totalXp(res.state) + ' XP et ' + res.state.custom.length + ' mots personnels. Elle remplacera la progression de cet appareil.', 'Importer', function () {
        var keep = app.state.deviceId;
        Object.keys(app.state).forEach(function (k) { delete app.state[k]; });
        Object.assign(app.state, MG.adoptImported(res.state, keep));
        save(); rebuildItems(); scheduleNotification();
        UI.toast('Progression importée.');
        goTab('accueil');
      });
    }
    var fileInput = h('input', { type: 'file', accept: '.json,application/json', id: 'import-file', class: 'visually-hidden' });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { applyImport(String(reader.result)); };
      reader.onerror = function () { UI.modal({ title: 'Import impossible', body: 'Le fichier n\'a pas pu être lu.' }); };
      reader.readAsText(file);
      fileInput.value = '';
    });
    function pasteImport() {
      var ta = h('textarea', { class: 'input code', rows: '8', id: 'import-text', placeholder: 'Collez ici le contenu de votre sauvegarde' });
      UI.modal({
        title: 'Coller une sauvegarde', body: ta,
        actions: [{ label: 'Annuler' }, { label: 'Importer', kind: 'primary', onClick: function () { var v = ta.value; setTimeout(function () { applyImport(v); }, 0); } }]
      });
    }

    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

    setMain([
      h('h1', { class: 'page-title', text: 'Réglages' }),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Objectif quotidien' }),
        segmented('Durée visée par jour', [5, 10, 15].map(function (m) { return { value: m, label: m + ' min' }; }), set.goalMinutes, function (v) { update('goalMinutes', v); }, 'goal-seg'),
        h('p', { class: 'cta-note', text: 'Soit ' + G.goalOf(st).xp + ' XP par jour et des sessions de ' + G.goalOf(st).size + ' exercices.' })
      ]),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Écoute' }),
        tts.available ? null : h('p', { class: 'form-error', text: tts.reason }),
        segmented('Accent de la voix', [{ value: 'en-GB', label: 'Britannique' }, { value: 'en-US', label: 'Américain' }], set.voice, function (v) { update('voice', v); }, 'voice-seg'),
        segmented('Vitesse de lecture', [{ value: 1, label: 'Normale 1x' }, { value: 0.75, label: 'Lente 0,75x' }], set.rate, function (v) { update('rate', v); }, 'rate-seg'),
        segmented('Exercices d\'écoute', [{ value: true, label: 'Activés' }, { value: false, label: 'Masqués' }], set.listening, function (v) { update('listening', v); }, 'listen-seg'),
        h('p', { class: 'cta-note', text: 'Masquez-les quand vous n\'avez pas vos écouteurs : ils reviendront dès que vous les réactiverez.' }),
        tts.available ? h('button', {
          class: 'btn btn-soft btn-block', type: 'button',
          onclick: function () { TTS.speak('Could you send me the updated forecast by the end of the day?', { lang: set.voice, rate: set.rate }); }
        }, 'Tester la voix') : null
      ]),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Rappel quotidien' }),
        h('label', { class: 'field field-row' }, [h('span', { text: 'Heure du rappel' }), timeInput]),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'ics-btn', onclick: makeICS }, 'Créer le rappel dans mon calendrier (.ics)'),
        h('p', { class: 'cta-note', text: 'C\'est la méthode fiable : le calendrier du téléphone sonne chaque jour, même si l\'application est fermée.' }),
        h('div', { class: 'setting setting-row' }, [
          h('div', {}, [
            h('p', { class: 'setting-label', text: 'Notification de l\'application' }),
            h('p', { class: 'cta-note', text: notif.supported
              ? 'Appoint seulement : sans serveur, elle ne s\'affiche que si l\'application est ouverte ou encore en arrière-plan à l\'heure dite.'
              : notif.reason })
          ]),
          notifToggle
        ]),
        notif.supported && notif.permission === 'denied' ? h('p', { class: 'form-error', text: 'Les notifications sont bloquées pour ce site dans les réglages du navigateur.' }) : null
      ]),

      syncSection(),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Sauvegarde de ma progression' }),
        h('p', { class: 'cta-note', text: 'La progression est stockée sur cet appareil uniquement. Exportez-la pour ne rien perdre si le cache du navigateur est vidé, ou pour changer de téléphone.' }),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'export-btn', onclick: doExport }, 'Exporter ma progression (fichier JSON)'),
        h('button', { class: 'btn btn-soft btn-block', type: 'button', id: 'copy-btn', onclick: doCopy }, 'Copier la sauvegarde'),
        fileInput,
        h('button', { class: 'btn btn-soft btn-block', type: 'button', id: 'import-btn', onclick: function () { fileInput.click(); } }, 'Importer un fichier de sauvegarde'),
        h('button', { class: 'btn btn-soft btn-block', type: 'button', id: 'paste-btn', onclick: pasteImport }, 'Coller une sauvegarde'),
        h('p', { class: 'cta-note', text: st.lastExport ? 'Dernière sauvegarde : ' + UI.formatDay(U.dayKey(new Date(st.lastExport))) + '.' : 'Aucune sauvegarde effectuée pour l\'instant.' })
      ]),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Installer sur le téléphone' }),
        standalone ? h('p', { text: 'L\'application est installée et fonctionne hors ligne.' }) : h('div', {}, [
          app.installPrompt ? h('button', {
            class: 'btn btn-primary btn-block', type: 'button',
            onclick: function () { app.installPrompt.prompt(); app.installPrompt = null; }
          }, 'Installer l\'application') : null,
          h('p', { text: 'iPhone (Safari) : bouton Partager, puis « Sur l\'écran d\'accueil ».' }),
          h('p', { text: 'Android (Chrome) : menu ⋮, puis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».' })
        ])
      ]),

      h('section', { class: 'card' }, [
        h('h2', { text: 'Remise à zéro' }),
        h('button', {
          class: 'btn btn-danger btn-block', type: 'button', id: 'reset-btn',
          onclick: function () {
            var linked = sync.isConnected();
            UI.confirmModal('Effacer toute la progression ?', 'Fiches de révision, XP, série et mots personnels seront supprimés de cet appareil. Cette action est définitive : exportez d\'abord si vous avez un doute.' + (linked ? ' Cet appareil sera aussi déconnecté de la synchronisation ; la sauvegarde en ligne et vos autres appareils ne sont pas touchés.' : ''), 'Tout effacer', function () {
              if (linked) sync.client.disconnect();
              var fresh = ST.defaultState(now());
              Object.keys(app.state).forEach(function (k) { delete app.state[k]; });
              Object.assign(app.state, fresh);
              save(); rebuildItems(); goTab('accueil');
            }, true);
          }
        }, 'Effacer ma progression'),
        h('p', { class: 'cta-note', text: 'English Pro ' + APP_VERSION + ', ' + app.items.length + ' items dans ' + app.themes.length + ' thèmes. ' + (sync.isConnected() ? 'Seule la synchronisation envoie votre progression, dans votre Gist GitHub privé.' : 'Aucune donnée ne quitte votre appareil.') })
      ])
    ]);
  }

  /* ====================== Rappels (appoint) ====================== */

  function scheduleNotification() {
    clearTimeout(app.notifTimer);
    var st = app.state;
    if (!st.settings.notifications) return;
    var sup = R.notificationSupport(window);
    if (!sup.supported || sup.permission !== 'granted') return;
    var ms = R.msUntil(st.settings.reminderTime, new Date(now()));
    if (ms == null) return;
    app.notifTimer = setTimeout(function () {
      if (!G.goalReached(app.state, today())) showNotification();
      scheduleNotification();
    }, Math.min(ms, 2147483000));
  }

  function showNotification() {
    var title = 'English Pro';
    var options = { body: 'Votre session d\'anglais du jour vous attend.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'english-pro-daily' };
    try {
      if (app.swRegistration && app.swRegistration.showNotification) app.swRegistration.showNotification(title, options);
      else new window.Notification(title, options);
    } catch (e) { /* rien : notification indisponible */ }
  }

  /* ====================== Démarrage ====================== */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || UI.inFrame()) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').then(function (reg) { app.swRegistration = reg; }).catch(function (err) {
      console.warn('[English Pro] Service worker non enregistré :', err);
    });
  }

  function boot() {
    main = document.getElementById('main');
    nav = document.getElementById('nav');
    var storage = null;
    try { storage = window.localStorage; } catch (e) { storage = null; }
    app.store = ST.createStore(storage);
    initSync();
    app.state = app.store.load(now());
    if (!app.state.createdAt) app.state.createdAt = now();

    var initial = (location.hash || '').replace('#', '');
    if (TABS.some(function (t) { return t.id === initial; })) app.tab = initial;

    // Les voix se chargent parfois après coup : on ne rafraîchit que les écrans sans saisie en cours.
    TTS.init(function () { if (!app.sub && (app.tab === 'accueil' || app.tab === 'reglages')) render(); });

    window.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace('#', '');
      if (!app.sub && id !== app.tab && TABS.some(function (t) { return t.id === id; })) { app.tab = id; render(); }
    });
    window.addEventListener('popstate', function () {
      if (!app.sub) { syncHash(); return; }
      if (app.sub === 'session' && app.session) {
        try { history.pushState({ ep: 'sub' }, ''); } catch (e) { /* rien */ }
        quitSession();
      } else closeSub();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (!app.sub && app.tab === 'accueil') render();
        syncIfStale();
      } else if (sync.isConnected() && !app.sub) {
        clearTimeout(syncTimer);                    // l'app passe en arrière-plan : on envoie tout de suite
        runSync(false);
      }
    });
    window.addEventListener('online', function () { if (sync.pending) scheduleSync(1000); });
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      app.installPrompt = ev;
      if (!app.sub && app.tab === 'reglages') render();
    });

    loadContent().then(function (files) {
      installContent(files);
      G.settleStreak(app.state, today());
      G.refreshHearts(app.state, now());
      save();
      document.body.classList.remove('is-loading');
      render();
      scheduleNotification();
      registerServiceWorker();
      if (sync.isConnected()) runSync(false);
    }).catch(function (err) {
      console.error(err);
      document.body.classList.remove('is-loading');
      setMain([
        h('h1', { class: 'page-title', text: 'Contenu introuvable' }),
        h('p', { class: 'lead', text: 'Les fichiers de contenu n\'ont pas pu être chargés. Si vous avez ouvert index.html directement depuis un dossier, passez par un petit serveur local ou déployez l\'application (voir le README).' }),
        h('p', { class: 'form-error', text: String(err && err.message || err) })
      ]);
    });
  }

  app.startSession = startSession;
  app.goTab = goTab;
  app.render = render;
  app.rebuildItems = rebuildItems;
  app.availableItems = availableItems;
  app.runSync = runSync;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
