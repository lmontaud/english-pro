/* English Pro — modèle de contenu : types d'exercices, validation des items,
   phrases complètes (audio / flashcards), conversion des « Mes mots » en items. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  var TYPES = ['fill', 'conjugate', 'translate', 'mcq', 'order', 'match', 'chart', 'error', 'dictation', 'listen'];

  // Consigne par défaut (en français) de chaque type d'exercice.
  var INSTRUCTIONS = {
    fill: 'Complétez la phrase.',
    fillBank: 'Choisissez le mot qui complète la phrase.',
    conjugate: 'Conjuguez le verbe entre parenthèses.',
    translateFrEn: 'Traduisez en anglais.',
    translateEnFr: 'Traduisez en français.',
    mcq: 'Choisissez la bonne réponse.',
    order: 'Remettez les mots dans l\'ordre.',
    match: 'Associez les paires.',
    chart: 'Observez le graphique et choisissez la bonne description.',
    chartFill: 'Observez le graphique et complétez la phrase.',
    error: 'Touchez le mot qui contient l\'erreur.',
    dictation: 'Écoutez et écrivez ce que vous entendez.',
    listen: 'Écoutez et choisissez la bonne réponse.'
  };

  function hasBlank(s) { return typeof s === 'string' && s.indexOf('___') !== -1; }

  function hasChoices(item) {
    return Array.isArray(item.distractors) && item.distractors.length > 0;
  }

  /** L'utilisateur choisit-il parmi des propositions (reconnaissance) ou produit-il la réponse (rappel actif) ? */
  function isRecognition(item) {
    switch (item.type) {
      case 'mcq': case 'match': case 'listen': case 'error': return true;
      case 'fill': return !!item.bank;
      case 'chart': case 'translate': return hasChoices(item);
      default: return false;
    }
  }

  function needsAudio(item) {
    return item.type === 'dictation' || item.type === 'listen';
  }

  function instructionOf(item) {
    if (item.instruction) return item.instruction;
    switch (item.type) {
      case 'fill': return item.bank ? INSTRUCTIONS.fillBank : INSTRUCTIONS.fill;
      case 'translate': return item.direction === 'en-fr' ? INSTRUCTIONS.translateEnFr : INSTRUCTIONS.translateFrEn;
      case 'chart': return hasChoices(item) ? INSTRUCTIONS.chart : INSTRUCTIONS.chartFill;
      default: return INSTRUCTIONS[item.type] || '';
    }
  }

  /** Remplace le trou (et l'éventuel verbe entre parenthèses qui le suit) par la réponse. */
  function fillBlank(sentence, answer) {
    return String(sentence).replace(/___\s*\([^)]*\)/, answer).replace('___', answer);
  }

  /** Découpe une phrase « à corriger » : le mot fautif est entre crochets. */
  function errorSegments(item) {
    var segs = [], wrongIndex = -1;
    String(item.prompt).split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      var m = /^\[([^\]]+)\](.*)$/.exec(tok);
      if (m) { wrongIndex = segs.length; segs.push(m[1] + m[2]); }
      else segs.push(tok);
    });
    return { segments: segs, wrongIndex: wrongIndex };
  }

  /** Mots à remettre dans l'ordre (ponctuation finale retirée, majuscule initiale neutralisée). */
  function orderTokens(item) {
    var sentence = String(item.answers[0]).trim();
    var m = /[.?!]+$/.exec(sentence);
    var end = m ? m[0] : '';
    var words = sentence.slice(0, sentence.length - end.length).split(/\s+/);
    var first = words[0];
    if (first && !/^I('|$)/.test(first) && !/^[A-Z0-9&]{2,}/.test(first) && !item.keepCase) {
      words[0] = first.charAt(0).toLowerCase() + first.slice(1);
    }
    var extra = item.type === 'order' && Array.isArray(item.distractors) ? item.distractors : [];
    return { words: words, extra: extra, end: end };
  }

  /** Phrase anglaise complète associée à l'item (affichée après la réponse, lue par la synthèse vocale). */
  function fullSentence(item) {
    if (item.example) return item.example;
    var a = item.answers && item.answers[0];
    switch (item.type) {
      case 'fill': case 'conjugate': return fillBlank(item.prompt, a);
      case 'chart': return hasBlank(item.prompt) ? fillBlank(item.prompt, a) : a;
      case 'order': case 'dictation': case 'error': return a;
      case 'listen': return item.audio;
      case 'translate': return item.direction === 'en-fr' ? item.prompt : a;
      case 'mcq': return hasBlank(item.prompt) ? fillBlank(item.prompt, a) : null;
      default: return null;
    }
  }

  /** Recto/verso d'une flashcard, ou null si l'item ne s'y prête pas. */
  function flashcardOf(item) {
    if (!item.term || !item.fr) return null;
    var example = fullSentence(item);
    var norm = EP.grading ? EP.grading.normalize : function (s) { return String(s).toLowerCase(); };
    if (example && norm(example) === norm(item.term)) example = null;
    return { en: item.term, fr: item.fr, example: example, explanation: item.explanation || '' };
  }

  /** Vérifie un item. Renvoie la liste des problèmes (vide si l'item est valide). */
  function validateItem(item) {
    var e = [];
    function req(cond, msg) { if (!cond) e.push(msg); }
    function str(v) { return typeof v === 'string' && v.trim() !== ''; }
    if (!item || typeof item !== 'object') return ['item invalide'];
    req(str(item.id), 'id manquant');
    req(str(item.theme), 'thème manquant');
    req(TYPES.indexOf(item.type) !== -1, 'type inconnu : ' + item.type);
    req(str(item.explanation), 'explication manquante');
    var answers = item.answers;
    if (item.type !== 'match') {
      req(Array.isArray(answers) && answers.length > 0 && answers.every(str), 'réponse(s) manquante(s)');
    }
    if (e.length) return e;
    var distractors = item.distractors || [];
    var norm = EP.grading ? EP.grading.normalize : function (s) { return String(s).toLowerCase().trim(); };
    function distinctChoices(min) {
      req(Array.isArray(item.distractors) && distractors.length >= min, 'il faut au moins ' + min + ' distracteur(s)');
      var seen = {};
      [answers[0]].concat(distractors).forEach(function (c) {
        var k = norm(c);
        req(!seen[k], 'proposition en double : ' + c);
        seen[k] = 1;
      });
      distractors.forEach(function (d) {
        answers.forEach(function (a) { req(norm(d) !== norm(a), 'un distracteur est aussi une réponse acceptée : ' + d); });
      });
    }
    switch (item.type) {
      case 'fill':
        req(hasBlank(item.prompt), 'l\'énoncé doit contenir ___');
        if (item.bank) distinctChoices(2);
        else req(str(item.hint), 'indice (hint) manquant pour une saisie libre');
        break;
      case 'conjugate':
        req(/___\s*\([^)]+\)/.test(item.prompt || ''), 'l\'énoncé doit contenir ___ (verbe)');
        break;
      case 'translate':
        req(str(item.prompt), 'énoncé manquant');
        req(item.direction === 'fr-en' || item.direction === 'en-fr', 'direction fr-en ou en-fr attendue');
        if (item.distractors) distinctChoices(2);
        break;
      case 'mcq':
        req(str(item.prompt), 'énoncé manquant');
        distinctChoices(2);
        break;
      case 'order':
        req(String(answers[0]).trim().split(/\s+/).length >= 3, 'phrase trop courte');
        break;
      case 'match':
        req(Array.isArray(item.pairs) && item.pairs.length >= 3 && item.pairs.length <= 6, '3 à 6 paires attendues');
        (item.pairs || []).forEach(function (p) {
          req(Array.isArray(p) && p.length === 2 && str(p[0]) && str(p[1]), 'paire invalide');
        });
        break;
      case 'chart':
        var c = item.chart;
        req(c && (c.kind === 'line' || c.kind === 'bar'), 'chart.kind doit valoir line ou bar');
        req(c && Array.isArray(c.labels) && c.labels.length >= 2, 'chart.labels manquant');
        req(c && Array.isArray(c.series) && c.series.length >= 1, 'chart.series manquant');
        ((c && c.series) || []).forEach(function (s) {
          req(s && Array.isArray(s.values) && c.labels && s.values.length === c.labels.length &&
            s.values.every(function (v) { return typeof v === 'number' && isFinite(v); }), 'série de valeurs invalide');
        });
        if (item.distractors) distinctChoices(2);
        else req(hasBlank(item.prompt) && str(item.hint), 'graphique sans propositions : énoncé avec ___ et indice attendus');
        break;
      case 'error':
        var seg = errorSegments(item);
        req(seg.wrongIndex >= 0, 'le mot fautif doit être entre [crochets]');
        req(!/\[[^\]]*\s[^\]]*\]/.test(item.prompt || ''), 'un seul mot entre crochets');
        req((String(item.prompt).match(/\[/g) || []).length === 1, 'une seule erreur par phrase');
        break;
      case 'dictation':
        // le texte lu est item.audio, ou à défaut la première réponse
        req(String(item.audio || answers[0]).trim().split(/\s+/).length >= 3, 'phrase de dictée trop courte');
        break;
      case 'listen':
        req(str(item.audio), 'audio manquant');
        req(str(item.prompt), 'question manquante');
        distinctChoices(2);
        break;
    }
    if (item.term || item.fr) req(str(item.term) && str(item.fr), 'term et fr vont ensemble');
    return e;
  }

  /** Transforme un mot personnel (« Mes mots ») en item de traduction FR → EN. */
  function customToItem(word) {
    return {
      id: word.id,
      theme: word.theme,
      type: 'translate',
      direction: 'fr-en',
      prompt: word.fr,
      answers: [word.en],
      explanation: word.example ? 'Exemple : ' + word.example : 'Mot ajouté dans « Mes mots ».',
      term: word.en,
      fr: word.fr,
      example: word.example || null,
      custom: true
    };
  }

  EP.content = {
    TYPES: TYPES, INSTRUCTIONS: INSTRUCTIONS,
    hasBlank: hasBlank, hasChoices: hasChoices, isRecognition: isRecognition, needsAudio: needsAudio,
    instructionOf: instructionOf, fillBlank: fillBlank, errorSegments: errorSegments,
    orderTokens: orderTokens, fullSentence: fullSentence, flashcardOf: flashcardOf,
    validateItem: validateItem, customToItem: customToItem
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.content;
})(typeof self !== 'undefined' ? self : globalThis);
