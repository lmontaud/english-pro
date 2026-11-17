/* English Pro — petits outils d'interface : création d'éléments, fenêtres modales, messages, téléchargements. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  /** Typographie française : espace insécable avant : ; ! ? » et après «, pour éviter les retours à la ligne disgracieux. */
  function typo(s) {
    return String(s).replace(/ ([:;!?\u00BB])/g, '\u00A0$1').replace(/\u00AB /g, '\u00AB\u00A0');
  }

  /** Crée un élément. attrs : class, text, html, on<Event>, et tout autre attribut HTML. */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = typo(v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(typo(c)) : c);
    });
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------- Fenêtre modale (remplace alert/confirm, bloqués dans certains contextes) ---------- */
  function modal(opts) {
    var layer = document.getElementById('modal-layer');
    clear(layer);
    function close() { layer.hidden = true; clear(layer); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape' && !opts.sticky) close(); }
    var actions = (opts.actions || [{ label: 'Fermer' }]).map(function (a) {
      return h('button', {
        class: 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-quiet'),
        type: 'button',
        onclick: function () { var keep = a.onClick && a.onClick(close) === false; if (!keep) close(); }
      }, a.label);
    });
    var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' }, [
      opts.title ? h('h2', { class: 'modal-title', text: opts.title }) : null,
      h('div', { class: 'modal-body' }, typeof opts.body === 'string' ? h('p', { text: opts.body }) : opts.body),
      h('div', { class: 'modal-actions' }, actions)
    ]);
    layer.appendChild(box);
    layer.hidden = false;
    layer.onclick = function (ev) { if (ev.target === layer && !opts.sticky) close(); };
    document.addEventListener('keydown', onKey);
    var first = box.querySelector('input, textarea, button');
    if (first && opts.focus !== false) { try { first.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
    return { close: close, el: box };
  }

  function confirmModal(title, body, okLabel, onOk, danger) {
    return modal({
      title: title, body: body,
      actions: [
        { label: 'Annuler' },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: function () { onOk(); } }
      ]
    });
  }

  /* ---------- Message bref ---------- */
  var toastTimer = null;
  function toast(message, ms) {
    var el = document.getElementById('toast');
    el.textContent = typo(message);
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); el.hidden = true; }, ms || 3200);
  }

  /* ---------- Fichiers ---------- */
  function inFrame() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  /** Déclenche le téléchargement d'un fichier texte. Renvoie false si le navigateur refuse. */
  function downloadText(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: filename, style: 'display:none' });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Copie un texte dans le presse-papiers (à appeler depuis un clic). */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) { return false; }
  }

  /** Bouton haut-parleur : lit une phrase anglaise. N'apparaît pas si la synthèse vocale est indisponible. */
  function speakButton(text, extraClass) {
    if (!text || !EP.tts.status().available) return null;
    return h('button', {
      class: 'speak ' + (extraClass || ''), type: 'button', 'aria-label': 'Écouter la phrase', title: 'Écouter',
      onclick: function (ev) {
        ev.stopPropagation();
        var s = EP.app && EP.app.state ? EP.app.state.settings : { voice: 'en-GB', rate: 1 };
        EP.tts.speak(text, { lang: s.voice, rate: s.rate });
      }
    }, h('span', { 'aria-hidden': 'true', html: ICON_SPEAKER }));
  }

  var ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';

  function formatDuration(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatDay(key) {
    var p = key.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  EP.ui = {
    h: h, typo: typo, append: append, clear: clear, modal: modal, confirmModal: confirmModal, toast: toast,
    inFrame: inFrame, downloadText: downloadText, copyText: copyText, speakButton: speakButton,
    formatDuration: formatDuration, formatDay: formatDay, ICON_SPEAKER: ICON_SPEAKER
  };
})(typeof self !== 'undefined' ? self : globalThis);
