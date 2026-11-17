/* English Pro — tests automatisés de la logique et du contenu.
   Lancement : node tests/run-tests.js   (aucune dépendance, Node 18 ou plus récent) */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
['util', 'srs', 'grading', 'game', 'content', 'session', 'store', 'reminder', 'chart', 'merge'].forEach(function (m) {
  require(path.join(ROOT, 'js', 'core', m + '.js'));
});
require(path.join(ROOT, 'js', 'tts.js'));
require(path.join(ROOT, 'js', 'sync.js'));
const EP = globalThis.EP;
const { util: U, srs: SRS, grading: GR, game: G, content: C, session: S, store: ST, reminder: R, chart: CH, tts: TTS, merge: MG, syncCore: SY } = EP;

let passed = 0, failed = 0;
const failures = [];
let currentGroup = '';
function group(name) { currentGroup = name; console.log('\n' + name); }
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; failures.push(currentGroup + ' › ' + name + '\n      ' + err.message); console.log('  ✗ ' + name + '\n      ' + err.message); }
}
const eq = assert.strictEqual;
const deq = assert.deepStrictEqual;

function ms(y, m, d, h, min) { return new Date(y, m - 1, d, h || 0, min || 0, 0, 0).getTime(); }
function freshState() { return ST.defaultState(ms(2026, 1, 1, 8)); }

