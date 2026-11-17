# English Pro

Application mobile (PWA) pour apprendre l'anglais professionnel de la finance : réunions, e-mails, contrôle de gestion, audit financier, description de chiffres, présentation de résultats, faux amis, grammaire en contexte.

- 510 exercices répartis en 8 thèmes, dont 18 descriptions de graphiques.
- Fonctionne hors ligne une fois installée. Aucun compte, aucun serveur : tout reste sur votre téléphone.
- Interface en français, exercices en anglais, aucun micro.

## 1. Tester tout de suite, sans rien installer

Double-cliquez sur **`apercu.html`**. C'est l'application complète dans un seul fichier : elle s'ouvre dans votre navigateur, sur ordinateur comme sur téléphone.

Ce fichier sert à essayer. Pour l'utiliser au quotidien sur votre téléphone (icône sur l'écran d'accueil, mode hors ligne), il faut la mettre en ligne : c'est l'étape suivante, gratuite, et elle prend dix minutes.

> Ouvrir `index.html` par double-clic ne fonctionne pas : les navigateurs interdisent à une page ouverte depuis un dossier de lire les fichiers de contenu. Utilisez `apercu.html`, ou mettez l'app en ligne.

## 2. Mettre l'application en ligne gratuitement

Deux solutions. Netlify est la plus simple ; GitHub Pages est la plus pratique si vous comptez modifier souvent le contenu.

### Option A — Netlify (glisser-déposer)

