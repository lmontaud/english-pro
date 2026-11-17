/* English Pro — utilitaires (dates locales, hasard reproductible).
   Logique pure : fonctionne dans le navigateur et sous Node (tests). */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Clé de jour locale 'AAAA-MM-JJ' à partir d'une Date ou d'un timestamp. */
  function dayKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function keyToUTC(key) {
    var p = String(key).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  /** Ajoute n jours à une clé de jour (insensible aux changements d'heure). */
  function addDays(key, n) {
    var d = new Date(keyToUTC(key) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /** Nombre de jours entre deux clés (b - a). */
  function diffDays(a, b) {
    return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
  }

  /** Générateur pseudo-aléatoire reproductible (pour les tests). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  EP.util = {
    dayKey: dayKey, addDays: addDays, diffDays: diffDays,
    mulberry32: mulberry32, shuffle: shuffle, clamp: clamp, pad: pad
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.util;
})(typeof self !== 'undefined' ? self : globalThis);
