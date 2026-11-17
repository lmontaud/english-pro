"""English Pro — test de bout en bout dans un vrai navigateur (facultatif).

Prérequis : Python 3, Playwright (pip install playwright) et Chrome/Chromium.
Lancement :
    python3 -m http.server 8765          # dans le dossier du projet
    python3 tests/e2e.py                 # dans un autre terminal
Variables : EP_URL (adresse de l'app), EP_SHOTS (dossier de captures), EP_CHROME (chemin de Chrome).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get('EP_URL', 'http://localhost:8765/index.html')
SHOTS = os.environ.get('EP_SHOTS', '')
CHROME = os.environ.get('EP_CHROME', '/usr/bin/google-chrome')
DAY = 86400000

results = []
errors = []


def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else '   → ' + str(detail)))


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + '.png'))


# Répond à l'exercice affiché (correctement ou non), puis renvoie le type d'exercice.
ANSWER_JS = r"""
(correct) => {
  const main = document.getElementById('main');
  const item = EP.app.byId[main.dataset.item];
  const C = EP.content;
  const click = (el) => el.click();
  const type = item.type;
  const input = main.querySelector('.answer-input');
  if (type === 'match') {
    const cols = main.querySelectorAll('.pairs-col');
    const find = (col, text) => Array.from(col.querySelectorAll('button')).find(b => b.textContent.replace(/\u00A0/g, ' ') === text && !b.disabled);
    if (!correct) { click(find(cols[0], item.pairs[0][0])); click(find(cols[1], item.pairs[1][1])); }
    item.pairs.forEach(p => { click(find(cols[0], p[0])); click(find(cols[1], p[1])); });
    return type;
  }
  if (type === 'order') {
    const words = C.orderTokens(item).words.slice();
    if (!correct) words.reverse();
    words.forEach(w => click(Array.from(main.querySelectorAll('.order-pool .chip')).find(b => b.textContent === w)));
  } else if (type === 'error') {
    const seg = C.errorSegments(item);
    const idx = correct ? seg.wrongIndex : (seg.wrongIndex === 0 ? 1 : 0);
    click(main.querySelectorAll('.words .word')[idx]);
  } else if (input) {
    input.value = correct ? item.answers[0] : 'zzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const wanted = correct ? item.answers[0] : item.distractors[0];
    click(Array.from(main.querySelectorAll('.choice')).find(b => b.textContent.replace(/\u00A0/g, ' ') === wanted));
  }
  document.getElementById('check').click();
  return type;
}
"""


def answer(page, correct=True):
    t = page.evaluate(ANSWER_JS, correct)
    page.wait_for_selector('#continue', timeout=5000)
    return t


def play_session(page, correct=True, shots_prefix=None):
    """Joue la session en cours jusqu'à l'écran de fin. Renvoie les types rencontrés."""
    seen = []
    for _ in range(200):
        if page.query_selector('#summary-home'):
            break
        page.wait_for_selector('#check, #summary-home, .pairs', timeout=5000)
        if page.query_selector('#summary-home'):
            break
        t = answer(page, correct)
        if shots_prefix and t not in seen:
            shot(page, shots_prefix + '-' + t)
        seen.append(t)
        page.click('#continue')
    return seen


def state(page):
    return page.evaluate('JSON.parse(JSON.stringify(EP.app.state))')


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None, args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='fr-FR')
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

        print('\nDémarrage')
        page.goto(URL)
        page.wait_for_selector('#start-daily', timeout=10000)
        check('la page d\'accueil s\'affiche', page.inner_text('.brand') == 'English Pro')
        n_items = page.evaluate('EP.app.items.length')
        check('tout le contenu est chargé (%d items, 8 thèmes)' % n_items, n_items >= 400 and page.evaluate('EP.app.themes.length') == 8)
        check('8 thèmes listés avec leur pourcentage de maîtrise', len(page.query_selector_all('.theme-row')) == 8 and '0 %' in page.inner_text('.theme-list'))
        check('accueil : série, cœurs, objectif, révisions dues', page.inner_text('#streak-count') == '0' and page.inner_text('#hearts-count') == '5' and '0 / 100 XP' in page.inner_text('#goal-xp') and page.inner_text('#due-count') == '0')
        check('aucun débordement horizontal', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        shot(page, '01-accueil')

        print('\nSession du jour (toutes les réponses justes)')
        page.click('#start-daily')
        page.wait_for_selector('.session-body')
        size = page.evaluate('EP.app.session.queue.length')
        check('10 exercices pour l\'objectif de 5 minutes', size == 10, size)
        check('première session : uniquement du nouveau contenu', page.evaluate('EP.app.session.queue.every(e => e.isNew)'))
        types = play_session(page, True, '02-session')
        check('types d\'exercices mélangés (%s)' % ', '.join(sorted(set(types))), len(set(types)) >= 5)
        st = state(page)
        today = page.evaluate('EP.util.dayKey(new Date())')
        check('XP : 10 par bonne réponse + 10 de bonus', st['xp']['total'] == 110, st['xp'])
        check('objectif atteint : série à 1', st['streak']['count'] == 1 and st['streak']['last'] == today, st['streak'])
        check('10 fiches créées, dues demain', len(st['cards']) == 10 and all(c['step'] == 1 for c in st['cards'].values()))
        check('aucun cœur perdu', st['hearts']['count'] == 5)
        shot(page, '03-fin-de-session')
        page.click('#summary-home')
        page.wait_for_selector('#start-daily')
        check('retour à l\'accueil : série 1, objectif atteint', page.inner_text('#streak-count') == '1' and '110 / 100' in page.inner_text('#goal-xp'))

        print('\nChaque type d\'exercice (bonne puis mauvaise réponse)')
        page.evaluate("""() => {
          const pick = (pred) => EP.app.items.find(pred);
          const list = [
            pick(i => i.type === 'fill' && !i.bank), pick(i => i.type === 'fill' && i.bank), pick(i => i.type === 'conjugate'),
            pick(i => i.type === 'translate' && i.direction === 'fr-en'), pick(i => i.type === 'translate' && i.direction === 'en-fr' && !i.distractors),
            pick(i => i.type === 'mcq'), pick(i => i.type === 'order'), pick(i => i.type === 'match'),
            pick(i => i.type === 'chart' && i.distractors && i.chart.kind === 'line'), pick(i => i.type === 'chart' && !i.distractors),
            pick(i => i.type === 'chart' && i.chart.series.length === 2), pick(i => i.type === 'error'), pick(i => i.type === 'dictation'), pick(i => i.type === 'listen')
          ];
          window.__list = list.map(i => i.id);
          EP.app.state.cards = {};
          EP.app.session = { mode: 'daily', themeId: null, queue: list.map(item => ({ item, isNew: true, wasDue: true })), done: 0, first: { n: 0, ok: 0 }, xp: 0, heartsLost: 0, goalReached: false, freezeEarned: false, startedAt: Date.now() };
          EP.app.sub = 'session'; EP.app.render();
        }""")
        kinds = play_session(page, True, '04-type')
        check('les 14 variantes d\'exercices se jouent sans erreur', len(kinds) == 14, kinds)
        check('toutes corrigées comme justes', page.evaluate('Object.values(EP.app.state.cards).every(c => c.step === 1 && c.ko === 0)'))
        page.click('#summary-home')

        page.evaluate("""() => {
          const ids = window.__list.filter((id, i) => [0, 5, 6, 7, 11].includes(i));
          EP.app.state.cards = {}; EP.app.state.hearts = { count: 5, ts: null };
          EP.app.session = { mode: 'daily', themeId: null, queue: ids.map(id => ({ item: EP.app.byId[id], isNew: true, wasDue: true })), done: 0, first: { n: 0, ok: 0 }, xp: 0, heartsLost: 0, goalReached: false, freezeEarned: false, startedAt: Date.now() };
          EP.app.sub = 'session'; EP.app.render();
        }""")
        hearts = []
        for i in range(5):
            t = answer(page, False)
            hearts.append(page.evaluate('EP.app.state.hearts.count'))
            if i == 0:
                check('retour immédiat : bonne réponse et explication affichées', page.query_selector('.fb-wrong .fb-answer') and len(page.inner_text('.fb-explain')) > 15)
                shot(page, '05-erreur-' + t)
            page.click('#continue')
        check('un cœur perdu par erreur (saisie, QCM, ordre, paires, erreur)', hearts == [4, 3, 2, 1, 0], hearts)
        check('les exercices ratés reviennent en fin de session', page.evaluate('EP.app.session.queue.length') == 5 and page.evaluate('EP.app.session.queue.every(e => e.retry)'))
        check('une erreur ramène la fiche au début', page.evaluate('Object.values(EP.app.state.cards).every(c => c.step === 0 && c.ko === 1)'))
        play_session(page, True)
        page.click('#summary-home')
        page.wait_for_selector('.goal-card')
        check('0 cœur : les nouvelles leçons sont bloquées, les révisions restent proposées', not page.query_selector('#start-daily') and 'Réviser pour regagner un cœur' in page.inner_text('.goal-card'))
        shot(page, '06-zero-coeur')
        page.click('.goal-card .btn-primary')
        page.wait_for_selector('.session-body')
        check('à 0 cœur, la session ne contient que des révisions', page.evaluate('EP.app.session.mode') == 'training' and page.evaluate('EP.app.session.queue.every(e => !e.isNew)'))
        play_session(page, True)
        check('entraînement réussi : +1 cœur', page.evaluate('EP.app.state.hearts.count') == 1 and 'Entraînement réussi' in page.inner_text('.summary'))
        page.click('#summary-home')

        print('\nPresque juste, indice')
        page.evaluate("""() => {
          const it = EP.app.items.find(i => i.id === 'aud-004');
          delete EP.app.state.cards[it.id]; EP.app.state.hearts = { count: 5, ts: null };
          EP.app.session = { mode: 'daily', themeId: null, queue: [{ item: it, isNew: true, wasDue: true }], done: 0, first: { n: 0, ok: 0 }, xp: 0, heartsLost: 0, goalReached: false, freezeEarned: false, startedAt: Date.now() };
          EP.app.sub = 'session'; EP.app.render();
        }""")
        check('nouvel item : bouton d\'indice disponible', page.query_selector('.hint-btn') is not None)
        page.fill('.answer-input', 'sampel')
        page.click('#check')
        page.wait_for_selector('#continue')
        check('faute de frappe : « Presque ! », bonne orthographe affichée, pas de cœur perdu', page.inner_text('.fb-title').replace('\u00a0', ' ') == 'Presque !' and 'sample' in page.inner_text('.fb-answer') and page.evaluate('EP.app.state.hearts.count') == 5)
        check('« presque » : la fiche reste à la même étape', page.evaluate("EP.app.state.cards['aud-004'].step") == 0)
        shot(page, '07-presque')
        page.click('#continue')
        page.click('#summary-home')

        print('\nDates simulées : révisions dues, série, gel')
        page.evaluate('EP.app.state.cards = {}; EP.app.state.xp = { total: 0, days: {} }; EP.app.state.streak = { count: 0, best: 0, last: null, freezes: 0, frozen: [] }; EP.app.render()')
        page.click('#start-daily')
        play_session(page, True)
        page.click('#summary-home')
        page.evaluate('EP.clock.offset = %d; EP.app.render()' % DAY)
        check('le lendemain : 10 révisions dues affichées', page.inner_text('#due-count') == '10', page.inner_text('#due-count'))
        check('le lendemain matin, la série tient encore', page.inner_text('#streak-count') == '1')
        page.click('#start-daily')
        page.wait_for_selector('.session-body')
        mix = page.evaluate('({ due: EP.app.session.queue.filter(e => !e.isNew).length, fresh: EP.app.session.queue.filter(e => e.isNew).length })')
        check('session du lendemain : 60 % de révisions, 40 % de nouveautés', mix == {'due': 6, 'fresh': 4}, mix)
        play_session(page, True)
        page.click('#summary-home')
        check('deuxième jour : série à 2', page.evaluate('EP.app.state.streak.count') == 2)
        check('une révision réussie avance d\'une étape (prochaine dans 2 jours)', page.evaluate('Object.values(EP.app.state.cards).filter(c => c.step === 2).length') == 6)
        page.evaluate('EP.clock.offset = %d; EP.app.render()' % (3 * DAY))
        check('un jour manqué sans gel : la série retombe à 0, record conservé', page.inner_text('#streak-count') == '0' and page.evaluate('EP.app.state.streak.best') == 2)
        page.evaluate("""() => { const U = EP.util; const t = U.dayKey(new Date(Date.now() + EP.clock.offset));
          EP.app.state.streak = { count: 7, best: 7, last: U.addDays(t, -2), freezes: 1, frozen: [] }; EP.app.render(); }""")
        check('un jour manqué avec un gel : la série est protégée', page.inner_text('#streak-count') == '7' and page.evaluate('EP.app.state.streak.freezes') == 0)

        print('\nMes mots')
        page.click('.nav .tab:nth-child(2)')
        page.wait_for_selector('#word-form')
        page.click('#word-form button[type=submit]')
        check('champ obligatoire : message d\'erreur', 'terme anglais' in page.inner_text('.form-error'))
        page.fill('#word-en', 'write-off')
        page.fill('#word-fr', 'passage en perte')
        page.fill('#word-ex', 'The receivable was written off in March.')
        page.select_option('#word-theme', 'audit')
        page.click('#word-form button[type=submit]')
        page.wait_for_selector('.word-item')
        check('le mot apparaît dans la liste', 'write-off' in page.inner_text('.word-list') and 'à découvrir' in page.inner_text('.word-list'))
        wid = page.evaluate('EP.app.state.custom[0].id')
        check('il entre dans les items du thème choisi', page.evaluate("(id) => EP.app.byId[id].theme", wid) == 'audit')
        shot(page, '08-mes-mots')
        page.evaluate("""() => { EP.app.session = { mode: 'daily', themeId: null, queue: [{ item: EP.app.byId[EP.app.state.custom[0].id], isNew: true, wasDue: true }], done: 0, first: { n: 0, ok: 0 }, xp: 0, heartsLost: 0, goalReached: false, freezeEarned: false, startedAt: Date.now() }; EP.app.sub = 'session'; EP.app.render(); }""")
        page.fill('.answer-input', 'write off')
        page.click('#check')
        page.wait_for_selector('#continue')
        check('il se révise comme les autres (réponse corrigée, fiche créée)', page.inner_text('.fb-title') != 'Incorrect' and page.evaluate("(id) => EP.app.state.cards[id].step", wid) == 1)
        page.click('#continue')
        page.click('#summary-home')

        print('\nFlashcards')
        page.click('#start-flash')
        page.wait_for_selector('#flash-flip')
        shot(page, '09-flashcard-recto')
        page.click('#flash-flip')
        page.wait_for_selector('[data-grade=correct]')
        shot(page, '10-flashcard-verso')
        fid = page.evaluate('EP.app.flash.deck[0].id')
        before = page.evaluate("(id) => (EP.app.state.cards[id] || { seen: 0 }).seen", fid)
        page.click('[data-grade=correct]')
        check('« Je savais » met à jour la fiche de révision', page.evaluate("(id) => EP.app.state.cards[id].seen", fid) == before + 1)
        page.click('#flash-flip')
        fid2 = page.evaluate('EP.app.flash.deck[1].id')
        page.click('[data-grade=wrong]')
        check('« Raté » ramène la fiche au début', page.evaluate("(id) => EP.app.state.cards[id].step", fid2) == 0)
        page.click('.icon-btn')

        print('\nStatistiques et réglages')
        page.click('.nav .tab:nth-child(3)')
        page.wait_for_selector('.stat-grid')
        check('statistiques : série record, XP totale, tableau par thème, items ratés', 'série record' in page.inner_text('.stat-grid') and len(page.query_selector_all('.table tbody tr')) == 8 and page.query_selector('.missed li') is not None)
        shot(page, '11-stats')
        page.click('.nav .tab:nth-child(4)')
        page.wait_for_selector('#goal-seg')
        page.click('#goal-seg [data-value="15"]')
        check('objectif réglable : 15 minutes = 300 XP, sessions de 30', page.evaluate('EP.app.state.settings.goalMinutes') == 15 and '300 XP' in page.inner_text('#main'))
        page.click('#voice-seg [data-value="en-US"]')
        page.click('#rate-seg [data-value="0.75"]')
        check('voix et vitesse réglables', page.evaluate('EP.app.state.settings.voice') == 'en-US' and page.evaluate('EP.app.state.settings.rate') == 0.75)
        shot(page, '12-reglages')
        with page.expect_download() as dl:
            page.click('#ics-btn')
        ics = open(dl.value.path(), encoding='utf-8').read()
        check('le bouton .ics télécharge un rappel quotidien', dl.value.suggested_filename.endswith('.ics') and 'RRULE:FREQ=DAILY' in ics and 'BEGIN:VALARM' in ics)
        page.click('.modal .btn')

        print('\nExport / import')
        with page.expect_download() as dl:
            page.click('#export-btn')
        exported = open(dl.value.path(), encoding='utf-8').read()
        data = json.loads(exported)
        before = state(page)
        check('export : fichier JSON avec toute la progression', dl.value.suggested_filename.endswith('.json') and data['app'] == 'english-pro' and data['state']['custom'][0]['en'] == 'write-off' and len(data['state']['cards']) == len(before['cards']))
        page.click('#reset-btn')
        page.click('.modal .btn-danger')
        page.wait_for_selector('#start-daily')
        check('remise à zéro : plus aucune progression', page.evaluate('Object.keys(EP.app.state.cards).length') == 0 and page.evaluate('EP.app.state.custom.length') == 0)
        page.click('.nav .tab:nth-child(4)')
        page.set_input_files('#import-file', {'name': 'sauvegarde.json', 'mimeType': 'application/json', 'buffer': exported.encode('utf-8')})
        page.wait_for_selector('.modal .btn-primary')
        page.click('.modal .btn-primary')
        page.wait_for_selector('#start-daily, .goal-card')
        after = state(page)
        check('import : fiches, XP, série, réglages et mots personnels restaurés', after['cards'] == before['cards'] and page.evaluate('EP.game.totalXp(EP.app.state)') == before['xp']['total'] and after['streak'] == before['streak'] and after['custom'] == before['custom'] and after['settings'] == before['settings'])
        check('le mot personnel importé est de nouveau dans les items', page.evaluate("(id) => !!EP.app.byId[id]", wid))
        page.click('.nav .tab:nth-child(4)')
        page.click('#paste-btn')
        page.fill('#import-text', 'ceci n\'est pas une sauvegarde')
        page.click('.modal .btn-primary')
        page.wait_for_selector('.modal-title')
        check('import d\'un fichier invalide : message clair, rien n\'est écrasé', 'Import impossible' in page.inner_text('.modal-title') and state(page)['cards'] == before['cards'])
        page.click('.modal .btn')

        print('\nPersistance et hors ligne')
        page.evaluate('EP.clock.offset = 0')
        page.reload()
        page.wait_for_selector('#goal-seg')
        check('après rechargement, on retrouve le même onglet (Réglages)', page.evaluate('EP.app.tab') == 'reglages')
        page.click('.nav .tab:nth-child(1)')
        page.wait_for_selector('.goal-card')
        check('après rechargement, la progression est toujours là', page.evaluate('EP.game.totalXp(EP.app.state)') == before['xp']['total'] and len(state(page)['cards']) == len(before['cards']))
        sw_ok = page.evaluate("""async () => { if (!('serviceWorker' in navigator)) return false; const r = await navigator.serviceWorker.ready; return !!r.active; }""")
        check('service worker actif', sw_ok)
        page.wait_for_timeout(1500)
        cached = page.evaluate("""async () => { const c = await caches.open('english-pro-v2'); return (await c.keys()).length; }""")
        check('fichiers mis en cache pour le hors ligne (%d)' % cached, cached >= 30, cached)
        ctx.set_offline(True)
        page.goto(URL)
        page.wait_for_selector('.goal-card', timeout=10000)
        check('hors ligne : l\'app se recharge avec tout son contenu', page.evaluate('EP.app.items.length') >= 400, page.evaluate('({ n: EP.app.items.length, erreurs: EP.app.contentErrors })'))
        page.click('.theme-row')
        page.wait_for_selector('#start-theme')
        shot(page, '13-theme')
        page.click('#start-theme')
        page.wait_for_selector('#check, .pairs')
        answer(page, True)
        check('hors ligne : une leçon de thème se joue', page.query_selector('#continue') is not None)
        ctx.set_offline(False)

        print('\nSans synthèse vocale')
        ctx2 = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='block')
        ctx2.add_init_script('delete window.speechSynthesis; Object.defineProperty(window, "speechSynthesis", { value: undefined }); window.SpeechSynthesisUtterance = undefined;')
        p2 = ctx2.new_page()
        p2.on('pageerror', lambda e: errors.append('pageerror(no-tts): ' + str(e)))
        p2.goto(URL)
        p2.wait_for_selector('#start-daily')
        check('message expliquant que les exercices d\'écoute sont masqués', 'exercices d\'écoute sont masqués' in p2.inner_text('#main').replace('\u00a0', ' '))
        check('aucun exercice d\'écoute proposé', p2.evaluate("EP.app.availableItems().every(i => i.type !== 'dictation' && i.type !== 'listen')") and p2.evaluate('EP.app.availableItems().length < EP.app.items.length'))
        check('aucun bouton haut-parleur affiché', p2.evaluate("EP.ui.speakButton('Hello') === null"))
        shot(p2, '14-sans-synthese-vocale')
        p2.click('#start-daily')
        play_session(p2, True)
        check('une session complète se joue sans synthèse vocale', p2.query_selector('#summary-home') is not None)
        ctx2.close()

        print('\nSynchronisation entre deux appareils (GitHub simulé)')
        TOKEN = 'ghp_' + 'x' * 36
        gh = {'gists': {}, 'seq': 0}

        def github(route):
            req = route.request
            url = req.url.replace('https://api.github.com', '')
            if req.headers.get('authorization') != 'Bearer ' + TOKEN:
                return route.fulfill(status=401, json={'message': 'Bad credentials'})
            body = json.loads(req.post_data) if req.post_data else None
            if url == '/user':
                return route.fulfill(json={'login': 'lucas-montaud'})
            if url.startswith('/gists?'):
                return route.fulfill(json=list(gh['gists'].values()))
            if url == '/gists' and req.method == 'POST':
                gh['seq'] += 1
                gid = 'g%d' % gh['seq']
                gh['gists'][gid] = {'id': gid, 'public': body['public'], 'updated_at': '2026-11-17T10:00:00Z', 'files': body['files']}
                return route.fulfill(status=201, json=gh['gists'][gid])
            gid = url.split('/')[-1]
            if gid not in gh['gists']:
                return route.fulfill(status=404, json={'message': 'Not Found'})
            if req.method == 'PATCH':
                gh['gists'][gid]['files'] = body['files']
            return route.fulfill(json=gh['gists'][gid])

        def new_device(name):
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, service_workers='block')
            c.route('https://api.github.com/**', github)
            pg = c.new_page()
            pg.on('pageerror', lambda e: errors.append('pageerror(%s): %s' % (name, e)))
            pg.goto(URL)
            pg.wait_for_selector('#start-daily')
            return c, pg

        def connect(pg):
            pg.click('.nav .tab:nth-child(4)')
            pg.wait_for_selector('#sync-token')
            pg.fill('#sync-token', TOKEN)
            pg.click('#sync-connect')
            pg.wait_for_selector('#sync-now', timeout=8000)

        def total(pg):
            return pg.evaluate('EP.game.totalXp(EP.app.state)')

        cA, phone = new_device('téléphone')
        phone.click('#start-daily'); play_session(phone, True); phone.click('#summary-home')
        phone.click('.nav .tab:nth-child(2)'); phone.fill('#word-en', 'write-off'); phone.fill('#word-fr', 'passage en perte'); phone.click('#word-form button[type=submit]'); phone.wait_for_selector('.word-item')
        phone.click('.nav .tab:nth-child(4)')
        phone.wait_for_selector('#sync-token')
        phone.fill('#sync-token', 'pas une clé')
        phone.click('#sync-connect')
        phone.wait_for_selector('#sync-card .form-error:not([hidden])')
        check('clé mal collée : message clair', 'ghp_' in phone.inner_text('#sync-card .form-error'))
        shot(phone, '17-synchro-connexion')
        connect(phone)
        check('téléphone connecté : Gist privé créé avec la progression', len(gh['gists']) == 1 and gh['gists']['g1']['public'] is False and 'write-off' in gh['gists']['g1']['files']['english-pro-progression.json']['content'])
        check('la clé n\'est jamais envoyée dans la progression', TOKEN not in gh['gists']['g1']['files']['english-pro-progression.json']['content'])
        shot(phone, '18-synchro-connecte')

        cB, pc = new_device('ordinateur')
        pc.click('#start-daily'); play_session(pc, True); pc.click('#summary-home')
        check('avant synchronisation, chaque appareil a sa propre progression', total(phone) == 110 and total(pc) == 110)
        ids = lambda pg: set(pg.evaluate('Object.keys(EP.app.state.cards)'))
        union = ids(phone) | ids(pc)
        connect(pc)
        pc.wait_for_function('EP.game.totalXp(EP.app.state) === 220', timeout=8000)
        check('l\'ordinateur retrouve le Gist du téléphone (pas de second Gist)', len(gh['gists']) == 1)
        check('ordinateur : XP additionnée (110 + 110), fiches et mot perso du téléphone récupérés',
              total(pc) == 220 and ids(pc) == union and pc.evaluate("EP.app.state.custom.some(w => w.en === 'write-off')"))
        phone.click('#sync-now')
        phone.wait_for_function('EP.game.totalXp(EP.app.state) === 220', timeout=8000)
        check('« Synchroniser maintenant » sur le téléphone : tout est à jour', ids(phone) == union and phone.evaluate("EP.app.state.custom.length") == 1)
        phone.click('.nav .tab:nth-child(1)')
        phone.click('#start-daily'); play_session(phone, True); phone.click('#summary-home')
        phone.wait_for_timeout(5000)  # synchronisation automatique après la session
        pc.evaluate('EP.app.runSync(false)')
        pc.wait_for_function('EP.game.totalXp(EP.app.state) > 220', timeout=8000)
        check('après une session sur le téléphone, l\'ordinateur la récupère automatiquement', total(pc) == total(phone) and total(pc) > 220, (total(pc), total(phone)))
        pc.click('.nav .tab:nth-child(1)')
        check('la page d\'accueil de l\'ordinateur affiche l\'XP totale', pc.inner_text('#xp-total') == str(total(pc)))
        for _ in range(3):
            pc.evaluate('EP.app.runSync(false)'); pc.wait_for_timeout(300)
        check('synchroniser plusieurs fois ne compte rien en double', total(pc) == total(phone))
        cA.close(); cB.close()

        print('\nÉcran étroit (320 px) et mode sombre')
        ctx3 = browser.new_context(viewport={'width': 320, 'height': 568}, is_mobile=True, color_scheme='dark', service_workers='block')
        p3 = ctx3.new_page()
        p3.on('pageerror', lambda e: errors.append('pageerror(320): ' + str(e)))
        p3.goto(URL)
        p3.wait_for_selector('#start-daily')
        check('accueil sans débordement à 320 px', p3.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        shot(p3, '15-sombre-accueil')
        p3.click('#start-daily')
        p3.wait_for_selector('#check, .pairs')
        overflow = False
        for _ in range(10):
            if p3.query_selector('#summary-home'):
                break
            overflow = overflow or not p3.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            answer(p3, True)
            p3.click('#continue')
        check('exercices sans débordement à 320 px', not overflow)
        shot(p3, '16-sombre-fin')
        ctx3.close()

        check('aucune erreur JavaScript dans la console', not errors, errors[:5])
        browser.close()

    ok = sum(1 for _, c in results if c)
    print('\n' + '─' * 60)
    print('%d vérifications réussies, %d en échec' % (ok, len(results) - ok))
    return 0 if ok == len(results) else 1


if __name__ == '__main__':
    sys.exit(run())
