/* English Pro — affichage des exercices. Chaque fonction construit l'exercice et
   fournit au contrôleur de session une fonction de correction. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};
  var h = EP.ui.h, C = EP.content, GR = EP.grading, U = EP.util;

  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>';

  /** Phrase anglaise avec un trou mis en évidence ; `fill` est le texte à afficher dans le trou. */
  function sentenceWithBlank(prompt, cls) {
    var parts = String(prompt).split('___');
    var blank = h('span', { class: 'blank', text: ' ' });
    var el = h('p', { class: 'sentence en ' + (cls || '') }, [parts[0], blank, parts.slice(1).join('___')]);
    return { el: el, blank: blank };
  }

  function textInput(ctx, opts) {
    opts = opts || {};
    var input = h(opts.multiline ? 'textarea' : 'input', {
      class: 'answer-input' + (opts.en === false ? '' : ' en'),
      type: opts.multiline ? null : 'text',
      rows: opts.multiline ? '2' : null,
      placeholder: opts.placeholder || 'Votre réponse',
      autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false',
      enterkeyhint: 'done', lang: opts.en === false ? 'fr' : 'en',
      'aria-label': opts.placeholder || 'Votre réponse'
    });
    input.addEventListener('input', function () {
      ctx.ready(input.value.trim().length > 0);
      if (opts.onInput) opts.onInput(input.value);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); if (input.value.trim()) ctx.requestCheck(); }
    });
    return input;
  }

  function hintLine(text) {
    return text ? h('p', { class: 'hint' }, ['Indice : ', h('span', { text: text })]) : null;
  }

  /* ---------- Exercices à saisie libre ---------- */
  function typed(item, ctx, parts) {
    var looseArticles = item.type === 'translate';
    var input = textInput(ctx, parts.inputOpts);
    var wrap = h('div', { class: 'ex' }, [parts.top, input]);
    ctx.setChecker(function () {
      var res = GR.gradeText(input.value, item.answers, { reject: item.reject, looseArticles: looseArticles });
      return { result: res.result, expected: res.expected, given: input.value.trim() };
    });
    return {
      el: wrap,
      focus: function () { try { input.focus({ preventScroll: true }); } catch (e) { /* rien */ } },
      lock: function (res) {
        input.readOnly = true;
        input.classList.add(res.result === 'wrong' ? 'is-wrong' : res.result === 'almost' ? 'is-almost' : 'is-right');
      }
    };
  }

  function renderFill(item, ctx) {
    if (item.bank) return renderChoice(item, ctx, { blank: true });
    var s = sentenceWithBlank(item.prompt);
    return typed(item, ctx, {
      top: [s.el, hintLine(item.hint)],
      inputOpts: { onInput: function (v) { s.blank.textContent = v || ' '; } }
    });
  }

  function renderConjugate(item, ctx) {
    var s = sentenceWithBlank(item.prompt);
    return typed(item, ctx, {
      top: [s.el, hintLine(item.hint)],
      inputOpts: { placeholder: 'Verbe conjugué', onInput: function (v) { s.blank.textContent = v || ' '; } }
    });
  }

  function renderTranslate(item, ctx) {
    var toEn = item.direction !== 'en-fr';
    var promptEl = h('p', { class: 'sentence ' + (toEn ? 'fr' : 'en') }, [
      item.prompt, toEn ? null : ' ', toEn ? null : EP.ui.speakButton(item.prompt, 'speak-inline')
    ]);
    if (C.hasChoices(item)) return renderChoice(item, ctx, { top: promptEl, choicesFr: !toEn });
    var long = String(item.answers[0]).length > 28;
    return typed(item, ctx, {
      top: [promptEl, hintLine(item.hint)],
      inputOpts: { multiline: long, en: toEn, placeholder: toEn ? 'En anglais' : 'En français' }
    });
  }

  function renderDictation(item, ctx) {
    var audio = audioBlock(item.audio || item.answers[0], ctx);
    return typed(item, ctx, {
      top: [audio],
      inputOpts: { multiline: true, placeholder: 'Écrivez la phrase entendue' }
    });
  }

  /** Bloc d'écoute : gros bouton lecture + vitesse 1x / 0,75x. */
  function audioBlock(text, ctx) {
    var rate = ctx.settings.rate;
    function play() { EP.tts.speak(text, { lang: ctx.settings.voice, rate: rate }); }
    var slow = h('button', { class: 'chip-toggle', type: 'button', 'aria-pressed': rate === 0.75 ? 'true' : 'false' }, 'Lent 0,75x');
    slow.addEventListener('click', function () {
      rate = rate === 0.75 ? 1 : 0.75;
      slow.setAttribute('aria-pressed', rate === 0.75 ? 'true' : 'false');
      play();
    });
    var btn = h('button', { class: 'play', type: 'button', 'aria-label': 'Écouter', onclick: play },
      h('span', { 'aria-hidden': 'true', html: ICON_PLAY }));
    // Lecture automatique à l'affichage (certains navigateurs exigent d'abord un appui : le bouton reste là).
    setTimeout(function () { if (document.body.contains(btn)) play(); }, 350);
    return h('div', { class: 'audio' }, [btn, h('div', { class: 'audio-side' }, [
      h('span', { class: 'audio-label', text: 'Touchez pour réécouter' }), slow
    ])]);
  }

  /* ---------- Exercices à choix ---------- */
  function renderChoice(item, ctx, opts) {
    opts = opts || {};
    var correct = item.answers[0];
    var options = U.shuffle([correct].concat(item.distractors), ctx.rng);
    var selected = null;
    var blank = null;
    var top = opts.top;
    if (opts.blank || (!top && C.hasBlank(item.prompt))) {
      var s = sentenceWithBlank(item.prompt);
      blank = s.blank;
      top = [s.el, hintLine(item.hint)];
    } else if (!top) {
      top = h('p', { class: 'sentence question ' + (item.promptLang === 'en' ? 'en' : 'fr'), text: item.prompt });
    }
    var buttons = options.map(function (opt) {
      var b = h('button', {
        class: 'choice ' + (opts.choicesFr ? 'fr' : 'en'), type: 'button', 'aria-pressed': 'false'
      }, opt);
      b.addEventListener('click', function () {
        if (b.disabled) return;
        selected = opt;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        if (blank) blank.textContent = opt;
        ctx.ready(true);
      });
      return b;
    });
    var wrap = h('div', { class: 'ex' }, [top, h('div', { class: 'choices' + (opts.blank || item.bank ? ' choices-bank' : '') }, buttons)]);
    ctx.setChecker(function () {
      return { result: selected === correct ? 'correct' : 'wrong', expected: correct, given: selected };
    });
    return {
      el: wrap,
      lock: function () {
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (options[i] === correct) b.classList.add('is-right');
          else if (options[i] === selected) b.classList.add('is-wrong');
        });
      }
    };
  }

  function renderMcq(item, ctx) {
    return renderChoice(item, ctx, { choicesFr: item.choices === 'fr' });
  }

  function renderListen(item, ctx) {
    var top = [audioBlock(item.audio, ctx), h('p', { class: 'sentence question fr', text: item.prompt })];
    return renderChoice(item, ctx, { top: top, choicesFr: item.choices !== 'en' });
  }

  function renderChart(item, ctx) {
    var fig = h('figure', { class: 'chart-card', html: EP.chart.chartSVG(item.chart) });
    if (C.hasChoices(item)) {
      var top = [fig];
      if (item.prompt) top.push(h('p', { class: 'sentence question fr', text: item.prompt }));
      return renderChoice(item, ctx, { top: top });
    }
    var s = sentenceWithBlank(item.prompt);
    return typed(item, ctx, {
      top: [fig, s.el, hintLine(item.hint)],
      inputOpts: { onInput: function (v) { s.blank.textContent = v || ' '; } }
    });
  }

  /* ---------- Remettre dans l'ordre ---------- */
  function renderOrder(item, ctx) {
    var tok = C.orderTokens(item);
    var all = tok.words.concat(tok.extra);
    var order = U.shuffle(all.map(function (w, i) { return i; }), ctx.rng);
    // éviter de proposer la phrase déjà dans l'ordre
    if (all.length > 2 && order.every(function (v, i) { return v === i; })) order.reverse();
    var placed = [];
    var answerEl = h('div', { class: 'order-answer en', 'aria-label': 'Votre phrase' });
    var poolEl = h('div', { class: 'order-pool' });
    var locked = false;
    var chips = order.map(function (idx) {
      var chip = h('button', { class: 'chip en', type: 'button' }, all[idx]);
      chip.addEventListener('click', function () {
        if (locked) return;
        var pos = placed.indexOf(chip);
        if (pos === -1) { placed.push(chip); answerEl.appendChild(chip); }
        else { placed.splice(pos, 1); poolEl.appendChild(chip); }
        end.hidden = placed.length === 0;
        if (placed.length) answerEl.appendChild(end);
        ctx.ready(placed.length > 0);
      });
      return chip;
    });
    var end = h('span', { class: 'order-end', text: tok.end, hidden: true });
    chips.forEach(function (c) { poolEl.appendChild(c); });
    var top = item.prompt ? h('p', { class: 'sentence fr', text: item.prompt }) : null;
    ctx.setChecker(function () {
      var text = placed.map(function (c) { return c.textContent; }).join(' ');
      var res = GR.gradeText(text, item.answers, { noTypo: true });
      return { result: res.result, expected: item.answers[0], given: text };
    });
    return {
      el: h('div', { class: 'ex' }, [top, answerEl, poolEl]),
      lock: function (res) {
        locked = true;
        answerEl.classList.add(res.result === 'wrong' ? 'is-wrong' : 'is-right');
      }
    };
  }

  /* ---------- Associer des paires ---------- */
  function renderMatch(item, ctx) {
    var pairs = item.pairs;
    var left = U.shuffle(pairs.map(function (p, i) { return i; }), ctx.rng);
    var right = U.shuffle(pairs.map(function (p, i) { return i; }), ctx.rng);
    var selL = null, selR = null, done = 0, mistakes = 0;
    function mk(idx, side) {
      var b = h('button', { class: 'pair ' + (side === 0 ? 'en' : 'fr'), type: 'button', 'aria-pressed': 'false' }, pairs[idx][side]);
      b.addEventListener('click', function () {
        if (b.disabled) return;
        var prev = side === 0 ? selL : selR;
        if (prev) prev.el.setAttribute('aria-pressed', 'false');
        if (prev && prev.el === b) { if (side === 0) selL = null; else selR = null; return; }
        b.setAttribute('aria-pressed', 'true');
        if (side === 0) selL = { idx: idx, el: b }; else selR = { idx: idx, el: b };
        if (selL && selR) resolve();
      });
      return b;
    }
    function resolve() {
      var a = selL, b = selR;
      selL = selR = null;
      a.el.setAttribute('aria-pressed', 'false');
      b.el.setAttribute('aria-pressed', 'false');
      if (a.idx === b.idx) {
        [a.el, b.el].forEach(function (x) { x.disabled = true; x.classList.add('is-right'); });
        done++;
        if (done === pairs.length) {
          setTimeout(function () { ctx.submit({ result: mistakes ? 'wrong' : 'correct', expected: '', given: '' }); }, 350);
        }
      } else {
        mistakes++;
        [a.el, b.el].forEach(function (x) {
          x.classList.add('is-wrong');
          setTimeout(function () { x.classList.remove('is-wrong'); }, 600);
        });
      }
    }
    ctx.hideCheck(true);
    return {
      el: h('div', { class: 'ex' }, h('div', { class: 'pairs' }, [
        h('div', { class: 'pairs-col' }, left.map(function (i) { return mk(i, 0); })),
        h('div', { class: 'pairs-col' }, right.map(function (i) { return mk(i, 1); }))
      ])),
      lock: function () { /* déjà verrouillé paire par paire */ }
    };
  }

  /* ---------- Repérer l'erreur ---------- */
  function renderError(item, ctx) {
    var seg = C.errorSegments(item);
    var selected = -1;
    var buttons = seg.segments.map(function (word, i) {
      var b = h('button', { class: 'word en', type: 'button', 'aria-pressed': 'false' }, word);
      b.addEventListener('click', function () {
        if (b.disabled) return;
        selected = i;
        buttons.forEach(function (x, j) { x.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
        ctx.ready(true);
      });
      return b;
    });
    ctx.setChecker(function () {
      return { result: selected === seg.wrongIndex ? 'correct' : 'wrong', expected: item.answers[0], given: seg.segments[selected] };
    });
    return {
      el: h('div', { class: 'ex' }, [
        item.context ? h('p', { class: 'hint', text: item.context }) : null,
        h('div', { class: 'words' }, buttons)
      ]),
      lock: function () {
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (i === seg.wrongIndex) b.classList.add('is-target');
          else if (i === selected) b.classList.add('is-wrong');
        });
      }
    };
  }

  var RENDERERS = {
    fill: renderFill, conjugate: renderConjugate, translate: renderTranslate, mcq: renderMcq,
    order: renderOrder, match: renderMatch, chart: renderChart, error: renderError,
    dictation: renderDictation, listen: renderListen
  };

  function render(item, ctx) {
    return (RENDERERS[item.type] || renderMcq)(item, ctx);
  }

  /** Bonne réponse à afficher dans le retour : phrase complète, réponse mise en évidence. */
  function answerNode(item) {
    var a = item.answers ? item.answers[0] : '';
    if (item.type === 'match') {
      return h('ul', { class: 'pair-list' }, item.pairs.map(function (p) {
        return h('li', {}, [h('span', { class: 'en', text: p[0] }), ' = ', h('span', { text: p[1] })]);
      }));
    }
    if ((item.type === 'fill' || item.type === 'conjugate' || item.type === 'chart' || item.type === 'mcq') && C.hasBlank(item.prompt)) {
      var m = /^([\s\S]*?)___(\s*\([^)]*\))?([\s\S]*)$/.exec(item.prompt);
      return h('p', { class: 'en answer-line' }, [m[1], h('mark', { text: a }), m[3]]);
    }
    if (item.type === 'listen') {
      return h('div', {}, [h('p', { class: 'en answer-line', text: item.audio }), h('p', { class: 'answer-sub', text: a })]);
    }
    if (item.type === 'translate' && item.direction === 'en-fr') {
      return h('p', { class: 'answer-line', text: a });
    }
    return h('p', { class: 'en answer-line', text: a });
  }

  EP.exercises = { render: render, answerNode: answerNode };
})(typeof self !== 'undefined' ? self : globalThis);