1. Décompressez le fichier `.zip`. Vous obtenez un dossier `english-pro`.
2. Créez un compte gratuit sur [netlify.com](https://www.netlify.com) (sans compte, le site est supprimé au bout d'une heure).
3. Ouvrez [app.netlify.com/drop](https://app.netlify.com/drop) et glissez le dossier `english-pro` dans la zone de dépôt.
4. Netlify affiche une adresse qui se termine par `netlify.app`. C'est l'adresse de votre application.

Pour mettre à jour plus tard (nouveau contenu, par exemple) : dans votre projet Netlify, onglet **Deploys**, glissez de nouveau le dossier modifié.

### Option B — GitHub Pages

1. Créez un compte gratuit sur [github.com](https://github.com).
2. En haut à droite : **+** puis **New repository**. Donnez un nom (par exemple `english-pro`), laissez **Public**, validez.
3. Sur la page du dépôt : **uploading an existing file**, puis glissez **le contenu** du dossier `english-pro` (pas le dossier lui-même : `index.html` doit se trouver à la racine). Cliquez sur **Commit changes**.
4. **Settings** → **Pages** → sous « Build and deployment », Source : **Deploy from a branch** ; Branch : **main** et **/ (root)** → **Save**.
5. Après quelques minutes (jusqu'à dix), l'application est en ligne à l'adresse `https://votre-identifiant.github.io/english-pro/`.

Pour mettre à jour : ouvrez le fichier dans GitHub, cliquez sur le crayon, modifiez, puis **Commit changes**.

Documentation officielle : [Netlify Drop](https://docs.netlify.com/start/get-started-with-drop/), [GitHub Pages](https://docs.github.com/en/pages/quickstart).

## 3. Installer l'application sur le téléphone

Ouvrez l'adresse de votre application sur le téléphone, puis :

- **iPhone** : ouvrez-la dans **Safari**, touchez le bouton **Partager** (carré avec une flèche), puis **Sur l'écran d'accueil**.
- **Android** : ouvrez-la dans **Chrome**, menu **⋮**, puis **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

Lancez ensuite l'app depuis son icône. Après ce premier lancement avec du réseau, elle fonctionne hors ligne.

**À savoir sur iPhone** : l'app installée sur l'écran d'accueil a sa propre mémoire, séparée de Safari. Installez-la avant de commencer, puis connectez-la à la synchronisation (section 4).

## 4. Même progression sur le téléphone et l'ordinateur

La synchronisation est gratuite : votre progression est rangée dans un **Gist privé** (un petit fichier) de votre compte GitHub. Elle ne fonctionne que sur l'app en ligne (section 2), pas dans `apercu.html`.

**Une seule fois, créer la clé GitHub :**

1. Sur github.com, connecté : photo de profil → **Settings** → tout en bas à gauche **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**. Note : `English Pro`. Expiration : **No expiration** (ou un an).
3. Cochez **uniquement** la case **gist**, puis **Generate token** en bas de la page.
4. Copiez la clé (elle commence par `ghp_`) et gardez-la dans une note : GitHub ne l'affichera plus.

**Sur chaque appareil** (téléphone, puis ordinateur) : **Réglages → Synchronisation entre appareils**, collez la clé, **Connecter cet appareil**.

Ensuite, tout est automatique : l'app synchronise à l'ouverture, après chaque session, quand vous la quittez, et au retour du réseau. Le bouton **Synchroniser maintenant** force une synchronisation.

Comment les deux progressions sont fusionnées :

- **Révisions** : pour chaque exercice, la réponse la plus récente l'emporte, quel que soit l'appareil.
- **XP** : celle des deux appareils s'additionne, sans jamais être comptée deux fois. L'objectif du jour et la série tiennent compte des deux.
- **Mes mots** : réunis ; un mot supprimé sur un appareil l'est aussi sur l'autre.
- **Réglages et cœurs** : propres à chaque appareil (voix, objectif, rappel).

Sécurité : la clé reste sur l'appareil, n'est jamais incluse dans les exports et, avec la seule permission « gist », ne donne accès à rien d'autre sur votre compte. Si vous la perdez ou pensez qu'elle a fuité, supprimez-la sur GitHub (même page) et créez-en une nouvelle.

## 5. Sauvegarde manuelle (export / import)

Utile si vous n'utilisez pas la synchronisation, ou comme sécurité supplémentaire. La progression est enregistrée dans la mémoire du navigateur : elle disparaît si vous effacez les données de navigation ou désinstallez l'app.

Dans **Réglages → Sauvegarde de ma progression** :

- **Exporter ma progression** télécharge un fichier `english-pro-progression-AAAA-MM-JJ.json`.
- **Importer un fichier de sauvegarde** restaure tout : fiches de révision, XP, série, réglages, mots personnels.
- **Copier / Coller une sauvegarde** fait la même chose par le presse-papiers, quand le téléchargement est bloqué.

## 6. Le rappel quotidien : ce qui marche vraiment

Une application web sans serveur ne peut pas envoyer de notification quand elle est fermée. C'est vrai sur Android et encore plus sur iPhone, où les notifications web n'existent que pour une app installée sur l'écran d'accueil (iOS 16.4 ou plus récent) et supposent un serveur d'envoi. Voici donc ce qui est proposé :

| Moyen | Fiabilité | Comment |
|---|---|---|
| **Rappel dans le calendrier (.ics)** | Fiable, même app fermée | Réglages → choisissez l'heure → « Créer le rappel dans mon calendrier ». Ouvrez le fichier téléchargé : le téléphone crée un événement quotidien avec alerte. |
| Bandeau dans l'app | Fiable, mais seulement à l'ouverture | Passé l'heure du rappel, l'accueil signale que la session du jour reste à faire. |
| Notification de l'app | Appoint | Ne s'affiche que si l'app est ouverte ou encore en arrière-plan à l'heure dite. |

Pour supprimer le rappel du calendrier, supprimez l'événement « English Pro : session du jour » (toutes les occurrences).

## 7. Comment l'application vous fait apprendre

| Principe | Mise en œuvre |
|---|---|
| **Répétition espacée** | Chaque exercice a sa fiche. Une bonne réponse la fait avancer d'une étape : elle revient après 1, 2, 4, 7, 15, 30 puis 60 jours. Une erreur la ramène au début. Une réponse « presque juste » (faute de frappe) la laisse à la même étape. Code : `js/core/srs.js`. |
| **Récupération active** | Dans chaque thème, plus de la moitié des exercices demandent de produire la réponse (saisie, conjugaison, traduction, dictée, remise en ordre). Dans une session, les exercices « à choix » ne dépassent pas 40 % des nouveautés. |
| **Entrelacement** | Une session mélange les thèmes et les types d'exercices, évite deux exercices du même type à la suite, et inclut les révisions dues de tous les thèmes, même dans une leçon de thème. Code : `js/core/session.js`. |
| **Feedback immédiat** | Après chaque réponse : la bonne réponse, la phrase complète (avec audio) et une explication courte en français (règle, registre, faux ami, note GB / US). |
| **Sessions courtes** | Objectif de 5, 10 ou 15 minutes, soit 10, 20 ou 30 exercices. |
| **Apprentissage en contexte** | Le vocabulaire est toujours dans une phrase professionnelle : mail de relance à un client audité, commentaire d'écart, point d'avancement de mission. Les flashcards affichent aussi la phrase d'exemple. |

Une session quotidienne contient environ 60 % de révisions dues et 40 % de nouveautés. Sans révision due, elle ne contient que du nouveau. Un exercice raté revient en fin de session.

### Règles du jeu

- **Cœurs** : 5 au maximum, un de moins par erreur. Un cœur revient toutes les 30 minutes, ou en réussissant un **Entraînement** (révisions seules, au moins 80 % de bonnes réponses du premier coup, sans perte de cœur). À 0 cœur, les nouveautés sont en pause et les révisions restent ouvertes.
- **XP** : 10 par bonne réponse, 8 pour un « presque », 6 pour un exercice réussi au second passage, 10 de bonus en fin de session, 3 par flashcard sue.
- **Objectif quotidien** : 5 / 10 / 15 minutes, soit 100 / 200 / 300 XP.
- **Série** : nombre de jours consécutifs où l'objectif est atteint. Tous les 7 jours de série, vous gagnez un **gel** (2 au maximum) qui protège la série pour un jour manqué.
- **Maîtrise d'un thème** : moyenne de l'avancement des fiches ; une fiche compte pour 100 % à partir de l'étape 5 (cinq rappels réussis d'affilée, soit environ deux semaines). « Appris » : réussi au moins une fois depuis la dernière erreur.

## 8. Ajouter ou modifier du contenu

Tout le contenu est dans le dossier `content/`, un fichier par thème, modifiable avec n'importe quel éditeur de texte. Aucune ligne de code à toucher.

Chaque exercice est un bloc entre accolades. Champs communs :

| Champ | Rôle |
|---|---|
| `id` | Identifiant unique (ex. `aud-063`). Ne le changez jamais ensuite : la progression y est attachée. |
| `theme` | Identifiant du thème (le même que celui du fichier). |
| `type` | Type d'exercice (voir ci-dessous). |
| `answers` | Réponses acceptées. La première est celle qui est affichée comme correction. |
| `explanation` | Explication en français affichée après la réponse. |
| `note` | Facultatif : précision GB / US. |
| `term` + `fr` | Facultatif : l'expression à retenir et sa traduction. Crée une flashcard et l'indice « Je ne connais pas encore ». |
| `reject` | Facultatif : formes à refuser explicitement (ex. `"informations"`). |

Un exemple par type :

```json
{"id": "aud-063", "theme": "audit", "type": "fill", "prompt": "We sent the ___ letters to the banks.", "hint": "confirmation", "answers": ["confirmation"], "explanation": "…"}

{"id": "aud-064", "theme": "audit", "type": "fill", "bank": true, "prompt": "The stock was ___ at year end.", "answers": ["counted"], "distractors": ["count", "counting"], "explanation": "…"}

{"id": "aud-065", "theme": "audit", "type": "conjugate", "prompt": "The team ___ (to finish) the testing yesterday.", "answers": ["finished"], "explanation": "…"}

{"id": "aud-066", "theme": "audit", "type": "translate", "direction": "fr-en", "prompt": "un relevé bancaire", "answers": ["a bank statement"], "explanation": "…", "term": "a bank statement", "fr": "un relevé bancaire"}

{"id": "aud-067", "theme": "audit", "type": "mcq", "prompt": "Question en français ou phrase avec ___", "answers": ["bonne réponse"], "distractors": ["fausse 1", "fausse 2", "fausse 3"], "explanation": "…"}

{"id": "aud-068", "theme": "audit", "type": "order", "prompt": "Traduction française (aide)", "answers": ["We need the signed contract today."], "explanation": "…"}

{"id": "aud-069", "theme": "audit", "type": "match", "pairs": [["ledger", "grand livre"], ["invoice", "facture"], ["receipt", "reçu"]], "explanation": "…"}

{"id": "aud-070", "theme": "audit", "type": "error", "prompt": "We received many [informations] from the client.", "answers": ["We received a lot of information from the client."], "explanation": "…"}

{"id": "aud-071", "theme": "audit", "type": "dictation", "answers": ["The audit starts on Monday."], "explanation": "…"}

{"id": "aud-072", "theme": "audit", "type": "listen", "audio": "Phrase lue en anglais.", "prompt": "Question en français ?", "answers": ["Bonne réponse"], "distractors": ["Fausse 1", "Fausse 2"], "explanation": "…"}

{"id": "cht-119", "theme": "charts", "type": "chart", "chart": {"kind": "line", "title": "Sales (€m)", "prefix": "€", "unit": "m", "labels": ["Q1", "Q2", "Q3"], "series": [{"values": [10, 12, 15]}]}, "answers": ["Sales rose steadily."], "distractors": ["Sales fell.", "Sales levelled off."], "explanation": "…"}
```

Règles à respecter :

- **`fill` et `conjugate`** : le trou s'écrit avec trois tirets bas `___`. Sans `"bank": true`, un `hint` (indice) est obligatoire.
- **`translate`** : `direction` vaut `fr-en` ou `en-fr`. Listez dans `answers` toutes les traductions que vous accepteriez.
- **`error`** : le mot fautif est entre crochets, un seul mot, une seule erreur ; `answers` contient la phrase corrigée.
- **`chart`** : `kind` vaut `line` ou `bar` ; chaque série a autant de valeurs qu'il y a d'étiquettes ; deux séries au maximum (donnez-leur un `name`). Avec `distractors`, c'est un choix ; sinon, mettez un `prompt` avec `___` et un `hint`.
- Les blocs sont séparés par une virgule, sauf après le dernier.

Inutile de prévoir les variantes de majuscules, de ponctuation, de contractions (`don't` / `do not`) ou d'orthographe GB / US courante (`favourable` / `favorable`, `centre` / `center`, `-ise` / `-ize`) : le correcteur les traite comme équivalentes.

**Ajouter un thème** : créez `content/mon-theme.json` sur le modèle d'un fichier existant (avec `id`, `title`, `icon`, `description`, `items`), puis ajoutez son nom dans `content/index.json`.

**Vérifier votre fichier** : collez-le dans un validateur JSON en ligne, ou, si Node.js est installé, lancez `node tests/run-tests.js` : le test signale l'identifiant et le problème de chaque exercice invalide. Un exercice invalide est simplement ignoré par l'app, sans la bloquer.

**Publier la modification** : remettez les fichiers en ligne (section 2). Sur le téléphone, la nouveauté apparaît au deuxième lancement de l'app après la mise en ligne (le premier télécharge la mise à jour en arrière-plan).

Si vous utilisez `apercu.html`, régénérez-le après une modification : `node tools/build-preview.js`.

Dans l'app, l'onglet **Mes mots** permet aussi d'ajouter un terme en dix secondes, sans toucher aux fichiers.

## 9. Tests

- **Logique et contenu** — `node tests/run-tests.js` (Node 18 ou plus récent, aucune dépendance) : 122 tests sur la répétition espacée, les cœurs, la série avec dates simulées, le correcteur de réponses, la composition des sessions, l'export / import, l'ajout d'un mot, la fusion entre appareils et les échanges avec GitHub (simulés), le fichier .ics, la détection de la synthèse vocale, et la validité de chacun des 510 exercices.
- **Bout en bout** (facultatif) — `tests/e2e.py` pilote l'app dans Chrome avec Playwright : 70 vérifications, dont le mode hors ligne et une synchronisation entre deux appareils. Mode d'emploi en tête du fichier.

## 10. Organisation des fichiers

```
index.html              page de l'application
apercu.html             l'application en un seul fichier (essai rapide)
manifest.webmanifest    nom, icônes et couleurs de l'app installée
sw.js                   service worker : mode hors ligne
css/style.css           mise en forme
content/                le contenu pédagogique, un fichier JSON par thème
icons/                  icônes
js/core/                logique pure, testée : srs (répétition espacée), grading (correction),
                        game (cœurs, XP, série), session, store (sauvegarde), merge (fusion
                        entre appareils), reminder (.ics), content (modèle des exercices),
                        chart (graphiques SVG), util
js/                     interface : app (écrans), exercises (exercices), tts (voix),
                        sync (échanges avec GitHub), ui
tests/                  tests automatisés
tools/build-preview.js  régénère apercu.html
DECISIONS.md            choix faits pendant la construction
```

## 11. Limites connues

- La voix dépend de celles installées sur le téléphone. Si aucune voix anglaise n'est disponible, les exercices d'écoute sont masqués et l'app l'indique. Si l'accent ne correspond pas au réglage, ajoutez la voix dans les réglages du téléphone (iPhone : Réglages → Accessibilité → Contenu énoncé → Voix).
- La synchronisation demande un compte GitHub (gratuit) et l'app en ligne. Si les deux appareils sont utilisés hors ligne en même temps, tout est fusionné au retour du réseau, sans perte.
- Pas de notification fiable app fermée (voir section 5).
