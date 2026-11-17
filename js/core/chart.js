/* English Pro — graphique SVG simple (courbe ou barres) généré à partir des données d'un exercice.
   spec : { kind: 'line' | 'bar', title, labels: [...], series: [{ name, values: [...] }],
            unit: '%' (suffixe), prefix: '€' (préfixe), yMin: nombre (facultatif) }
   Les couleurs viennent de variables CSS (--series-1, --series-2) pour suivre le thème clair/sombre. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  var W = 340, H = 220;
  var M = { top: 34, right: 14, bottom: 30, left: 14 };
  var SERIES_VARS = ['var(--series-1, #2a78d6)', 'var(--series-2, #eb6834)'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(v, spec) {
    var n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : String(Math.round(v * 10) / 10);
    return (spec.prefix || '') + n + (spec.unit || '');
  }

  /** Borne haute « ronde » pour l'axe vertical. */
  function niceMax(v) {
    if (v <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * pow >= v) return steps[i] * pow;
    return 10 * pow;
  }

  function chartSVG(spec) {
    var series = spec.series || [];
    var labels = spec.labels || [];
    var n = labels.length;
    var all = [];
    series.forEach(function (s) { s.values.forEach(function (v) { all.push(v); }); });
    var maxV = niceMax(Math.max.apply(null, all) * 1.12);
    var minV = typeof spec.yMin === 'number' ? spec.yMin : Math.min(0, Math.min.apply(null, all));
    var multi = series.length > 1;
    var top = M.top + (multi ? 16 : 0);
    var pw = W - M.left - M.right, ph = H - top - M.bottom;
    function y(v) { return top + ph - ((v - minV) / (maxV - minV)) * ph; }
    var band = pw / n;
    function xc(i) { return M.left + band * (i + 0.5); }

    var o = [];
    var desc = series.map(function (s) {
      return (s.name ? s.name + ' : ' : '') + labels.map(function (l, i) { return l + ' ' + fmt(s.values[i], spec); }).join(', ');
    }).join(' ; ');
    o.push('<svg class="ep-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc((spec.title || 'Chart') + '. ' + desc) + '" xmlns="http://www.w3.org/2000/svg">');
    if (spec.title) o.push('<text class="ep-chart-title" x="' + M.left + '" y="18">' + esc(spec.title) + '</text>');

    // Légende (seulement s'il y a plusieurs séries)
    if (multi) {
      var lx = M.left;
      series.forEach(function (s, si) {
        o.push('<rect x="' + lx + '" y="27" width="10" height="10" rx="2" fill="' + SERIES_VARS[si % 2] + '"/>');
        o.push('<text class="ep-chart-legend" x="' + (lx + 14) + '" y="36">' + esc(s.name || ('Series ' + (si + 1))) + '</text>');
        lx += 24 + String(s.name || '').length * 6.4;
      });
    }

    // Grille discrète : 3 lignes horizontales + ligne de base
    for (var g = 1; g <= 3; g++) {
      var gy = y(minV + (maxV - minV) * g / 3);
      o.push('<line class="ep-chart-grid" x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>');
    }
    var base = y(Math.max(minV, 0));
    o.push('<line class="ep-chart-axis" x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + base.toFixed(1) + '" y2="' + base.toFixed(1) + '"/>');

    // Étiquettes de l'axe horizontal
    labels.forEach(function (l, i) {
      o.push('<text class="ep-chart-label" text-anchor="middle" x="' + xc(i).toFixed(1) + '" y="' + (H - 10) + '">' + esc(l) + '</text>');
    });

    if (spec.kind === 'bar') {
      var groupW = Math.min(band * 0.72, multi ? 56 : 40);
      var gap = 2;
      var bw = (groupW - gap * (series.length - 1)) / series.length;
      series.forEach(function (s, si) {
        s.values.forEach(function (v, i) {
          var x0 = xc(i) - groupW / 2 + si * (bw + gap);
          var yTop = Math.min(y(v), base), h = Math.abs(base - y(v));
          var r = Math.min(4, bw / 2, h);
          // barre arrondie côté valeur, ancrée sur la ligne de base
          var d = v >= 0
            ? 'M' + x0.toFixed(1) + ' ' + base.toFixed(1) + 'V' + (yTop + r).toFixed(1) + 'q0 -' + r + ' ' + r + ' -' + r + 'h' + (bw - 2 * r).toFixed(1) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + base.toFixed(1) + 'Z'
            : 'M' + x0.toFixed(1) + ' ' + base.toFixed(1) + 'V' + (yTop + h - r).toFixed(1) + 'q0 ' + r + ' ' + r + ' ' + r + 'h' + (bw - 2 * r).toFixed(1) + 'q' + r + ' 0 ' + r + ' -' + r + 'V' + base.toFixed(1) + 'Z';
          o.push('<path d="' + d + '" fill="' + SERIES_VARS[si % 2] + '"><title>' + esc((s.name ? s.name + ', ' : '') + labels[i] + ': ' + fmt(v, spec)) + '</title></path>');
          var ly = v >= 0 ? yTop - 4 : yTop + h + 11;
          o.push('<text class="ep-chart-value" text-anchor="middle" x="' + (x0 + bw / 2).toFixed(1) + '" y="' + ly.toFixed(1) + '">' + esc(fmt(v, spec)) + '</text>');
        });
      });
    } else {
      series.forEach(function (s, si) {
        var pts = s.values.map(function (v, i) { return xc(i).toFixed(1) + ',' + y(v).toFixed(1); });
        o.push('<polyline fill="none" stroke="' + SERIES_VARS[si % 2] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/>');
        s.values.forEach(function (v, i) {
          o.push('<circle cx="' + xc(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4" fill="' + SERIES_VARS[si % 2] + '" stroke="var(--chart-surface, #fff)" stroke-width="2"><title>' + esc((s.name ? s.name + ', ' : '') + labels[i] + ': ' + fmt(v, spec)) + '</title></circle>');
          // étiquette au-dessus (série 1) ou au-dessous (série 2) pour limiter les chevauchements
          var above = !multi || si === 0 ? true : false;
          if (multi) {
            var other = series[1 - si] ? series[1 - si].values[i] : null;
            above = other == null ? true : v >= other;
          }
          o.push('<text class="ep-chart-value" text-anchor="middle" x="' + xc(i).toFixed(1) + '" y="' + (y(v) + (above ? -9 : 17)).toFixed(1) + '">' + esc(fmt(v, spec)) + '</text>');
        });
      });
    }
    o.push('</svg>');
    return o.join('');
  }

  EP.chart = { chartSVG: chartSVG, niceMax: niceMax, format: fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.chart;
})(typeof self !== 'undefined' ? self : globalThis);