/* ---------- Chargement du contenu ---------- */
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'index.json'), 'utf8'));
const themes = index.files.map(function (f) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8')); });
const allItems = [];
themes.forEach(function (t) { t.items.forEach(function (it) { allItems.push(it); }); });

/* ====================================================================== */
group('Dates');
test('dayKey, addDays, diffDays', function () {
  eq(U.dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  eq(U.addDays('2026-01-31', 1), '2026-02-01');
  eq(U.addDays('2026-03-01', -1), '2026-02-28');
  eq(U.addDays('2024-02-28', 1), '2024-02-29');
  eq(U.diffDays('2026-01-01', '2026-01-08'), 7);
  eq(U.diffDays('2026-03-28', '2026-03-30'), 2);   // week-end du changement d'heure
});

/* ====================================================================== */
group('Répétition espacée');
test('intervalles 1, 2, 4, 7, 15, 30, 60 jours sur des bonnes réponses successives', function () {
  let card, day = '2026-01-01';
  const seen = [];
  for (let i = 0; i < 7; i++) {
    card = SRS.review(card, 'correct', day);
    seen.push(U.diffDays(day, card.due));
    eq(card.step, i + 1);
    day = card.due;
  }
  deq(seen, [1, 2, 4, 7, 15, 30, 60]);
});
test('l\'étape plafonne à 7 (intervalle de 60 jours)', function () {
  let card, day = '2026-01-01';
  for (let i = 0; i < 9; i++) { card = SRS.review(card, 'correct', day); day = card.due; }
  eq(card.step, 7);
  eq(U.diffDays(card.last, card.due), 60);
});
test('une erreur ramène au début et rend l\'item dû immédiatement', function () {
  let card, day = '2026-01-01';
  for (let i = 0; i < 4; i++) { card = SRS.review(card, 'correct', day); day = card.due; }
  eq(card.step, 4);
  card = SRS.review(card, 'wrong', day);
  eq(card.step, 0);
  eq(card.due, day);
  eq(card.ko, 1);
  assert.ok(SRS.isDue(card, day));
  card = SRS.review(card, 'correct', day);
  eq(card.step, 1);
  eq(card.due, U.addDays(day, 1));
});
test('« presque juste » laisse l\'item à la même étape', function () {
  let card, day = '2026-01-01';
  for (let i = 0; i < 3; i++) { card = SRS.review(card, 'correct', day); day = card.due; }
  eq(card.step, 3);
  card = SRS.review(card, 'almost', day);
  eq(card.step, 3);
  eq(card.due, U.addDays(day, 4));                 // même intervalle que l'étape 3
});
test('« presque juste » sur un nouvel item : étape 0, revu le lendemain', function () {
  const card = SRS.review(undefined, 'almost', '2026-01-01');
  eq(card.step, 0);
  eq(card.due, '2026-01-02');
});
test('bonne réponse sur un item pas encore dû : ni étape ni date ne bougent', function () {
  let card = SRS.review(undefined, 'correct', '2026-01-01');   // dû le 02
  card = SRS.review(card, 'correct', '2026-01-02');            // étape 2, dû le 04
  const again = SRS.review(card, 'correct', '2026-01-03');     // en avance
  eq(again.step, 2);
  eq(again.due, '2026-01-04');
  eq(again.seen, 3);
});
test('erreur sur un item pas encore dû : retour au début quand même', function () {
  let card = SRS.review(undefined, 'correct', '2026-01-01');
  card = SRS.review(card, 'wrong', '2026-01-01');
  eq(card.step, 0);
});
test('isDue, isNew, isLearned, mastery', function () {
  assert.ok(SRS.isNew(undefined));
  assert.ok(!SRS.isDue(undefined, '2026-01-01'));
  const c = SRS.review(undefined, 'correct', '2026-01-01');
  assert.ok(!SRS.isNew(c));
  assert.ok(SRS.isLearned(c));
  assert.ok(!SRS.isDue(c, '2026-01-01'));
  assert.ok(SRS.isDue(c, '2026-01-02'));
  assert.ok(SRS.isDue(c, '2026-02-02'));
  eq(SRS.mastery(c), 0.2);
  eq(SRS.mastery({ step: 7 }), 1);
  eq(SRS.mastery(undefined), 0);
});
test('review ne modifie pas la fiche d\'origine', function () {
  const c = SRS.review(undefined, 'correct', '2026-01-01');
  const copy = JSON.parse(JSON.stringify(c));
  SRS.review(c, 'wrong', '2026-01-02');
  deq(c, copy);
});

/* ====================================================================== */
group('Correction des réponses saisies');
function grade(input, answers, opts) { return GR.gradeText(input, answers, opts).result; }
test('casse, ponctuation finale et espaces superflus ignorés', function () {
  eq(grade('  the VARIANCE   is due to volumes ', ['The variance is due to volumes.']), 'correct');
  eq(grade('Could you send me the file', ['Could you send me the file?']), 'correct');
  eq(grade('kind regards,', ['Kind regards']), 'correct');
});
test('variantes listées dans le JSON acceptées', function () {
  eq(grade('aim', ['purpose', 'aim', 'objective']), 'correct');
  eq(grade('at your earliest convenience', ['as soon as possible', 'ASAP', 'at your earliest convenience']), 'correct');
});
test('contractions équivalentes aux formes pleines', function () {
  eq(grade("We haven't received it yet", ['We have not received it yet.']), 'correct');
  eq(grade('I will send the minutes', ["I'll send the minutes."]), 'correct');
  eq(grade("it's been approved", ['It has been approved.']), 'correct');
  eq(grade("it's ready", ['It is ready.']), 'correct');
  eq(grade("I'd like to add something", ['I would like to add something.']), 'correct');
  eq(grade('We cannot agree', ["We can't agree."]), 'correct');
  eq(grade('we can not agree', ["We can't agree."]), 'correct');
  eq(grade("let's start", ['Let us start.']), 'correct');
  eq(grade('dont hesitate', ["Don't hesitate."]), 'correct');
});
test('orthographes britannique et américaine équivalentes', function () {
  eq(grade('favorable', ['favourable']), 'correct');
  eq(grade('cost center', ['cost centre']), 'correct');
  eq(grade('amortization', ['amortisation']), 'correct');
  eq(grade('recognized', ['recognised']), 'correct');
  eq(grade('leveled', ['levelled']), 'correct');
  eq(grade('analyze', ['analyse']), 'correct');
});
test('traits d\'union et accents ignorés', function () {
  eq(grade('follow up call', ['follow-up call']), 'correct');
  eq(grade('continuite d exploitation', ["continuité d'exploitation"]), 'wrong');   // apostrophe remplacée par une espace : autre découpage
  eq(grade("continuite d'exploitation", ["continuité d'exploitation"]), 'correct');
  eq(grade('resume', ['résumé']), 'correct');
});
test('pourcentages : « 5 percent », « 5 per cent » et « 5% »', function () {
  eq(grade('by 5 percent', ['by 5%']), 'correct');
  eq(grade('by 5 per cent', ['by 5%']), 'correct');
  eq(grade('by 5 %', ['by 5%']), 'correct');
  eq(grade('by 50%', ['by 5%']), 'wrong');
  eq(grade('3.5%', ['35%']), 'wrong');
});
test('faute de frappe sur un mot long : « Presque ! »', function () {
  eq(grade('submited', ['submitted']), 'almost');
  eq(grade('recieved', ['received']), 'almost');           // inversion de deux lettres
  eq(grade('accural', ['accrual']), 'almost');
  eq(grade('The varience is due to volumes', ['The variance is due to volumes.']), 'almost');
  eq(grade('materialty', ['materiality']), 'almost');
});
test('pas de tolérance sur les mots courts', function () {
  eq(grade('teh budget', ['the budget']), 'wrong');
  eq(grade('form', ['from']), 'wrong');
  eq(grade('in', ['on']), 'wrong');
  eq(grade('rise', ['rose']), 'wrong');
});
test('une faute de grammaire n\'est jamais une « faute de frappe »', function () {
  eq(grade('informations', ['information']), 'wrong');     // pluriel fautif
  eq(grade('accruals', ['accrual']), 'wrong');
  eq(grade('increases', ['increased']), 'wrong');          // autre temps
  eq(grade('increase', ['increased']), 'wrong');
  eq(grade('advise', ['advice']), 'wrong');                // mots proches mais différents
  eq(grade('effect', ['affect']), 'wrong');
  eq(grade('sensitive', ['sensible']), 'wrong');
  eq(grade('analyses', ['analysis']), 'wrong');
  eq(grade('fifteen', ['fifty']), 'wrong');
});
test('trop de fautes ou mot manquant : incorrect', function () {
  eq(grade('submited the reprot', ['submitted the report']), 'wrong');
  eq(grade('the variance due to volumes', ['The variance is due to volumes.']), 'wrong');
  eq(grade('', ['budget']), 'wrong');
  eq(grade('   ', ['budget']), 'wrong');
});
test('formes explicitement rejetées (reject)', function () {
  eq(grade('I am agree with you', ['I agree with you.'], { reject: ['I am agree with you.'] }), 'wrong');
  eq(grade('an advice', ['a piece of advice', 'advice'], { reject: ['an advice'], looseArticles: true }), 'wrong');
  eq(grade('advice', ['a piece of advice', 'advice'], { reject: ['an advice'], looseArticles: true }), 'correct');
});
test('articles facultatifs en traduction (looseArticles)', function () {
  eq(grade('deadline', ['a deadline'], { looseArticles: true }), 'correct');
  eq(grade('the going concern', ['going concern'], { looseArticles: true }), 'correct');
  eq(grade('postpone a meeting', ['to postpone a meeting'], { looseArticles: true }), 'correct');
  eq(grade('deadline', ['a deadline']), 'wrong');
});
test('noTypo désactive la tolérance (remise en ordre)', function () {
  eq(grade('submited', ['submitted'], { noTypo: true }), 'wrong');
});
test('la bonne réponse affichée est celle qui a été reconnue', function () {
  const r = GR.gradeText('favorable', ['favourable', 'favorable', 'positive']);
  eq(r.result, 'correct');
  eq(r.expected, 'favourable');
  eq(GR.gradeText('xyz', ['favourable', 'positive']).expected, 'favourable');
});
test('distance d\'édition', function () {
  eq(GR.editDistance('kitten', 'sitting'), 3);
  eq(GR.editDistance('abcd', 'abdc'), 1);
  eq(GR.editDistance('', 'abc'), 3);
});

/* ====================================================================== */
group('Cœurs');
const MIN = 60000;
test('5 cœurs au départ, un cœur perdu par erreur, jamais en dessous de 0', function () {
  const st = freshState(); let t = ms(2026, 1, 1, 9);
  eq(st.hearts.count, 5);
  for (let i = 4; i >= 0; i--) eq(G.loseHeart(st, t), i);
  eq(G.loseHeart(st, t), 0);
  eq(st.hearts.count, 0);
});
test('un cœur regagné toutes les 30 minutes', function () {
  const st = freshState(); const t = ms(2026, 1, 1, 9);
  G.loseHeart(st, t); G.loseHeart(st, t);            // 3 cœurs à 9 h 00
  eq(G.refreshHearts(st, t + 29 * MIN), 3);
  eq(G.refreshHearts(st, t + 30 * MIN), 4);
  eq(G.nextHeartInMs(st, t + 45 * MIN), 15 * MIN);
  eq(G.refreshHearts(st, t + 60 * MIN), 5);
  eq(st.hearts.ts, null);
  eq(G.nextHeartInMs(st, t + 61 * MIN), 0);
});
test('la régénération ne dépasse jamais 5 cœurs, même après une longue absence', function () {
  const st = freshState(); const t = ms(2026, 1, 1, 9);
  for (let i = 0; i < 5; i++) G.loseHeart(st, t);
  eq(G.refreshHearts(st, t + 10 * 24 * 60 * MIN), 5);
});
test('le chrono ne redémarre pas à chaque erreur', function () {
  const st = freshState(); const t = ms(2026, 1, 1, 9);
  G.loseHeart(st, t);                                // 4 à 9 h 00
  G.loseHeart(st, t + 20 * MIN);                     // 3 à 9 h 20
  eq(G.refreshHearts(st, t + 30 * MIN), 4);          // le 1er cœur revient à 9 h 30
  eq(G.refreshHearts(st, t + 60 * MIN), 5);
});
test('gain d\'un cœur (entraînement réussi), plafonné à 5', function () {
  const st = freshState(); const t = ms(2026, 1, 1, 9);
  G.loseHeart(st, t); G.loseHeart(st, t);
  eq(G.gainHeart(st, t), 4);
  eq(G.gainHeart(st, t), 5);
  eq(G.gainHeart(st, t), 5);
  eq(st.hearts.ts, null);
});
test('horloge reculée : pas de cœur gratuit ni de blocage', function () {
  const st = freshState(); const t = ms(2026, 1, 1, 9);
  G.loseHeart(st, t);
  eq(G.refreshHearts(st, t - 3600000), 4);
  eq(G.refreshHearts(st, t - 3600000 + 30 * MIN), 5);
});

/* ====================================================================== */
group('XP, objectif quotidien et série (dates simulées)');
function reachGoal(st, day) { return G.addXp(st, G.goalOf(st).xp, day); }
test('objectifs : 5 / 10 / 15 minutes = 100 / 200 / 300 XP et 10 / 20 / 30 exercices', function () {
  const st = freshState();
  deq(G.goalOf(st), { xp: 100, size: 10 });
  st.settings.goalMinutes = 10; deq(G.goalOf(st), { xp: 200, size: 20 });
  st.settings.goalMinutes = 15; deq(G.goalOf(st), { xp: 300, size: 30 });
});
test('l\'XP s\'accumule par jour et au total', function () {
  const st = freshState();
  G.addXp(st, 30, '2026-01-01'); G.addXp(st, 20, '2026-01-01'); G.addXp(st, 10, '2026-01-02');
  eq(st.xp.total, 60);
  eq(G.todayXp(st, '2026-01-01'), 50);
  eq(G.todayXp(st, '2026-01-02'), 10);
  eq(G.todayXp(st, '2026-01-03'), 0);
});
test('la série ne compte que les jours où l\'objectif est atteint', function () {
  const st = freshState();
  let r = G.addXp(st, 90, '2026-01-01');
  eq(r.reachedNow, false); eq(st.streak.count, 0);
  r = G.addXp(st, 10, '2026-01-01');
  eq(r.reachedNow, true); eq(st.streak.count, 1);
  r = G.addXp(st, 50, '2026-01-01');
  eq(r.reachedNow, false); eq(st.streak.count, 1);   // pas compté deux fois le même jour
});
test('jours consécutifs : la série augmente', function () {
  const st = freshState();
  reachGoal(st, '2026-01-01'); reachGoal(st, '2026-01-02'); reachGoal(st, '2026-01-03');
  eq(st.streak.count, 3);
  eq(st.streak.best, 3);
  eq(G.currentStreak(st, '2026-01-04'), 3);           // le lendemain matin, la série tient encore
});
test('un jour manqué sans gel : la série retombe à 0, le record reste', function () {
  const st = freshState();
  reachGoal(st, '2026-01-01'); reachGoal(st, '2026-01-02');
  eq(G.currentStreak(st, '2026-01-04'), 0);
  eq(st.streak.best, 2);
  reachGoal(st, '2026-01-04');
  eq(st.streak.count, 1);
});
test('un gel est gagné tous les 7 jours de série', function () {
  const st = freshState();
  let day = '2026-01-01', earned = 0;
  for (let i = 0; i < 7; i++) { if (reachGoal(st, day).freezeEarned) earned++; day = U.addDays(day, 1); }
  eq(st.streak.count, 7); eq(st.streak.freezes, 1); eq(earned, 1);
  for (let i = 0; i < 7; i++) { reachGoal(st, day); day = U.addDays(day, 1); }
  eq(st.streak.count, 14); eq(st.streak.freezes, 2);
  for (let i = 0; i < 7; i++) { reachGoal(st, day); day = U.addDays(day, 1); }
  eq(st.streak.count, 21); eq(st.streak.freezes, 2);   // 2 gels au maximum
});
test('le gel protège la série pour un jour manqué', function () {
  const st = freshState();
  let day = '2026-01-01';
  for (let i = 0; i < 7; i++) { reachGoal(st, day); day = U.addDays(day, 1); }   // 01 → 07, 1 gel
  // le 08 est manqué ; on revient le 09
  eq(G.currentStreak(st, '2026-01-09'), 7);
  eq(st.streak.freezes, 0);
  deq(st.streak.frozen, ['2026-01-08']);
  reachGoal(st, '2026-01-09');
  eq(st.streak.count, 8);
});
test('deux jours manqués avec un seul gel : la série est perdue (le gel est conservé)', function () {
  const st = freshState();
  let day = '2026-01-01';
  for (let i = 0; i < 7; i++) { reachGoal(st, day); day = U.addDays(day, 1); }
  eq(G.currentStreak(st, '2026-01-10'), 0);
  eq(st.streak.freezes, 1);
  eq(st.streak.best, 7);
});
test('deux jours manqués avec deux gels : la série tient', function () {
  const st = freshState();
  let day = '2026-01-01';
  for (let i = 0; i < 14; i++) { reachGoal(st, day); day = U.addDays(day, 1); }  // 01 → 14, 2 gels
  eq(G.currentStreak(st, '2026-01-17'), 14);
  eq(st.streak.freezes, 0);
  reachGoal(st, '2026-01-17');
  eq(st.streak.count, 15);
});
test('le règlement des jours manqués est idempotent', function () {
  const st = freshState();
  let day = '2026-01-01';
  for (let i = 0; i < 7; i++) { reachGoal(st, day); day = U.addDays(day, 1); }
  G.settleStreak(st, '2026-01-09'); G.settleStreak(st, '2026-01-09'); G.settleStreak(st, '2026-01-09');
  eq(st.streak.count, 7); eq(st.streak.freezes, 0); eq(st.streak.frozen.length, 1);
});
test('passage de mois et d\'année', function () {
  const st = freshState();
  reachGoal(st, '2025-12-30'); reachGoal(st, '2025-12-31'); reachGoal(st, '2026-01-01');
  eq(st.streak.count, 3);
});
test('baisser l\'objectif en cours de journée valide le jour si l\'XP suffit', function () {
  const st = freshState();
  st.settings.goalMinutes = 15;
  G.addXp(st, 120, '2026-01-01');
  eq(st.streak.count, 0);
  st.settings.goalMinutes = 5;
  eq(G.checkGoal(st, '2026-01-01').reachedNow, true);
  eq(st.streak.count, 1);
});

/* ====================================================================== */
group('Composition des sessions');
function fakeItems(n, themesList, type) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: 'it' + i, theme: themesList[i % themesList.length], type: type || ['fill', 'translate', 'order', 'conjugate', 'mcq'][i % 5], answers: ['x'], prompt: '___', hint: 'h', explanation: 'e', distractors: ['a', 'b'] });
  }
  return out;
}
const rng = function () { return U.mulberry32(42); };
test('aucune révision due : uniquement du nouveau contenu', function () {
  const items = fakeItems(60, ['a', 'b', 'c']);
  const s = S.buildSession({ items, cards: {}, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a', 'b', 'c'], hearts: 5, rng: rng() });
  eq(s.entries.length, 10);
  deq(s.counts, { due: 0, fresh: 10, extra: 0 });
  assert.ok(s.entries.every(function (e) { return e.isNew; }));
});
test('environ 60 % de révisions dues et 40 % de nouveautés', function () {
  const items = fakeItems(80, ['a', 'b', 'c', 'd']);
  const cards = {};
  for (let i = 0; i < 30; i++) cards['it' + i] = { step: 1, due: '2026-01-09', seen: 1, ok: 1, ko: 0 };
  [10, 20, 30].forEach(function (size) {
    const s = S.buildSession({ items, cards, today: '2026-01-10', size, mode: 'daily', themeOrder: ['a', 'b', 'c', 'd'], hearts: 5, rng: rng() });
    eq(s.entries.length, size);
    eq(s.counts.due, size * 0.6);
    eq(s.counts.fresh, size * 0.4);
  });
});
test('peu de révisions dues : complété par du nouveau', function () {
  const items = fakeItems(60, ['a', 'b']);
  const cards = { it0: { step: 1, due: '2026-01-01', seen: 1 }, it1: { step: 2, due: '2026-01-05', seen: 2 } };
  const s = S.buildSession({ items, cards, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a', 'b'], hearts: 5, rng: rng() });
  deq(s.counts, { due: 2, fresh: 8, extra: 0 });
});
test('0 cœur : les nouvelles leçons sont bloquées, les révisions restent accessibles', function () {
  const items = fakeItems(60, ['a', 'b']);
  const cards = {};
  for (let i = 0; i < 5; i++) cards['it' + i] = { step: 1, due: '2026-01-09', seen: 1 };
  const s = S.buildSession({ items, cards, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a', 'b'], hearts: 0, rng: rng() });
  eq(s.reviewsOnly, true);
  eq(s.counts.fresh, 0);
  eq(s.entries.length, 5);
  assert.ok(s.entries.every(function (e) { return !e.isNew; }));
});
test('0 cœur et rien de déjà vu : session vide', function () {
  const s = S.buildSession({ items: fakeItems(20, ['a']), cards: {}, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a'], hearts: 0, rng: rng() });
  eq(s.entries.length, 0);
});
test('entraînement : uniquement des items déjà vus, les plus en retard d\'abord', function () {
  const items = fakeItems(40, ['a', 'b']);
  const cards = {};
  for (let i = 0; i < 12; i++) cards['it' + i] = { step: 1, due: U.addDays('2026-01-01', i), seen: 1 };
  const s = S.buildSession({ items, cards, today: '2026-01-06', size: 10, mode: 'training', themeOrder: ['a', 'b'], hearts: 5, rng: rng() });
  eq(s.counts.fresh, 0);
  eq(s.counts.due, 6);                               // dus : 01 → 06
  eq(s.counts.extra, 4);                             // complété par des items vus mais pas encore dus
  const ids = s.entries.map(function (e) { return e.item.id; }).sort();
  deq(ids, ['it0', 'it1', 'it2', 'it3', 'it4', 'it5', 'it6', 'it7', 'it8', 'it9'].sort());
  s.entries.forEach(function (e) { eq(e.wasDue, cards[e.item.id].due <= '2026-01-06'); });
});
test('leçon de thème : nouveautés du thème choisi + révisions dues de tous les thèmes', function () {
  const items = fakeItems(90, ['a', 'b', 'c']);
  const cards = {};
  items.filter(function (it) { return it.theme === 'b'; }).slice(0, 6).forEach(function (it) { cards[it.id] = { step: 1, due: '2026-01-09', seen: 1 }; });
  const s = S.buildSession({ items, cards, today: '2026-01-10', size: 10, mode: 'theme', themeId: 'c', themeOrder: ['a', 'b', 'c'], hearts: 5, rng: rng() });
  eq(s.counts.due, 6); eq(s.counts.fresh, 4);
  s.entries.forEach(function (e) { eq(e.item.theme, e.isNew ? 'c' : 'b'); });
});
test('les nouveautés alternent entre les thèmes (entrelacement)', function () {
  const items = fakeItems(80, ['a', 'b', 'c', 'd']);
  const s = S.buildSession({ items, cards: {}, today: '2026-01-10', size: 8, mode: 'daily', themeOrder: ['a', 'b', 'c', 'd'], hearts: 5, rng: rng() });
  const perTheme = {};
  s.entries.forEach(function (e) { perTheme[e.item.theme] = (perTheme[e.item.theme] || 0) + 1; });
  deq(perTheme, { a: 2, b: 2, c: 2, d: 2 });
});
test('rappel actif : au plus 40 % d\'exercices à choix parmi les nouveautés', function () {
  const items = fakeItems(40, ['a'], 'mcq').concat(fakeItems(40, ['a'], 'fill').map(function (it, i) { it.id = 'p' + i; return it; }));
  const s = S.buildSession({ items, cards: {}, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a'], hearts: 5, rng: rng() });
  const recog = s.entries.filter(function (e) { return C.isRecognition(e.item); }).length;
  eq(s.entries.length, 10);
  assert.ok(recog <= 4, recog + ' exercices à choix');
});
test('s\'il ne reste que des exercices à choix, ils sont quand même proposés', function () {
  const s = S.buildSession({ items: fakeItems(20, ['a'], 'mcq'), cards: {}, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a'], hearts: 5, rng: rng() });
  eq(s.entries.length, 10);
});
test('les types d\'exercices sont mélangés : pas deux fois de suite le même quand c\'est évitable', function () {
  const items = fakeItems(100, ['a', 'b', 'c', 'd']);
  const s = S.buildSession({ items, cards: {}, today: '2026-01-10', size: 20, mode: 'daily', themeOrder: ['a', 'b', 'c', 'd'], hearts: 5, rng: rng() });
  let repeats = 0;
  for (let i = 1; i < s.entries.length; i++) if (s.entries[i].item.type === s.entries[i - 1].item.type) repeats++;
  assert.ok(repeats <= 2, repeats + ' répétitions consécutives');
});
test('tout est appris et rien n\'est dû : entraînement libre sur les items vus', function () {
  const items = fakeItems(12, ['a']);
  const cards = {};
  items.forEach(function (it) { cards[it.id] = { step: 3, due: '2026-03-01', seen: 3 }; });
  const s = S.buildSession({ items, cards, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: ['a'], hearts: 5, rng: rng() });
  deq(s.counts, { due: 0, fresh: 0, extra: 10 });
  assert.ok(s.entries.every(function (e) { return !e.wasDue && !e.isNew; }));
});
test('contenu réel : la première session mélange au moins 5 types d\'exercices et 8 thèmes', function () {
  const s = S.buildSession({ items: allItems, cards: {}, today: '2026-01-10', size: 10, mode: 'daily', themeOrder: themes.map(function (t) { return t.id; }), hearts: 5, rng: rng() });
  const types = new Set(s.entries.map(function (e) { return e.item.type; }));
  const th = new Set(s.entries.map(function (e) { return e.item.theme; }));
  assert.ok(types.size >= 5, Array.from(types).join(', '));
  eq(th.size, 8);
});
test('contenu réel : une leçon de thème fait tourner les types, session après session', function () {
  const cards = {};
  const seenTypes = new Set();
  for (let n = 0; n < 3; n++) {
    const s = S.buildSession({ items: allItems, cards, today: '2026-01-10', size: 10, mode: 'theme', themeId: 'audit', themeOrder: themes.map(function (t) { return t.id; }), hearts: 5, rng: rng() });
    const types = new Set(s.entries.map(function (e) { return e.item.type; }));
    assert.ok(types.size >= 5, 'session ' + n + ' : ' + Array.from(types).join(', '));
    s.entries.forEach(function (e) { seenTypes.add(e.item.type); cards[e.item.id] = { step: 3, due: '2026-03-01', seen: 1 }; });
  }
  eq(seenTypes.size, 9);
});
test('aucun doublon dans une session', function () {
  const items = fakeItems(50, ['a', 'b']);
  const cards = {};
  for (let i = 0; i < 20; i++) cards['it' + i] = { step: 1, due: '2026-01-09', seen: 1 };
  const s = S.buildSession({ items, cards, today: '2026-01-10', size: 30, mode: 'daily', themeOrder: ['a', 'b'], hearts: 5, rng: rng() });
  const ids = s.entries.map(function (e) { return e.item.id; });
  eq(new Set(ids).size, ids.length);
});
test('countDue', function () {
  const items = fakeItems(5, ['a']);
  eq(S.countDue(items, { it0: { due: '2026-01-01', seen: 1 }, it1: { due: '2026-02-01', seen: 1 } }, '2026-01-10'), 1);
});

/* ====================================================================== */
group('Sauvegarde, export et import');
function memoryStorage() {
  const data = {};
  return { getItem: function (k) { return k in data ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; }, _data: data };
}
test('état par défaut', function () {
  const st = freshState();
  eq(st.hearts.count, 5); eq(st.xp.total, 0); eq(st.streak.count, 0);
  eq(st.settings.goalMinutes, 5); eq(st.settings.voice, 'en-GB'); eq(st.settings.rate, 1);
  deq(st.custom, []);
});
test('sauvegarde puis rechargement dans le stockage local', function () {
  const backend = memoryStorage();
  const store = ST.createStore(backend);
  eq(store.persistent, true);
  const st = store.load(1000);
  st.xp.total = 250; st.cards['mtg-001'] = SRS.review(undefined, 'correct', '2026-01-01');
  eq(store.save(st), true);
  const again = ST.createStore(backend).load(2000);
  eq(again.xp.total, 250);
  eq(again.cards['mtg-001'].step, 1);
  eq(again.cards['mtg-001'].due, '2026-01-02');
});
test('stockage indisponible : l\'app continue en mémoire et le signale', function () {
  const broken = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('denied'); }, removeItem: function () {} };
  const store = ST.createStore(broken);
  eq(store.persistent, false);
  const st = store.load(1);
  st.xp.total = 40;
  eq(store.save(st), false);
  eq(store.load(2).xp.total, 40);                    // conservé en mémoire pendant la session
  eq(ST.createStore(null).persistent, false);
});
test('stockage corrompu : retour à un état neuf sans plantage', function () {
  const backend = memoryStorage();
  backend.setItem(ST.STORAGE_KEY, '{pas du json');
  eq(ST.createStore(backend).load(5).xp.total, 0);
});
test('export puis import : la progression est restituée à l\'identique', function () {
  const st = freshState();
  st.settings.goalMinutes = 15; st.settings.voice = 'en-US'; st.settings.rate = 0.75;
  let day = '2026-01-01';
  for (let i = 0; i < 8; i++) { reachGoal(st, day); day = U.addDays(day, 1); }
  st.cards['aud-003'] = SRS.review(SRS.review(undefined, 'correct', '2026-01-01'), 'correct', '2026-01-02');
  st.cards['cdg-001'] = SRS.review(undefined, 'wrong', '2026-01-03');
  G.loseHeart(st, ms(2026, 1, 8, 10));
  ST.addCustomWord(st, { en: 'write-off', fr: 'passage en perte', example: 'The receivable was written off.', theme: 'audit' }, 123);
  const text = ST.exportState(st, ms(2026, 1, 8, 12));
  const res = ST.importState(text, ms(2026, 2, 1));
  eq(res.ok, true);
  deq(res.state.cards, st.cards);
  deq(res.state.xp, st.xp);
  deq(res.state.streak, st.streak);
  deq(res.state.hearts, st.hearts);
  deq(res.state.custom, st.custom);
  deq(res.state.settings, st.settings);
  eq(res.state.customSeq, st.customSeq);
});
test('le fichier d\'export est un JSON lisible et identifié', function () {
  const data = JSON.parse(ST.exportState(freshState(), 99));
  eq(data.app, 'english-pro'); eq(data.version, 1); eq(data.exportedAt, 99);
  assert.ok(data.state && data.state.cards);
});
test('import refusé : JSON invalide, autre application, version trop récente', function () {
  eq(ST.importState('pas du json').ok, false);
  eq(ST.importState('{"foo": 1}').ok, false);
  eq(ST.importState('[]').ok, false);
  eq(ST.importState(JSON.stringify({ app: 'autre', state: {} })).ok, false);
  eq(ST.importState(JSON.stringify({ app: 'english-pro', version: 99, state: {} })).ok, false);
  assert.ok(ST.importState('pas du json').error.length > 0);
});
test('import d\'un fichier incomplet ou altéré : valeurs par défaut, rien ne plante', function () {
  const res = ST.importState(JSON.stringify({ app: 'english-pro', version: 1, state: { xp: { total: 70 }, hearts: { count: 99 }, settings: { goalMinutes: 7, voice: 'fr-FR', rate: 3 }, cards: { a: { step: 42, due: 5 }, b: 'oops' }, custom: [{ id: 'custom-1', en: 'x', fr: 'y' }, { bad: true }] } }));
  eq(res.ok, true);
  eq(res.state.xp.total, 70);
  eq(res.state.hearts.count, 5);
  eq(res.state.settings.goalMinutes, 5); eq(res.state.settings.voice, 'en-GB'); eq(res.state.settings.rate, 1);
  eq(res.state.cards.a.step, 7); eq(res.state.cards.a.due, null);
  eq(res.state.cards.b, undefined);
  eq(res.state.custom.length, 1);
  eq(res.state.streak.count, 0);
});

/* ====================================================================== */
group('Mes mots');
test('ajout d\'un mot : il devient un item de révision comme les autres', function () {
  const st = freshState(); st.deviceId = 'abcd';
  const res = ST.addCustomWord(st, { en: ' write-off ', fr: 'passage en perte', example: 'The receivable was written off in March.', theme: 'audit' }, 5);
  eq(res.ok, true);
  eq(st.custom.length, 1);
  eq(res.word.en, 'write-off');
  eq(res.word.id, 'custom-abcd-1');
  const item = C.customToItem(res.word);
  deq(C.validateItem(item), []);
  eq(item.type, 'translate'); eq(item.direction, 'fr-en'); eq(item.theme, 'audit');
  eq(GR.gradeText('write off', item.answers, { looseArticles: true }).result, 'correct');
  const card = C.flashcardOf(item);
  eq(card.en, 'write-off'); eq(card.fr, 'passage en perte'); eq(card.example, 'The receivable was written off in March.');
  // il entre dans une session comme nouveauté, puis dans la répétition espacée
  const s = S.buildSession({ items: [item], cards: st.cards, today: '2026-01-01', size: 10, mode: 'daily', themeOrder: ['audit'], hearts: 5 });
  eq(s.entries.length, 1); eq(s.entries[0].isNew, true);
  st.cards[item.id] = SRS.review(st.cards[item.id], 'correct', '2026-01-01');
  eq(S.countDue([item], st.cards, '2026-01-02'), 1);
});
test('champs obligatoires, doublons et identifiants uniques', function () {
  const st = freshState(); st.deviceId = 'abcd';
  eq(ST.addCustomWord(st, { en: '', fr: 'x' }).ok, false);
  eq(ST.addCustomWord(st, { en: 'x', fr: '  ' }).ok, false);
  eq(ST.addCustomWord(st, { en: 'accrual', fr: 'charge à payer' }).ok, true);
  eq(ST.addCustomWord(st, { en: 'Accrual', fr: 'Charge à payer' }).ok, false);
  eq(ST.addCustomWord(st, { en: 'deferral', fr: 'report' }).ok, true);
  deq(st.custom.map(function (w) { return w.id; }), ['custom-abcd-1', 'custom-abcd-2']);
  eq(st.custom[0].theme, 'custom');
  eq(C.customToItem(st.custom[0]).explanation.length > 0, true);
});
test('suppression d\'un mot : sa fiche de révision disparaît, les identifiants ne sont pas réutilisés', function () {
  const st = freshState(); st.deviceId = 'abcd';
  ST.addCustomWord(st, { en: 'a', fr: 'b' });
  ST.addCustomWord(st, { en: 'c', fr: 'd' });
  st.cards['custom-abcd-1'] = SRS.review(undefined, 'correct', '2026-01-01');
  eq(ST.removeCustomWord(st, 'custom-abcd-1'), true);
  eq(st.custom.length, 1); eq(st.cards['custom-abcd-1'], undefined);
  eq(ST.removeCustomWord(st, 'custom-abcd-1'), false);
  eq(ST.addCustomWord(st, { en: 'e', fr: 'f' }).word.id, 'custom-abcd-3');
});

/* ====================================================================== */
group('Synchronisation : fusion de deux appareils');
function device(id) { const s = freshState(); s.deviceId = id; return s; }
const T0 = ms(2026, 1, 5, 9);
test('chaque appareil a son identifiant, conservé à la sauvegarde', function () {
  const a = freshState(), b = freshState();
  assert.ok(/^[a-z0-9]{8}$/.test(a.deviceId));
  assert.ok(a.deviceId !== b.deviceId);
  eq(ST.migrate(JSON.parse(JSON.stringify(a))).deviceId, a.deviceId);
});
test('fiches : la révision la plus récente l\'emporte, dans les deux sens', function () {
  const phone = device('phone'), pc = device('pc');
  phone.cards.x = SRS.review(undefined, 'correct', '2026-01-05', T0);
  pc.cards.x = SRS.review(SRS.review(undefined, 'correct', '2026-01-05', T0 + 1000), 'wrong', '2026-01-05', T0 + 2000);
  phone.cards.onlyPhone = SRS.review(undefined, 'correct', '2026-01-05', T0);
  pc.cards.onlyPc = SRS.review(undefined, 'correct', '2026-01-05', T0);
  const m1 = MG.mergeStates(phone, pc, '2026-01-05');
  eq(m1.cards.x.step, 0); eq(m1.cards.x.ko, 1);
  assert.ok(m1.cards.onlyPhone && m1.cards.onlyPc);
  const m2 = MG.mergeStates(pc, phone, '2026-01-05');
  deq(m2.cards, m1.cards);
});
test('fiches sans horodatage (anciennes sauvegardes) : date puis nombre de révisions', function () {
  assert.ok(MG.newer({ last: '2026-01-06', seen: 1 }, { last: '2026-01-05', seen: 9 }));
  assert.ok(MG.newer({ last: '2026-01-05', seen: 3 }, { last: '2026-01-05', seen: 2 }));
  assert.ok(!MG.newer({ last: '2026-01-05', seen: 2 }, { last: '2026-01-05', seen: 2 }));
});
test('XP : additionnée entre appareils, jamais comptée deux fois', function () {
  const phone = device('phone'), pc = device('pc');
  G.addXp(phone, 60, '2026-01-05'); G.addXp(pc, 50, '2026-01-05'); G.addXp(pc, 30, '2026-01-04');
  let p = MG.mergeStates(phone, pc, '2026-01-05');
  eq(G.totalXp(p), 140); eq(G.todayXp(p, '2026-01-05'), 110); eq(p.xp.total, 60);
  // synchroniser plusieurs fois ne change rien
  p = MG.mergeStates(p, pc, '2026-01-05'); p = MG.mergeStates(p, pc, '2026-01-05');
  eq(G.totalXp(p), 140);
  // le PC récupère l'état du téléphone (qui contient déjà l'XP du PC) : toujours 140
  const q = MG.mergeStates(pc, p, '2026-01-05');
  eq(G.totalXp(q), 140); eq(q.xp.total, 80); eq(q.peers.phone.total, 60);
  // le téléphone continue, puis tout se resynchronise
  G.addXp(p, 20, '2026-01-05');
  const r = MG.mergeStates(q, p, '2026-01-05');
  eq(G.totalXp(r), 160);
});
test('objectif atteint grâce à l\'XP des deux appareils : la série avance', function () {
  const phone = device('phone'), pc = device('pc');
  G.addXp(phone, 60, '2026-01-05'); G.addXp(pc, 50, '2026-01-05');
  eq(phone.streak.count, 0); eq(pc.streak.count, 0);
  const m = MG.mergeStates(phone, pc, '2026-01-05');
  eq(m.streak.count, 1); eq(m.streak.last, '2026-01-05');
});
test('série : la plus récente l\'emporte, le record est conservé', function () {
  const phone = device('phone'), pc = device('pc');
  phone.streak = { count: 4, best: 9, last: '2026-01-04', freezes: 1, frozen: ['2025-12-20'] };
  pc.streak = { count: 5, best: 5, last: '2026-01-05', freezes: 0, frozen: [] };
  const m = MG.mergeStates(phone, pc, '2026-01-05');
  eq(m.streak.count, 5); eq(m.streak.best, 9); eq(m.streak.last, '2026-01-05');
  deq(m.streak.frozen, ['2025-12-20']);
});
test('mots perso : union, et une suppression se propage à l\'autre appareil', function () {
  const phone = device('phone'), pc = device('pc');
  const w1 = ST.addCustomWord(phone, { en: 'accrual', fr: 'charge à payer' }, 1).word;
  const w2 = ST.addCustomWord(pc, { en: 'deferral', fr: 'report' }, 2).word;
  assert.ok(w1.id !== w2.id);
  let m = MG.mergeStates(phone, pc, '2026-01-05');
  deq(m.custom.map(function (w) { return w.en; }), ['accrual', 'deferral']);
  // le PC récupère l'union, puis supprime le mot du téléphone
  const pc2 = MG.mergeStates(pc, m, '2026-01-05');
  pc2.cards[w1.id] = SRS.review(undefined, 'correct', '2026-01-05', T0);
  ST.removeCustomWord(pc2, w1.id);
  m = MG.mergeStates(m, pc2, '2026-01-05');
  deq(m.custom.map(function (w) { return w.en; }), ['deferral']);
  eq(m.cards[w1.id], undefined);
});
test('réglages et cœurs restent propres à chaque appareil', function () {
  const phone = device('phone'), pc = device('pc');
  phone.settings.voice = 'en-US'; pc.settings.voice = 'en-GB';
  G.loseHeart(pc, T0);
  const m = MG.mergeStates(phone, pc, '2026-01-05');
  eq(m.settings.voice, 'en-US'); eq(m.hearts.count, 5); eq(m.deviceId, 'phone');
});
test('fusion pure : les deux états d\'origine ne sont pas modifiés', function () {
  const phone = device('phone'), pc = device('pc');
  G.addXp(pc, 50, '2026-01-05'); pc.cards.x = SRS.review(undefined, 'correct', '2026-01-05', T0);
  const a = JSON.stringify(phone), b = JSON.stringify(pc);
  MG.mergeStates(phone, pc, '2026-01-05');
  eq(JSON.stringify(phone), a); eq(JSON.stringify(pc), b);
});
test('import d\'une sauvegarde d\'un autre appareil : son XP n\'écrase pas celle de cet appareil', function () {
  const phone = device('phone');
  G.addXp(phone, 70, '2026-01-05');
  const imported = ST.importState(ST.exportState(phone, 1)).state;
  const adopted = MG.adoptImported(imported, 'pc');
  eq(adopted.deviceId, 'pc'); eq(adopted.xp.total, 0); eq(adopted.peers.phone.total, 70); eq(G.totalXp(adopted), 70);
  // réimporter sa propre sauvegarde ne change rien
  const own = MG.adoptImported(ST.importState(ST.exportState(phone, 1)).state, 'phone');
  eq(own.xp.total, 70); deq(own.peers, {});
});
test('l\'export ne contient jamais la clé GitHub', function () {
  const st = freshState();
  const text = ST.exportState(st, 1);
  assert.ok(!/token|ghp_/.test(text));
});

/* ====================================================================== */
group('Synchronisation : échanges avec GitHub (Gist simulé)');
function fakeGitHub(opts) {
  opts = opts || {};
  const gh = { gists: {}, seq: 0, calls: [], token: 'ghp_' + 'a'.repeat(36), down: false };
  function res(status, body) {
    return Promise.resolve({ status, ok: status >= 200 && status < 300, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(body); }, text: function () { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)); } });
  }
  gh.fetch = function (url, init) {
    init = init || {};
    const method = init.method || 'GET';
    gh.calls.push(method + ' ' + url.replace('https://api.github.com', ''));
    if (gh.down) return Promise.reject(new TypeError('Failed to fetch'));
    if (url.indexOf('https://raw.example/') === 0) return res(200, gh.gists[url.split('/').pop()].files['english-pro-progression.json'].content);
    if ((init.headers || {}).Authorization !== 'Bearer ' + gh.token) return res(401, { message: 'Bad credentials' });
    const path = url.replace('https://api.github.com', '');
    const body = init.body ? JSON.parse(init.body) : null;
    if (path === '/user') return res(200, { login: 'lucas-montaud' });
    if (path.indexOf('/gists?') === 0) return res(200, Object.keys(gh.gists).map(function (id) { return gh.gists[id]; }));
    if (path === '/gists' && method === 'POST') {
      const id = 'g' + (++gh.seq);
      gh.gists[id] = { id, public: body.public, updated_at: '2026-01-05T10:00:00Z', files: { 'english-pro-progression.json': { content: body.files['english-pro-progression.json'].content } } };
      return res(201, gh.gists[id]);
    }
    const m = /^\/gists\/(\w+)$/.exec(path);
    if (m) {
      const g = gh.gists[m[1]];
      if (!g) return res(404, { message: 'Not Found' });
      if (method === 'PATCH') { g.files['english-pro-progression.json'].content = body.files['english-pro-progression.json'].content; return res(200, g); }
      const f = g.files['english-pro-progression.json'];
      if (opts.truncate) return res(200, { id: g.id, files: { 'english-pro-progression.json': { truncated: true, content: f.content.slice(0, 10), raw_url: 'https://raw.example/' + g.id } } });
      return res(200, g);
    }
    return res(404, {});
  };
  return gh;
}
function memStore() { const d = {}; return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, d }; }
function syncOnce(client, state) {
  return client.sync(state, function (l, r) { return MG.mergeStates(l, r, '2026-01-05'); },
    function (s) { return ST.exportState(s, 1); }, function (t) { return ST.importState(t, 1); });
}
const asyncTests = [];
function atest(name, fn) { asyncTests.push({ group: currentGroup, name, fn }); }
atest('premier appareil : la clé est vérifiée et un Gist privé est créé', async function () {
  const gh = fakeGitHub(); const store = memStore();
  const phone = device('phone'); G.addXp(phone, 40, '2026-01-05');
  const c = SY.createClient({ fetch: gh.fetch, storage: store });
  eq(c.isConnected(), false);
  const r = await c.connect('  ' + gh.token + ' ', ST.exportState(phone, 1));
  deq(r, { login: 'lucas-montaud', created: true });
  eq(c.isConnected(), true);
  eq(Object.keys(gh.gists).length, 1);
  eq(gh.gists.g1.public, false);
  // la clé est gardée dans un stockage à part, jamais dans la progression
  assert.ok(store.d[SY.CONFIG_KEY].indexOf(gh.token) !== -1);
  assert.ok(gh.gists.g1.files['english-pro-progression.json'].content.indexOf(gh.token) === -1);
});
atest('deuxième appareil : il retrouve le même Gist, puis les deux progressions fusionnent', async function () {
  const gh = fakeGitHub();
  const phone = device('phone'), pc = device('pc');
  G.addXp(phone, 60, '2026-01-05'); phone.cards.a = SRS.review(undefined, 'correct', '2026-01-05', T0);
  G.addXp(pc, 50, '2026-01-05'); pc.cards.b = SRS.review(undefined, 'correct', '2026-01-05', T0);
  const cPhone = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  const cPc = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  await cPhone.connect(gh.token, ST.exportState(phone, 1));
  let rp = await syncOnce(cPhone, phone);
  const r = await cPc.connect(gh.token, ST.exportState(pc, 1));
  eq(r.created, false);
  eq(Object.keys(gh.gists).length, 1);
  const rpc = await syncOnce(cPc, pc);
  eq(rpc.pulled, true); eq(rpc.pushed, true);
  eq(G.totalXp(rpc.state), 110); assert.ok(rpc.state.cards.a && rpc.state.cards.b);
  eq(rpc.state.streak.count, 1);
  // le téléphone récupère tout
  rp = await syncOnce(cPhone, rp.state);
  eq(G.totalXp(rp.state), 110); assert.ok(rp.state.cards.b);
  eq(rp.state.deviceId, 'phone');
});
atest('rien de nouveau : pas d\'envoi inutile', async function () {
  const gh = fakeGitHub();
  const phone = device('phone');
  const c = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  await c.connect(gh.token, ST.exportState(phone, 1));
  const r1 = await syncOnce(c, phone);
  const r2 = await syncOnce(c, r1.state);
  eq(r2.pushed, false);
  assert.ok(c.config.lastSync > 0);
});
atest('clé mal copiée, refusée ou réseau coupé : message clair, rien n\'est perdu', async function () {
  const gh = fakeGitHub();
  const c = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  await assert.rejects(c.connect('bonjour', '{}'), function (e) { return e.code === 'format' && /ghp_/.test(e.message); });
  await assert.rejects(c.connect('ghp_' + 'b'.repeat(36), '{}'), function (e) { return e.code === 'auth'; });
  eq(c.isConnected(), false);
  await c.connect(gh.token, ST.exportState(device('phone'), 1));
  gh.down = true;
  const st = device('phone'); G.addXp(st, 30, '2026-01-05');
  await assert.rejects(syncOnce(c, st), function (e) { return (e.code === 'offline' || e.code === 'network') && e.message.length > 10; });
  eq(st.xp.total, 30);
  eq(c.isConnected(), true);
});
atest('Gist supprimé sur GitHub : il est recréé automatiquement', async function () {
  const gh = fakeGitHub();
  const c = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  await c.connect(gh.token, ST.exportState(device('phone'), 1));
  delete gh.gists.g1;
  const st = device('phone'); G.addXp(st, 30, '2026-01-05');
  const r = await syncOnce(c, st);
  eq(r.pulled, false);
  eq(c.config.gistId, 'g2');
  eq(ST.importState(gh.gists.g2.files['english-pro-progression.json'].content).state.xp.total, 30);
});
atest('fichier trop gros pour l\'API : lu en entier par son adresse brute', async function () {
  const gh = fakeGitHub({ truncate: true });
  const c = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  const pc = device('pc'); G.addXp(pc, 25, '2026-01-05');
  await c.connect(gh.token, ST.exportState(pc, 1));
  const r = await syncOnce(c, device('phone'));
  eq(r.pulled, true); eq(G.totalXp(r.state), 25);
});
atest('sauvegarde en ligne illisible : erreur, la progression locale est intacte', async function () {
  const gh = fakeGitHub();
  const c = SY.createClient({ fetch: gh.fetch, storage: memStore() });
  await c.connect(gh.token, ST.exportState(device('phone'), 1));
  gh.gists.g1.files['english-pro-progression.json'].content = 'pas du json';
  await assert.rejects(syncOnce(c, device('phone')), function (e) { return e.code === 'remote'; });
});
atest('déconnexion : la clé est effacée de l\'appareil, la configuration survit à un redémarrage', async function () {
  const gh = fakeGitHub(); const store = memStore();
  const c = SY.createClient({ fetch: gh.fetch, storage: store });
  await c.connect(gh.token, '{}');
  eq(SY.createClient({ fetch: gh.fetch, storage: store }).isConnected(), true);
  c.disconnect();
  eq(store.d[SY.CONFIG_KEY], undefined);
  eq(SY.createClient({ fetch: gh.fetch, storage: store }).isConnected(), false);
});

/* ====================================================================== */
group('Rappel quotidien (.ics) et notifications');
test('fichier .ics : événement quotidien avec alarme, à l\'heure locale choisie', function () {
  const ics = R.buildICS({ time: '19:30', now: new Date(2026, 10, 16, 23, 23, 0), url: 'https://example.org/english-pro/' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261116T193000\r\n'), 'heure flottante locale');
  assert.ok(ics.includes('RRULE:FREQ=DAILY\r\n'));
  assert.ok(ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:PT0M') && ics.includes('END:VALARM'));
  assert.ok(ics.includes('URL:https://example.org/english-pro/'));
  eq((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  ics.split('\r\n').forEach(function (line) { assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'ligne trop longue : ' + line); });
  assert.ok(!/[^\r]\n/.test(ics), 'fins de ligne CRLF');
});
test('heure invalide refusée', function () {
  eq(R.buildICS({ time: '25:00' }), null);
  eq(R.buildICS({ time: 'abc' }), null);
  eq(R.parseTime('7:05').h, 7);
});
test('délai jusqu\'au prochain rappel et heure passée', function () {
  eq(R.msUntil('19:00', new Date(2026, 0, 1, 18, 0, 0)), 3600000);
  eq(R.msUntil('19:00', new Date(2026, 0, 1, 19, 0, 0)), 86400000);
  eq(R.msUntil('07:30', new Date(2026, 0, 1, 23, 30, 0)), 8 * 3600000);
  eq(R.isPast('19:00', new Date(2026, 0, 1, 19, 0, 0)), true);
  eq(R.isPast('19:00', new Date(2026, 0, 1, 18, 59, 0)), false);
});
test('notifications : indisponibles sans API (message de repli), y compris sur iPhone non installé', function () {
  const none = R.notificationSupport({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' } });
  eq(none.supported, false); assert.ok(none.reason.length > 0);
  const ios = R.notificationSupport({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
  eq(ios.supported, false); assert.ok(/écran d'accueil/.test(ios.reason));
  const ok = R.notificationSupport({ Notification: { permission: 'granted' }, navigator: {} });
  deq([ok.supported, ok.permission], [true, 'granted']);
  eq(R.notificationSupport(undefined).supported, false);
});

/* ====================================================================== */
group('Synthèse vocale : détection et repli');
test('API absente : indisponible, avec un message d\'explication', function () {
  const r = TTS.detect({});
  eq(r.available, false);
  assert.ok(/écoute/.test(r.reason));
  eq(TTS.detect(undefined).available, false);
  eq(TTS.detect({ speechSynthesis: {} }).available, false);          // pas de SpeechSynthesisUtterance
});
test('voix présentes mais aucune voix anglaise : indisponible', function () {
  const win = { SpeechSynthesisUtterance: function () {}, speechSynthesis: { getVoices: function () { return [{ lang: 'fr-FR' }, { lang: 'de-DE' }]; } } };
  const r = TTS.detect(win);
  eq(r.available, false);
  assert.ok(/voix anglaise/.test(r.reason));
});
test('voix anglaise présente, ou liste encore vide (chargement différé) : disponible', function () {
  const mk = function (voices) { return { SpeechSynthesisUtterance: function () {}, speechSynthesis: { getVoices: function () { return voices; } } }; };
  eq(TTS.detect(mk([{ lang: 'fr-FR' }, { lang: 'en_GB' }])).available, true);
  eq(TTS.detect(mk([])).available, true);
});
test('getVoices qui lève une erreur : pas de plantage', function () {
  const win = { SpeechSynthesisUtterance: function () {}, speechSynthesis: { getVoices: function () { throw new Error('boom'); } } };
  eq(TTS.detect(win).available, true);
});
test('choix de la voix : en-GB ou en-US selon le réglage, sinon une autre voix anglaise', function () {
  const voices = [{ lang: 'fr-FR', name: 'f' }, { lang: 'en-US', name: 'us' }, { lang: 'en-GB', name: 'gb1' }, { lang: 'en_GB', name: 'gb2', localService: true }];
  eq(TTS.pickVoice(voices, 'en-GB').name, 'gb2');
  eq(TTS.pickVoice(voices, 'en-US').name, 'us');
  eq(TTS.pickVoice([{ lang: 'en-AU', name: 'au' }], 'en-GB').name, 'au');
  eq(TTS.pickVoice([{ lang: 'fr-FR' }], 'en-GB'), null);
});
test('sans navigateur, speak() renvoie false sans erreur', function () {
  eq(TTS.speak('Hello', { lang: 'en-GB' }), false);
  TTS.stop();
});
test('sans synthèse vocale, les exercices d\'écoute sont exclus des sessions', function () {
  const available = allItems.filter(function (it) { return !C.needsAudio(it); });
  assert.ok(available.length < allItems.length);
  const s = S.buildSession({ items: available, cards: {}, today: '2026-01-10', size: 30, mode: 'daily', themeOrder: themes.map(function (t) { return t.id; }), hearts: 5, rng: rng() });
  assert.ok(s.entries.every(function (e) { return e.item.type !== 'dictation' && e.item.type !== 'listen'; }));
});

/* ====================================================================== */
group('Graphiques SVG');
test('courbe et barres générées à partir des données, sans valeur invalide', function () {
  allItems.filter(function (it) { return it.type === 'chart'; }).forEach(function (it) {
    const svg = CH.chartSVG(it.chart);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), it.id);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), it.id + ' contient une valeur invalide');
    assert.ok(svg.includes(it.chart.kind === 'bar' ? '<path' : '<polyline'), it.id);
    it.chart.labels.forEach(function (l) { assert.ok(svg.includes('>' + l + '<'), it.id + ' : étiquette ' + l); });
    assert.ok(/aria-label="/.test(svg), it.id);
  });
});
test('valeurs négatives, série unique à un point, caractères spéciaux', function () {
  const svg = CH.chartSVG({ kind: 'bar', title: 'P&L <test>', labels: ['A', 'B'], series: [{ values: [-5, 10] }] });
  assert.ok(!/NaN/.test(svg)); assert.ok(svg.includes('P&amp;L &lt;test&gt;'));
  assert.ok(!/NaN/.test(CH.chartSVG({ kind: 'line', labels: ['A', 'B'], series: [{ values: [0, 0] }] })));
  eq(CH.format(1500, {}), '1,500'); eq(CH.format(4.5, { prefix: '€', unit: 'm' }), '€4.5m');
});

/* ====================================================================== */
group('Contenu pédagogique');
test('8 thèmes, chacun avec identifiant, titre et description', function () {
  eq(themes.length, 8);
  themes.forEach(function (t) { assert.ok(t.id && t.title && t.description && t.icon, t.id); });
  eq(new Set(themes.map(function (t) { return t.id; })).size, 8);
});
test('au moins 50 items par thème et environ 400 au total', function () {
  themes.forEach(function (t) { assert.ok(t.items.length >= 50, t.id + ' : ' + t.items.length + ' items'); });
  assert.ok(allItems.length >= 400, allItems.length + ' items');
});
test('au moins 15 exercices de description de graphique', function () {
  const n = allItems.filter(function (it) { return it.type === 'chart'; }).length;
  assert.ok(n >= 15, n + ' graphiques');
});
test('identifiants uniques, thème cohérent avec le fichier', function () {
  const seen = {};
  themes.forEach(function (t) {
    t.items.forEach(function (it) {
      assert.ok(!seen[it.id], 'id en double : ' + it.id);
      seen[it.id] = 1;
      eq(it.theme, t.id, it.id + ' : thème');
    });
  });
});
test('chaque item est valide (champs requis selon son type)', function () {
  const problems = [];
  allItems.forEach(function (it) { const e = C.validateItem(it); if (e.length) problems.push(it.id + ' : ' + e.join(' ; ')); });
  deq(problems, []);
});
test('les 10 types d\'exercices sont représentés dans chaque thème (graphiques : thème dédié)', function () {
  themes.forEach(function (t) {
    const types = new Set(t.items.map(function (it) { return it.type; }));
    C.TYPES.filter(function (x) { return x !== 'chart'; }).forEach(function (type) { assert.ok(types.has(type), t.id + ' : type ' + type + ' absent'); });
  });
  assert.ok(allItems.some(function (it) { return it.type === 'fill' && it.bank; }));
  assert.ok(allItems.some(function (it) { return it.type === 'translate' && it.direction === 'en-fr'; }));
});
test('rappel actif : plus de la moitié des items de chaque thème demandent de produire la réponse', function () {
  themes.forEach(function (t) {
    const prod = t.items.filter(function (it) { return !C.isRecognition(it); }).length;
    assert.ok(prod / t.items.length > 0.5, t.id + ' : ' + Math.round(100 * prod / t.items.length) + ' % de production');
  });
});
test('chaque réponse acceptée est bien reconnue comme correcte par le correcteur', function () {
  const problems = [];
  allItems.forEach(function (it) {
    if (it.type === 'match' || C.hasChoices(it) || it.type === 'error') return;
    it.answers.forEach(function (a) {
      const r = GR.gradeText(a, it.answers, { reject: it.reject, looseArticles: it.type === 'translate' });
      if (r.result !== 'correct') problems.push(it.id + ' : « ' + a + ' » → ' + r.result);
    });
  });
  deq(problems, []);
});
test('les formes rejetées (reject) sont bien refusées', function () {
  allItems.filter(function (it) { return it.reject; }).forEach(function (it) {
    it.reject.forEach(function (r) {
      eq(GR.gradeText(r, it.answers, { reject: it.reject, looseArticles: it.type === 'translate' }).result, 'wrong', it.id + ' : ' + r);
    });
  });
});
test('QCM : une seule bonne réponse, aucun distracteur accepté par le correcteur', function () {
  const problems = [];
  allItems.filter(C.hasChoices).forEach(function (it) {
    if (it.type === 'order') return;
    it.distractors.forEach(function (d) {
      if (GR.gradeText(d, it.answers, {}).result === 'correct') problems.push(it.id + ' : ' + d);
    });
    if (it.distractors.length > 4) problems.push(it.id + ' : trop de propositions');
  });
  deq(problems, []);
});
test('phrases à trous : la phrase complète ne contient plus de trou ni de verbe entre parenthèses', function () {
  allItems.forEach(function (it) {
    const full = C.fullSentence(it);
    if (full == null) return;
    assert.ok(full.indexOf('___') === -1, it.id + ' : ' + full);
    if (it.type === 'conjugate') assert.ok(!/\((to |can|not)/.test(full), it.id + ' : ' + full);
  });
});
test('saisie libre : l\'indice ne donne pas la réponse', function () {
  allItems.filter(function (it) { return it.hint && !C.hasChoices(it); }).forEach(function (it) {
    const hintWords = GR.normalize(it.hint).split(' ');
    it.answers.forEach(function (a) {
      assert.ok(GR.normalize(it.hint) !== GR.normalize(a) && hintWords.indexOf(GR.normalize(a)) === -1, it.id + ' : l\'indice contient la réponse « ' + a + ' »');
    });
  });
});
test('remise en ordre : chaque variante acceptée utilise exactement les mêmes mots', function () {
  function bag(sentence) { return GR.normalize(sentence).split(' ').sort().join(' '); }
  allItems.filter(function (it) { return it.type === 'order'; }).forEach(function (it) {
    const tok = C.orderTokens(it);
    assert.ok(tok.words.length >= 4 && tok.words.length <= 12, it.id + ' : ' + tok.words.length + ' mots');
    eq(GR.gradeText(tok.words.join(' '), it.answers, { noTypo: true }).result, 'correct', it.id);
    it.answers.forEach(function (a) { eq(bag(a), bag(it.answers[0]), it.id + ' : « ' + a + ' »'); });
  });
});
test('repérer l\'erreur : un seul mot fautif, et la phrase corrigée diffère de la phrase fautive', function () {
  allItems.filter(function (it) { return it.type === 'error'; }).forEach(function (it) {
    const seg = C.errorSegments(it);
    assert.ok(seg.wrongIndex >= 0 && seg.segments.length >= 4, it.id);
    const wrongSentence = seg.segments.join(' ');
    assert.ok(GR.normalize(wrongSentence) !== GR.normalize(it.answers[0]), it.id + ' : la correction est identique');
    // tous les autres mots sont conservés dans la phrase corrigée
    const fixed = GR.normalize(it.answers[0]).split(' ');
    seg.segments.forEach(function (w, i) {
      if (i === seg.wrongIndex) return;
      GR.normalize(w).split(' ').forEach(function (part) { if (part) assert.ok(fixed.indexOf(part) !== -1, it.id + ' : « ' + w + ' » absent de la correction'); });
    });
  });
});
test('associer des paires : pas de doublon à gauche ni à droite', function () {
  allItems.filter(function (it) { return it.type === 'match'; }).forEach(function (it) {
    eq(new Set(it.pairs.map(function (p) { return p[0]; })).size, it.pairs.length, it.id);
    eq(new Set(it.pairs.map(function (p) { return p[1]; })).size, it.pairs.length, it.id);
  });
});
test('dictées : sans chiffres (évite « 30 » ou « thirty »), 4 à 12 mots', function () {
  allItems.filter(function (it) { return it.type === 'dictation'; }).forEach(function (it) {
    const text = it.audio || it.answers[0];
    assert.ok(!/\d/.test(text), it.id + ' contient un chiffre');
    const n = text.split(/\s+/).length;
    assert.ok(n >= 4 && n <= 12, it.id + ' : ' + n + ' mots');
  });
});
test('explication en français pour chaque item, consigne en français pour chaque type', function () {
  allItems.forEach(function (it) {
    assert.ok(it.explanation.length >= 15, it.id + ' : explication trop courte');
    assert.ok(C.instructionOf(it).length > 5, it.id + ' : consigne');
  });
});
test('flashcards : une large part du contenu a un recto et un verso', function () {
  const n = allItems.filter(function (it) { return C.flashcardOf(it); }).length;
  assert.ok(n >= 150, n + ' flashcards');
  themes.forEach(function (t) {
    assert.ok(t.items.filter(function (it) { return C.flashcardOf(it); }).length >= 5, t.id + ' : trop peu de flashcards');
  });
});
test('notes GB / US présentes là où l\'usage diffère', function () {
  const n = allItems.filter(function (it) { return it.note && /GB|US/.test(it.note); }).length;
  assert.ok(n >= 25, n + ' notes GB/US');
});
test('fichiers nécessaires au mode hors ligne tous présents (liste du service worker)', function () {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = /var CORE = \[([\s\S]*?)\];/.exec(sw)[1].match(/'[^']+'/g).map(function (s) { return s.slice(1, -1); });
  list.filter(function (f) { return f !== './'; }).forEach(function (f) { assert.ok(fs.existsSync(path.join(ROOT, f)), 'manquant : ' + f); });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  (html.match(/(?:src|href)="([^"#]+)"/g) || []).forEach(function (m) {
    const f = /"([^"]+)"/.exec(m)[1];
    if (/^https?:/.test(f)) return;
    assert.ok(fs.existsSync(path.join(ROOT, f)), 'référencé par index.html mais absent : ' + f);
    assert.ok(list.indexOf(f) !== -1, 'absent de la liste hors ligne : ' + f);
  });
  index.files.forEach(function (f) { assert.ok(fs.existsSync(path.join(ROOT, 'content', f)), f); });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  manifest.icons.forEach(function (i) { assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src); });
  eq(manifest.display, 'standalone');
});

/* ====================================================================== */
(async function finish() {
  for (const t of asyncTests) {
    if (t.group !== currentGroup) group(t.group);
    try { await t.fn(); passed++; console.log('  ✓ ' + t.name); }
    catch (err) { failed++; failures.push(t.group + ' › ' + t.name + '\n      ' + err.message); console.log('  ✗ ' + t.name + '\n      ' + err.message); }
  }
console.log('\n' + '─'.repeat(60));
console.log(passed + ' tests réussis, ' + failed + ' en échec');
console.log('Contenu : ' + allItems.length + ' items — ' + themes.map(function (t) { return t.id + ' ' + t.items.length; }).join(', '));
if (failed) {
  console.log('\nÉchecs :');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
})();
