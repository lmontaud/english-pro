/* English Pro — synthèse vocale (Web Speech API).
   detect() est une fonction pure (testable avec un faux objet window). */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  function normLang(l) { return String(l || '').replace('_', '-').toLowerCase(); }

  /**
   * La synthèse vocale est-elle utilisable ?
   * Renvoie { available, reason, voices } — `reason` est un message en français si indisponible.
   */
  function detect(win) {
    if (!win || !win.speechSynthesis || typeof win.SpeechSynthesisUtterance === 'undefined') {
      return { available: false, voices: 0, reason: 'Ce navigateur ne propose pas la synthèse vocale : les exercices d\'écoute sont masqués.' };
    }
    var voices = [];
    try { voices = win.speechSynthesis.getVoices() || []; } catch (err) { voices = []; }
    if (voices.length > 0) {
      var english = voices.filter(function (v) { return normLang(v.lang).indexOf('en') === 0; });
      if (!english.length) {
        return { available: false, voices: voices.length, reason: 'Aucune voix anglaise n\'est installée sur cet appareil : les exercices d\'écoute sont masqués.' };
      }
    }
    // Liste vide : les voix se chargent souvent plus tard ; on considère la synthèse disponible.
    return { available: true, voices: voices.length, reason: '' };
  }

  /** Choisit la meilleure voix pour la langue demandée (en-GB ou en-US), sinon une autre voix anglaise. */
  function pickVoice(voices, lang) {
    var want = normLang(lang);
    var exact = [], english = [];
    (voices || []).forEach(function (v) {
      var l = normLang(v.lang);
      if (l === want) exact.push(v);
      else if (l.indexOf('en') === 0) english.push(v);
    });
    function best(list) {
      if (!list.length) return null;
      // préférer une voix locale (fonctionne hors ligne), puis la voix par défaut
      var local = list.filter(function (v) { return v.localService; });
      var pool = local.length ? local : list;
      for (var i = 0; i < pool.length; i++) if (pool[i].default) return pool[i];
      return pool[0];
    }
    return best(exact) || best(english);
  }

  var win = typeof window !== 'undefined' ? window : null;
  var listeners = [];

  function status() { return detect(win); }

  function init(onChange) {
    if (onChange) listeners.push(onChange);
    if (!win || !win.speechSynthesis) return;
    try {
      win.speechSynthesis.getVoices();
      if (typeof win.speechSynthesis.addEventListener === 'function') {
        win.speechSynthesis.addEventListener('voiceschanged', function () {
          listeners.forEach(function (fn) { try { fn(status()); } catch (e) { /* rien */ } });
        });
      }
    } catch (err) { /* rien */ }
  }

  /** Lit un texte anglais. opts : { lang: 'en-GB' | 'en-US', rate: 1 | 0.75 }. Renvoie false si impossible. */
  function speak(text, opts) {
    opts = opts || {};
    if (!text || !status().available) return false;
    try {
      var synth = win.speechSynthesis;
      synth.cancel();
      var u = new win.SpeechSynthesisUtterance(String(text));
      u.lang = opts.lang || 'en-GB';
      u.rate = opts.rate || 1;
      var v = pickVoice(synth.getVoices(), u.lang);
      if (v) { u.voice = v; u.lang = v.lang.replace('_', '-'); }
      if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
      synth.speak(u);
      return true;
    } catch (err) {
      return false;
    }
  }

  function stop() {
    try { if (win && win.speechSynthesis) win.speechSynthesis.cancel(); } catch (err) { /* rien */ }
  }

  EP.tts = { detect: detect, pickVoice: pickVoice, status: status, init: init, speak: speak, stop: stop };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.tts;
})(typeof self !== 'undefined' ? self : globalThis);
