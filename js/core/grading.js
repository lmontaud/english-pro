/* English Pro — correction des réponses saisies.
   Règles : casse, ponctuation, accents et espaces superflus ignorés ; contractions et
   variantes GB/US équivalentes ; variantes listées dans le JSON acceptées ;
   faute de frappe sur un mot long => « Presque ! » (pas de perte de cœur). */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  // Orthographes britanniques ramenées à la forme américaine (pour comparer seulement).
  var GB_US = {
    favourable: 'favorable', unfavourable: 'unfavorable', favour: 'favor', favours: 'favors',
    colour: 'color', colours: 'colors', labour: 'labor', behaviour: 'behavior', honour: 'honor',
    neighbour: 'neighbor', endeavour: 'endeavor',
    centre: 'center', centres: 'centers', metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters',
    cheque: 'check', cheques: 'checks', programme: 'program', programmes: 'programs',
    licence: 'license', defence: 'defense', offence: 'offense', judgement: 'judgment',
    ageing: 'aging', catalogue: 'catalog', enrol: 'enroll', fulfil: 'fulfill', skilful: 'skillful',
    practise: 'practice', practised: 'practiced', practising: 'practicing',
    travelled: 'traveled', travelling: 'traveling', cancelled: 'canceled', cancelling: 'canceling',
    modelled: 'modeled', modelling: 'modeling', labelled: 'labeled', labelling: 'labeling',
    totalled: 'totaled', totalling: 'totaling', levelled: 'leveled', levelling: 'leveling',
    grey: 'gray', whilst: 'while', amongst: 'among', learnt: 'learned', spelt: 'spelled'
  };

  // Contractions sans ambiguïté.
  var CONTRACTIONS = {
    "can't": 'cannot', "won't": 'will not', "shan't": 'shall not', "let's": 'let us',
    "i'm": 'i am', "ain't": 'is not',
    // apostrophe oubliée sur un clavier de téléphone : toléré
    dont: 'do not', doesnt: 'does not', didnt: 'did not', isnt: 'is not', arent: 'are not',
    wasnt: 'was not', werent: 'were not', havent: 'have not', hasnt: 'has not', hadnt: 'had not',
    wouldnt: 'would not', couldnt: 'could not', shouldnt: 'should not', cant: 'cannot', im: 'i am'
  };
  // Mots après lesquels « 's » peut valoir « is » ou « has ».
  var S_HOSTS = { it: 1, he: 1, she: 1, that: 1, there: 1, here: 1, what: 1, who: 1, where: 1, how: 1, when: 1, why: 1, this: 1, everything: 1, something: 1, nothing: 1 };
  var D_HOSTS = { i: 1, you: 1, he: 1, she: 1, it: 1, we: 1, they: 1, that: 1, there: 1, who: 1 };

  // Paires de mots proches mais différents : jamais une « faute de frappe ».
  var CONFUSABLES = [
    ['affect', 'effect'], ['advice', 'advise'], ['principal', 'principle'], ['device', 'devise'],
    ['compliment', 'complement'], ['stationary', 'stationery'], ['later', 'latter'], ['quite', 'quiet'],
    ['though', 'thought'], ['though', 'through'], ['there', 'three'], ['price', 'prize'],
    ['analysis', 'analyses'], ['basis', 'bases'], ['thesis', 'theses'], ['crisis', 'crises'],
    ['raise', 'raised'], ['adapt', 'adopt'], ['ensure', 'insure'], ['formal', 'former'],
    ['sensible', 'sensitive'], ['economic', 'economics'], ['lower', 'lowed'], ['than', 'then'],
    ['their', 'there'], ['where', 'were'], ['these', 'those'], ['border', 'boarder'], ['since', 'sense'],
    ['fifteen', 'fifty'], ['sixteen', 'sixty'], ['seventeen', 'seventy'], ['eighteen', 'eighty'], ['nineteen', 'ninety']
  ];
  var confusableSet = {};
  CONFUSABLES.forEach(function (p) {
    var a = mapWord(p[0]), b = mapWord(p[1]);                   // mêmes transformations que les réponses
    confusableSet[a + '|' + b] = 1; confusableSet[b + '|' + a] = 1;
  });

  var INFLECTION_TAILS = { '': 1, s: 1, d: 1, es: 1, ed: 1 };
  var ARTICLES = { the: 1, a: 1, an: 1, le: 1, la: 1, les: 1, un: 1, une: 1, des: 1, du: 1, to: 1 };

  function stripDiacritics(s) {
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  function mapWord(w) {
    if (GB_US[w]) return GB_US[w];
    if (w.length >= 6) {
      // -ise / -isation / -yse (GB) => -ize / -ization / -yze (US)
      w = w.replace(/is(e|es|ed|ing|ation|ations|er|ers)$/, 'iz$1').replace(/ys(e|es|ed|ing)$/, 'yz$1');
    }
    return w;
  }

  /** Forme de base : minuscules, sans accents, sans ponctuation, espaces réduits. Renvoie une liste de mots. */
  function baseTokens(str) {
    var s = stripDiacritics(String(str == null ? '' : str).toLowerCase());
    s = s.replace(/[‘’ʼ`´]/g, "'")
      .replace(/[‐-―−-]/g, ' ')                 // traits d'union et tirets => espace
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')                  // 1,500 => 1500 (virgule des milliers)
      .replace(/(\d)\.(\d)/g, '$1§$2')                     // protège le point décimal
      .replace(/[.,;:!?"()\[\]{}…«»“”]/g, ' ')
      .replace(/§/g, '.')
      .replace(/\bper cent\b/g, 'percent')
      .replace(/(\d)\s*(percent|%)/g, '$1%')
      .replace(/(^|\s)'+|'+(\s|$)/g, ' ')                       // apostrophes isolées (guillemets simples)
      .replace(/\s+/g, ' ').trim();
    return s ? s.split(' ') : [];
  }

  /**
   * Développe les contractions. Renvoie la liste des lectures possibles (liste de listes de mots),
   * car « it's » peut valoir « it is » ou « it has », « I'd » « I would » ou « I had ».
   */
  function variants(str) {
    var tokens = baseTokens(str);
    var outs = [[]];
    function push(options) {
      var next = [];
      for (var i = 0; i < outs.length; i++) {
        for (var j = 0; j < options.length; j++) next.push(outs[i].concat(options[j]));
      }
      outs = next.length > 16 ? next.slice(0, 16) : next;
    }
    tokens.forEach(function (t) {
      if (CONTRACTIONS[t]) return push([CONTRACTIONS[t].split(' ')]);
      var m;
      if ((m = /^(.+)n't$/.exec(t))) return push([[m[1], 'not']]);
      if ((m = /^(.+)'(m|re|ve|ll)$/.exec(t))) {
        return push([[m[1], { m: 'am', re: 'are', ve: 'have', ll: 'will' }[m[2]]]]);
      }
      if ((m = /^(.+)'s$/.exec(t)) && S_HOSTS[m[1]]) return push([[m[1], 'is'], [m[1], 'has']]);
      if ((m = /^(.+)'d$/.exec(t)) && D_HOSTS[m[1]]) return push([[m[1], 'would'], [m[1], 'had']]);
      push([[mapWord(t)]]);
    });
    // « can not » => « cannot »
    return outs.map(function (words) {
      var res = [];
      for (var i = 0; i < words.length; i++) {
        if (words[i] === 'can' && words[i + 1] === 'not') { res.push('cannot'); i++; }
        else res.push(words[i]);
      }
      return res;
    });
  }

  /** Forme normalisée lisible (première lecture). */
  function normalize(str) {
    return variants(str)[0].join(' ');
  }

  function stripArticle(words) {
    return words.length > 1 && ARTICLES[words[0]] ? words.slice(1) : words;
  }

  /** Distance d'édition avec transposition (Damerau, alignement optimal). */
  function editDistance(a, b) {
    var al = a.length, bl = b.length, i, j;
    if (!al) return bl;
    if (!bl) return al;
    var d = [];
    for (i = 0; i <= al; i++) { d[i] = [i]; }
    for (j = 1; j <= bl; j++) d[0][j] = j;
    for (i = 1; i <= al; i++) {
      for (j = 1; j <= bl; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }

  /** Vrai si les deux mots ne diffèrent que par une terminaison grammaticale (pluriel, -ed…). */
  function inflectionOnly(a, b) {
    var p = 0;
    while (p < a.length && p < b.length && a.charAt(p) === b.charAt(p)) p++;
    return !!(INFLECTION_TAILS[a.slice(p)] && INFLECTION_TAILS[b.slice(p)]);
  }

  /** Vrai si `got` est une simple faute de frappe de `want` (mot long, distance 1, pas une autre forme du mot). */
  function isTypo(got, want) {
    if (got === want) return false;
    if (want.length < 5 || got.length < 4) return false;
    if (/\d/.test(want) || /\d/.test(got)) return false;
    if (confusableSet[got + '|' + want]) return false;
    if (inflectionOnly(got, want)) return false;
    return editDistance(got, want) <= 1;
  }

  /** Nombre de fautes de frappe entre deux listes de mots, ou -1 si ce n'est pas « presque juste ». */
  function typoCount(got, want) {
    if (got.length !== want.length || !want.length) return -1;
    var typos = 0;
    for (var i = 0; i < want.length; i++) {
      if (got[i] === want[i]) continue;
      if (!isTypo(got[i], want[i])) return -1;
      typos++;
    }
    var allowed = Math.max(1, Math.floor(want.length / 6));
    return typos >= 1 && typos <= allowed ? typos : -1;
  }

  function sameWords(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * Corrige une réponse saisie.
   * input   : texte tapé
   * answers : réponses acceptées (la première est la réponse de référence affichée)
   * opts    : { reject: [...formes explicitement fausses], looseArticles: bool, noTypo: bool }
   * Renvoie { result: 'correct' | 'almost' | 'wrong', expected, exact }
   */
  function gradeText(input, answers, opts) {
    opts = opts || {};
    answers = (answers || []).filter(function (a) { return a != null && String(a).trim() !== ''; });
    var expected = answers[0] || '';
    var out = { result: 'wrong', expected: expected, exact: false };
    var userVars = variants(input);
    if (!userVars[0].length) return out;

    var rejected = (opts.reject || []).some(function (r) {
      var rv = variants(r);
      return userVars.some(function (u) { return rv.some(function (x) { return sameWords(u, x); }); });
    });
    if (rejected) return out;

    var loose = !!opts.looseArticles;
    var a, i, j, av, u, w;
    for (a = 0; a < answers.length; a++) {
      av = variants(answers[a]);
      for (i = 0; i < userVars.length; i++) {
        for (j = 0; j < av.length; j++) {
          u = userVars[i]; w = av[j];
          if (sameWords(u, w) || (loose && sameWords(stripArticle(u), stripArticle(w)))) {
            out.result = 'correct';
            out.expected = answers[a];
            out.exact = String(input).trim() === String(answers[a]).trim();
            return out;
          }
        }
      }
    }
    if (opts.noTypo) return out;
    for (a = 0; a < answers.length; a++) {
      av = variants(answers[a]);
      for (i = 0; i < userVars.length; i++) {
        for (j = 0; j < av.length; j++) {
          u = userVars[i]; w = av[j];
          if (typoCount(u, w) > 0 || (loose && typoCount(stripArticle(u), stripArticle(w)) > 0)) {
            out.result = 'almost';
            out.expected = answers[a];
            return out;
          }
        }
      }
    }
    return out;
  }

  EP.grading = {
    normalize: normalize, variants: variants, editDistance: editDistance,
    isTypo: isTypo, gradeText: gradeText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.grading;
})(typeof self !== 'undefined' ? self : globalThis);
