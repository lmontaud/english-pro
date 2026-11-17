/* English Pro — composition d'une session.
   - ~60 % de révisions dues (tous thèmes confondus) + ~40 % de nouveaux items
   - aucune révision due => uniquement du nouveau contenu
   - 0 cœur ou mode « entraînement » => uniquement des révisions
   - entrelacement : types d'exercices et thèmes mélangés
   - rappel actif : au plus 40 % d'exercices « à choix » parmi les nouveaux items */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};
  var U = EP.util || (typeof require !== 'undefined' ? require('./util.js') : null);

  var REVIEW_SHARE = 0.6;
  var MAX_RECOGNITION_SHARE = 0.4;

  /** Mélange en évitant, quand c'est possible, deux exercices consécutifs du même type (puis du même thème). */
  function interleave(entries, rng) {
    var pool = U.shuffle(entries, rng);
    var out = [];
    while (pool.length) {
      var last = out[out.length - 1];
      var pick = -1, fallback = -1, i;
      for (i = 0; i < pool.length; i++) {
        if (!last) { pick = i; break; }
        var diffType = pool[i].item.type !== last.item.type;
        var diffTheme = pool[i].item.theme !== last.item.theme;
        if (diffType && diffTheme) { pick = i; break; }
        if (diffType && fallback === -1) fallback = i;
      }
      if (pick === -1) pick = fallback === -1 ? 0 : fallback;
      out.push(pool.splice(pick, 1)[0]);
    }
    return out;
  }

  /**
   * Réordonne les nouveautés d'un thème pour faire tourner les types d'exercices
   * (les fichiers de contenu sont rangés par type). `offset` décale le type de départ :
   * il dépend du thème et du nombre d'items déjà vus, pour que chaque session varie.
   */
  function spreadTypes(list, offset) {
    var groups = {}, order = [];
    list.forEach(function (it) {
      if (!groups[it.type]) { groups[it.type] = []; }
      groups[it.type].push(it);
    });
    EP.content.TYPES.forEach(function (t) { if (groups[t]) order.push(t); });
    Object.keys(groups).forEach(function (t) { if (order.indexOf(t) === -1) order.push(t); });
    if (order.length) {
      var shift = ((offset % order.length) + order.length) % order.length;
      order = order.slice(shift).concat(order.slice(0, shift));
    }
    var out = [], more = true;
    while (more) {
      more = false;
      for (var i = 0; i < order.length; i++) {
        var g = groups[order[i]];
        if (g.length) { out.push(g.shift()); more = true; }
      }
    }
    return out;
  }

  /** Choisit les nouveaux items en alternant les thèmes et en limitant la part d'exercices à choix. */
  function pickNew(candidatesByTheme, themeOrder, count, isRecognition) {
    var picked = [], skipped = [];
    var maxRecog = Math.ceil(count * MAX_RECOGNITION_SHARE);
    var recog = 0;
    var cursors = {};
    themeOrder.forEach(function (t) { cursors[t] = 0; });
    var progress = true;
    while (picked.length < count && progress) {
      progress = false;
      for (var k = 0; k < themeOrder.length && picked.length < count; k++) {
        var t = themeOrder[k];
        var list = candidatesByTheme[t] || [];
        while (cursors[t] < list.length) {
          var it = list[cursors[t]++];
          if (isRecognition(it) && recog >= maxRecog) { skipped.push(it); continue; }
          if (isRecognition(it)) recog++;
          picked.push(it);
          progress = true;
          break;
        }
      }
    }
    // S'il manque des items, on complète avec les exercices à choix mis de côté.
    for (var s = 0; s < skipped.length && picked.length < count; s++) picked.push(skipped[s]);
    return picked;
  }

  /**
   * opts : {
   *   items   : items disponibles (dans l'ordre des fichiers de contenu),
   *   cards   : fiches de révision par id,
   *   today   : 'AAAA-MM-JJ',
   *   size    : nombre d'exercices visé,
   *   mode    : 'daily' | 'theme' | 'training',
   *   themeId : thème de la leçon (mode 'theme'),
   *   themeOrder : ordre des thèmes,
   *   hearts  : cœurs restants,
   *   rng     : générateur aléatoire (tests)
   * }
   * Renvoie { entries: [{ item, isNew, wasDue }], counts: { due, fresh, extra }, reviewsOnly }
   */
  function buildSession(opts) {
    var srs = EP.srs, content = EP.content;
    var rng = opts.rng || Math.random;
    var size = opts.size || 10;
    var cards = opts.cards || {};
    var today = opts.today;
    var reviewsOnly = opts.mode === 'training' || (opts.hearts != null && opts.hearts <= 0);

    var due = [], fresh = [], later = [];
    opts.items.forEach(function (it) {
      var c = cards[it.id];
      if (srs.isNew(c)) fresh.push(it);
      else if (srs.isDue(c, today)) due.push(it);
      else later.push(it);
    });
    // Révisions : les plus en retard d'abord (ordre aléatoire à retard égal).
    due = U.shuffle(due, rng).sort(function (a, b) {
      return cards[a.id].due < cards[b.id].due ? -1 : cards[a.id].due > cards[b.id].due ? 1 : 0;
    });
    later = U.shuffle(later, rng).sort(function (a, b) {
      return cards[a.id].due < cards[b.id].due ? -1 : cards[a.id].due > cards[b.id].due ? 1 : 0;
    });

    var chosenDue, chosenNew = [], extra = [];
    if (reviewsOnly) {
      chosenDue = due.slice(0, size);
    } else {
      chosenDue = due.slice(0, Math.round(size * REVIEW_SHARE));
      var wantNew = size - chosenDue.length;
      var themeOrder = (opts.themeOrder || []).slice();
      fresh.forEach(function (it) { if (themeOrder.indexOf(it.theme) === -1) themeOrder.push(it.theme); });
      if (opts.mode === 'theme' && opts.themeId) {
        themeOrder = [opts.themeId];
      } else if (themeOrder.length) {
        // Le thème de départ change chaque jour pour répartir les nouveautés.
        var shift = Math.abs(U.diffDays('2024-01-01', today)) % themeOrder.length;
        themeOrder = themeOrder.slice(shift).concat(themeOrder.slice(0, shift));
      }
      var byTheme = {}, seenByTheme = {};
      fresh.forEach(function (it) { (byTheme[it.theme] = byTheme[it.theme] || []).push(it); });
      opts.items.forEach(function (it) { if (!srs.isNew(cards[it.id])) seenByTheme[it.theme] = (seenByTheme[it.theme] || 0) + 1; });
      var baseOrder = opts.themeOrder || [];
      Object.keys(byTheme).forEach(function (t) {
        var idx = Math.max(0, baseOrder.indexOf(t));
        byTheme[t] = spreadTypes(byTheme[t], idx + (seenByTheme[t] || 0));
      });
      chosenNew = pickNew(byTheme, themeOrder, wantNew, content.isRecognition);
      // Pas assez de nouveautés : on complète avec les autres révisions dues.
      if (chosenDue.length + chosenNew.length < size) {
        chosenDue = due.slice(0, size - chosenNew.length);
      }
    }
    // Toujours pas assez : entraînement anticipé sur les items déjà vus (sans effet sur leur calendrier).
    var missing = size - chosenDue.length - chosenNew.length;
    if (missing > 0) extra = later.slice(0, missing);

    var entries = [];
    chosenDue.forEach(function (it) { entries.push({ item: it, isNew: false, wasDue: true }); });
    chosenNew.forEach(function (it) { entries.push({ item: it, isNew: true, wasDue: true }); });
    extra.forEach(function (it) { entries.push({ item: it, isNew: false, wasDue: false }); });

    return {
      entries: interleave(entries, rng),
      counts: { due: chosenDue.length, fresh: chosenNew.length, extra: extra.length },
      reviewsOnly: reviewsOnly
    };
  }

  /** Nombre de révisions dues parmi les items disponibles. */
  function countDue(items, cards, today) {
    var n = 0;
    items.forEach(function (it) { if (EP.srs.isDue(cards[it.id], today)) n++; });
    return n;
  }

  EP.session = {
    REVIEW_SHARE: REVIEW_SHARE, MAX_RECOGNITION_SHARE: MAX_RECOGNITION_SHARE,
    interleave: interleave, spreadTypes: spreadTypes, buildSession: buildSession, countDue: countDue
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.session;
})(typeof self !== 'undefined' ? self : globalThis);
