/* English Pro — fabrique « apercu.html » : toute l'application dans UN seul fichier
   (styles, scripts et contenu intégrés). Utile pour tester par simple double-clic, sans serveur,
   ou pour publier une page de prévisualisation. Le mode hors ligne installable, lui, demande
   la version déployée (index.html + service worker).
   Lancement : node tools/build-preview.js   — à relancer après toute modification du contenu. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

let html = read('index.html');
const index = JSON.parse(read('content/index.json'));
const content = index.files.map((f) => JSON.parse(read('content/' + f)));
const icon = fs.readFileSync(path.join(ROOT, 'icons/icon-192.png')).toString('base64');

html = html.replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/png" href="data:image/png;base64,' + icon + '">')
  .replace(/<link rel="stylesheet" href="css\/style\.css">/, () => '<style>\n' + read('css/style.css') + '\n</style>')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + safe(read(src)) + '\n</script>')
  .replace('<!-- Logique (pure, testée sous Node) -->', () => '<script>window.EP_CONTENT = ' + safe(JSON.stringify(content)) + ';</script>');

if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('Une ressource externe n\'a pas été intégrée.');
fs.writeFileSync(path.join(ROOT, 'apercu.html'), html);
const items = content.reduce((n, t) => n + t.items.length, 0);
console.log('apercu.html écrit : ' + Math.round(html.length / 1024) + ' Ko, ' + content.length + ' thèmes, ' + items + ' items.');
