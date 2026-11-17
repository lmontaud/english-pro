/* English Pro — rappel quotidien.
   Solution fiable : un fichier .ics (événement quotidien avec alarme) à ajouter au calendrier du téléphone.
   Solution d'appoint : une notification locale, seulement quand l'app est ouverte ou en arrière-plan récent. */
(function (root) {
  'use strict';
  var EP = root.EP = root.EP || {};

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function parseTime(time) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
    if (!m) return null;
    var h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return { h: h, min: min };
  }

  function icsEscape(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  /** Coupe les lignes de plus de 75 octets, comme l'exige le format iCalendar. */
  function fold(line) {
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      var code = line.charCodeAt(i);
      // paire de substitution (emoji) : garder les deux moitiés ensemble
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) { ch += line.charAt(++i); }
      var size = ch.length === 2 ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (bytes + size > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += size;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  /**
   * Construit le fichier .ics d'un rappel quotidien.
   * opts : { time: 'HH:MM', now: Date, url: adresse de l'app (facultatif) }
   * L'heure est « flottante » (sans fuseau) : elle suit l'heure locale du téléphone.
   */
  function buildICS(opts) {
    var t = parseTime(opts && opts.time);
    if (!t) return null;
    var now = (opts && opts.now) || new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var start = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + 'T' + pad(t.h) + pad(t.min) + '00';
    var desc = 'Votre session d\'anglais professionnel du jour : quelques minutes suffisent pour garder votre série.';
    if (opts && opts.url) desc += '\n' + opts.url;
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//English Pro//Rappel quotidien//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:english-pro-rappel-' + stamp + '@english-pro.app',
      'DTSTAMP:' + stamp,
      'DTSTART:' + start,
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + icsEscape('English Pro : session du jour'),
      'DESCRIPTION:' + icsEscape(desc)
    ];
    if (opts && opts.url) lines.push('URL:' + opts.url);
    lines = lines.concat([
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape('English Pro : session du jour'),
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]);
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /** Millisecondes jusqu'à la prochaine occurrence de HH:MM. */
  function msUntil(time, now) {
    var t = parseTime(time);
    if (!t) return null;
    now = now || new Date();
    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.min, 0, 0);
    if (target.getTime() <= now.getTime()) target = new Date(target.getTime() + 86400000);
    return target.getTime() - now.getTime();
  }

  /** L'heure du rappel est-elle passée aujourd'hui ? */
  function isPast(time, now) {
    var t = parseTime(time);
    if (!t) return false;
    now = now || new Date();
    return now.getHours() > t.h || (now.getHours() === t.h && now.getMinutes() >= t.min);
  }

  /**
   * Ce que le navigateur permet pour les notifications.
   * env : objet window (ou un faux objet dans les tests).
   * Renvoie { supported, permission, reason }
   */
  function notificationSupport(env) {
    if (!env || typeof env.Notification === 'undefined') {
      var ios = env && env.navigator && /iPad|iPhone|iPod/.test(env.navigator.userAgent || '');
      return {
        supported: false, permission: 'unsupported',
        reason: ios
          ? 'Sur iPhone, les notifications ne sont possibles que si l\'app est installée sur l\'écran d\'accueil (iOS 16.4 ou plus récent).'
          : 'Ce navigateur ne permet pas les notifications.'
      };
    }
    var permission = 'default';
    try { permission = env.Notification.permission || 'default'; } catch (err) { /* rien */ }
    return { supported: true, permission: permission, reason: '' };
  }

  EP.reminder = {
    parseTime: parseTime, buildICS: buildICS, msUntil: msUntil, isPast: isPast,
    notificationSupport: notificationSupport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EP.reminder;
})(typeof self !== 'undefined' ? self : globalThis);
