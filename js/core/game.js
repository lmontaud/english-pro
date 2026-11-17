/* English Pro — gamification : cœurs, XP, objectif quotidien, série et gels de série.
   Toutes les fonctions reçoivent l'heure/le jour en paramètre : testable avec des dates simulées. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};
  var U = EP.util || (typeof require !== 'undefined' ? require('./util.js') : null);

  var HEART_MAX = 5;
  var HEART_REGEN_MS = 30 * 60 * 1000;
  var MAX_FREEZES = 2;
  var XP = { correct: 10, almost: 8, retry: 6, sessionBonus: 10, flashcard: 3 };
  // Objectif quotidien : minutes -> XP équivalents et taille de session.
  var GOALS = {
    5: { xp: 100, size: 10 },
    10: { xp: 200, size: 20 },
    15: { xp: 300, size: 30 }
  };
  var TRAINING_SUCCESS_RATE = 0.8;

  function goalOf(state) {
    return GOALS[state.settings.goalMinutes] || GOALS[5];
  }

  /* ---------- Cœurs ---------- */

  /** Applique la régénération (1 cœur / 30 min) écoulée depuis le dernier point de référence. */
  function refreshHearts(state, nowMs) {
    var h = state.hearts;
    if (h.count >= HEART_MAX) { h.count = HEART_MAX; h.ts = null; return h.count; }
    if (h.ts == null) { h.ts = nowMs; return h.count; }
    if (nowMs < h.ts) { h.ts = nowMs; return h.count; }           // horloge reculée
    var gained = Math.floor((nowMs - h.ts) / HEART_REGEN_MS);
    if (gained > 0) {
      h.count = Math.min(HEART_MAX, h.count + gained);
      h.ts = h.count >= HEART_MAX ? null : h.ts + gained * HEART_REGEN_MS;
    }
    return h.count;
  }

  function loseHeart(state, nowMs) {
    refreshHearts(state, nowMs);
    var h = state.hearts;
    if (h.count <= 0) return 0;
    if (h.count >= HEART_MAX) h.ts = nowMs;                         // le chrono démarre
    h.count -= 1;
    return h.count;
  }

  function gainHeart(state, nowMs) {
    refreshHearts(state, nowMs);
    var h = state.hearts;
    if (h.count < HEART_MAX) h.count += 1;
    if (h.count >= HEART_MAX) h.ts = null;
    return h.count;
  }

  /** Millisecondes avant le prochain cœur (0 si plein). */
  function nextHeartInMs(state, nowMs) {
    refreshHearts(state, nowMs);
    var h = state.hearts;
    if (h.count >= HEART_MAX || h.ts == null) return 0;
    return Math.max(0, h.ts + HEART_REGEN_MS - nowMs);
  }

  /* ---------- Série ---------- */

  /**
   * Règle les jours manqués avant aujourd'hui : chaque jour manqué consomme un gel ;
   * s'il n'y a pas assez de gels, la série retombe à 0. Idempotent.
   */
  function settleStreak(state, today) {
    var s = state.streak;
    if (!s.last) return {};
    var gap = U.diffDays(s.last, today);
    if (gap <= 1) return {};
    var missed = gap - 1;
    if (s.count > 0 && s.freezes >= missed) {
      s.freezes -= missed;
      for (var i = missed; i >= 1; i--) s.frozen.push(U.addDays(today, -i));
      if (s.frozen.length > 60) s.frozen = s.frozen.slice(-60);
      s.last = U.addDays(today, -1);
      return { frozen: missed };
    }
    if (s.count > 0) { s.count = 0; return { broken: true }; }
    return {};
  }

  /** Série à afficher aujourd'hui (après règlement des jours manqués). */
  function currentStreak(state, today) {
    settleStreak(state, today);
    return state.streak.count;
  }

  /** XP d'un jour, tous appareils confondus. */
  function todayXp(state, today) {
    var n = (state.xp.days && state.xp.days[today]) || 0;
    var peers = state.peers || {};
    Object.keys(peers).forEach(function (id) { n += (peers[id].days && peers[id].days[today]) || 0; });
    return n;
  }

  /** XP totale, tous appareils confondus. */
  function totalXp(state) {
    var n = state.xp.total || 0;
    var peers = state.peers || {};
    Object.keys(peers).forEach(function (id) { n += peers[id].total || 0; });
    return n;
  }

  function goalReached(state, today) {
    return todayXp(state, today) >= goalOf(state).xp;
  }

  /** À appeler après tout gain d'XP ou changement d'objectif : valide le jour si l'objectif est atteint. */
  function checkGoal(state, today) {
    var out = { reachedNow: false, freezeEarned: false };
    settleStreak(state, today);
    var s = state.streak;
    if (!goalReached(state, today) || s.last === today) return out;
    s.count = (s.count > 0 && s.last === U.addDays(today, -1)) ? s.count + 1 : 1;
    s.last = today;
    if (s.count > s.best) s.best = s.count;
    out.reachedNow = true;
    if (s.count % 7 === 0 && s.freezes < MAX_FREEZES) { s.freezes += 1; out.freezeEarned = true; }
    return out;
  }

  /* ---------- XP ---------- */

  function addXp(state, amount, today) {
    if (!state.xp.days) state.xp.days = {};
    state.xp.total += amount;
    state.xp.days[today] = (state.xp.days[today] || 0) + amount;
    return checkGoal(state, today);
  }

  EP.game = {
    HEART_MAX: HEART_MAX, HEART_REGEN_MS: HEART_REGEN_MS, MAX_FREEZES: MAX_FREEZES,
    XP: XP, GOALS: GOALS, TRAINING_SUCCESS_RATE: TRAINING_SUCCESS_RATE,
    goalOf: goalOf, refreshHearts: refreshHearts, loseHeart: loseHeart, gainHeart: gainHeart,
    nextHeartInMs: nextHeartInMs, settleStreak: settleStreak, currentStreak: currentStreak,
    todayXp: todayXp, totalXp: totalXp, goalReached: goalReached, checkGoal: checkGoal, addXp: addXp
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.game;
})(typeof self !== 'undefined' ? self : globalThis);
