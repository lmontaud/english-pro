/* English Pro — fusion de deux progressions (synchronisation entre appareils).
   Règles :
   - fiches de révision : pour chaque item, la révision la plus récente l'emporte ;
   - XP : chaque appareil a son propre compteur ; on garde le maximum par appareil et par jour
     (jamais de double comptage, même si l'on synchronise dix fois) ;
   - « Mes mots » : union des deux listes, les suppressions sont propagées ;
   - série : la plus avancée l'emporte, puis on valide le jour si l'XP fusionnée atteint l'objectif ;
   - réglages et cœurs : propres à chaque appareil, non fusionnés. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  /** Vrai si la fiche a est plus récente que la fiche b. */
  function newer(a, b) {
    if (!b) return true;
    if (!a) return false;
    if ((a.ts || 0) !== (b.ts || 0)) return (a.ts || 0) > (b.ts || 0);
    if ((a.last || '') !== (b.last || '')) return (a.last || '') > (b.last || '');
    return (a.seen || 0) > (b.seen || 0);
  }

  function copyCounter(c) {
    var days = {};
    if (c && isObj(c.days)) Object.keys(c.days).forEach(function (k) { days[k] = c.days[k] | 0; });
    return { total: (c && c.total) | 0, days: days };
  }

  /** Fusion de deux compteurs d'XP d'un même appareil : maximum par jour. */
  function maxCounter(a, b) {
    var out = copyCounter(a);
    if (b && isObj(b.days)) {
      Object.keys(b.days).forEach(function (k) { out.days[k] = Math.max(out.days[k] || 0, b.days[k] | 0); });
    }
    var sum = 0;
    Object.keys(out.days).forEach(function (k) { sum += out.days[k]; });
    out.total = Math.max(sum, (a && a.total) | 0, (b && b.total) | 0);
    return out;
  }

  /** Tous les compteurs d'XP connus d'un état, indexés par appareil. */
  function counters(state) {
    var all = {};
    Object.keys(state.peers || {}).forEach(function (id) { all[id] = state.peers[id]; });
    all[state.deviceId] = state.xp;
    return all;
  }

  /**
   * Fusionne la progression distante dans la progression locale.
   * Renvoie un nouvel état (local et remote ne sont pas modifiés). L'appareil reste « local ».
   */
  function mergeStates(local, remote, today) {
    var out = JSON.parse(JSON.stringify(local));
    if (!remote) return out;
    var r = remote;

    // Mots supprimés (union), puis mots personnels (union, sans les supprimés)
    var deleted = {};
    (local.customDeleted || []).concat(r.customDeleted || []).forEach(function (id) { deleted[id] = 1; });
    out.customDeleted = Object.keys(deleted).slice(-500);
    var words = {}, order = [];
    (local.custom || []).concat(r.custom || []).forEach(function (w) {
      if (deleted[w.id]) return;
      if (!words[w.id]) order.push(w.id);
      words[w.id] = words[w.id] || w;
    });
    out.custom = order.map(function (id) { return JSON.parse(JSON.stringify(words[id])); })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    out.customSeq = Math.max(local.customSeq | 0, r.customSeq | 0);

    // Fiches de révision
    Object.keys(r.cards || {}).forEach(function (id) {
      if (newer(r.cards[id], out.cards[id])) out.cards[id] = JSON.parse(JSON.stringify(r.cards[id]));
    });
    Object.keys(deleted).forEach(function (id) { delete out.cards[id]; });

    // XP par appareil
    var mine = local.deviceId;
    var remoteCounters = counters(r);
    var peers = {};
    Object.keys(local.peers || {}).forEach(function (id) { peers[id] = copyCounter(local.peers[id]); });
    Object.keys(remoteCounters).forEach(function (id) {
      if (id === mine) out.xp = maxCounter(out.xp, remoteCounters[id]);
      else peers[id] = maxCounter(peers[id], remoteCounters[id]);
    });
    out.peers = peers;

    // Série : la plus récente, puis la plus longue
    var a = local.streak || {}, b = r.streak || {};
    var pick = (b.last || '') > (a.last || '') || ((b.last || '') === (a.last || '') && (b.count | 0) > (a.count | 0)) ? b : a;
    var frozen = {};
    (a.frozen || []).concat(b.frozen || []).forEach(function (d) { frozen[d] = 1; });
    out.streak = {
      count: pick.count | 0,
      best: Math.max(a.best | 0, b.best | 0, pick.count | 0),
      last: pick.last || null,
      freezes: pick.freezes | 0,
      frozen: Object.keys(frozen).sort().slice(-60)
    };

    out.sessions = Math.max(local.sessions | 0, r.sessions | 0);
    out.createdAt = Math.min(local.createdAt || Infinity, r.createdAt || Infinity);
    if (!isFinite(out.createdAt)) out.createdAt = 0;

    // Avec l'XP des deux appareils, l'objectif du jour peut être atteint
    if (today && EP.game) EP.game.checkGoal(out, today);
    return out;
  }

  /**
   * Une sauvegarde importée vient peut-être d'un autre appareil : son XP est rangée sous
   * l'identifiant de cet autre appareil, et l'appareil courant garde le sien.
   */
  function adoptImported(imported, localDeviceId) {
    var s = imported;
    if (!localDeviceId || s.deviceId === localDeviceId) return s;
    var oldId = s.deviceId;
    s.peers = s.peers || {};
    var own = s.peers[localDeviceId];
    delete s.peers[localDeviceId];
    if (oldId) s.peers[oldId] = maxCounter(s.peers[oldId], s.xp);
    s.xp = own ? copyCounter(own) : { total: 0, days: {} };
    s.deviceId = localDeviceId;
    return s;
  }

  /** Empreinte de ce qui est synchronisé : sert à savoir s'il faut renvoyer la progression. */
  function fingerprint(state) {
    return JSON.stringify([state.cards, state.xp, state.peers, state.custom, state.customDeleted, state.streak]);
  }

  EP.merge = { mergeStates: mergeStates, adoptImported: adoptImported, fingerprint: fingerprint, newer: newer };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.merge;
})(typeof self !== 'undefined' ? self : globalThis);
