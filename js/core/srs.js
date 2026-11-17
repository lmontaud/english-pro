/* English Pro — répétition espacée (Leitner à 7 étapes).
   Chaque item a sa fiche : { step, due, seen, ok, ko, last }.
   - step : 0 = à (ré)apprendre, 1..7 = étapes franchies
   - due  : jour 'AAAA-MM-JJ' de la prochaine révision */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};
  var U = EP.util || (typeof require !== 'undefined' ? require('./util.js') : null);

  var INTERVALS = [1, 2, 4, 7, 15, 30, 60];   // jours, après la 1re, 2e… bonne réponse
  var MAX_STEP = INTERVALS.length;            // 7
  var MASTERY_STEP = 5;                       // étape à partir de laquelle un item compte pour 100 %

  function newCard() {
    return { step: 0, due: null, seen: 0, ok: 0, ko: 0, last: null, ts: 0 };
  }

  function isDue(card, today) {
    return !!(card && card.due && card.due <= today);
  }

  function isNew(card) {
    return !card || !card.seen;
  }

  /**
   * Met à jour une fiche après une réponse.
   * result : 'correct' | 'almost' | 'wrong'
   * - correct : +1 étape (si la fiche était nouvelle ou due)
   * - almost  : même étape, reprogrammée avec le même intervalle
   * - wrong   : retour à l'étape 0, due immédiatement
   * Une bonne réponse sur une fiche PAS encore due (entraînement anticipé)
   * ne modifie ni l'étape ni la date : on ne « gagne » pas d'étape en bachotant.
   */
  function review(card, result, today, nowMs) {
    var c = card ? {
      step: card.step || 0, due: card.due || null, seen: card.seen || 0,
      ok: card.ok || 0, ko: card.ko || 0, last: card.last || null, ts: card.ts || 0
    } : newCard();
    var wasDue = isNew(c) || isDue(c, today);
    c.seen += 1;
    c.last = today;
    c.ts = typeof nowMs === 'number' ? nowMs : c.ts;   // heure exacte : départage deux appareils à la synchronisation
    if (result === 'wrong') {
      c.ko += 1;
      c.step = 0;
      c.due = today;
    } else if (result === 'almost') {
      c.ok += 1;
      if (wasDue) c.due = U.addDays(today, INTERVALS[Math.max(c.step, 1) - 1]);
    } else {
      c.ok += 1;
      if (wasDue) {
        c.step = Math.min(c.step + 1, MAX_STEP);
        c.due = U.addDays(today, INTERVALS[c.step - 1]);
      }
    }
    return c;
  }

  /** Maîtrise d'un item entre 0 et 1 (100 % à l'étape 5, soit ~2 semaines de rappels réussis). */
  function mastery(card) {
    if (!card) return 0;
    return Math.min((card.step || 0) / MASTERY_STEP, 1);
  }

  /** Un item est « appris » dès qu'il a été réussi au moins une fois depuis sa dernière erreur. */
  function isLearned(card) {
    return !!(card && card.step >= 1);
  }

  EP.srs = {
    INTERVALS: INTERVALS, MAX_STEP: MAX_STEP, MASTERY_STEP: MASTERY_STEP,
    newCard: newCard, isDue: isDue, isNew: isNew, review: review,
    mastery: mastery, isLearned: isLearned
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.srs;
})(typeof self !== 'undefined' ? self : globalThis);
