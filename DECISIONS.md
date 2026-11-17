# Décisions prises pendant la construction

Aucune question n'a été posée : chaque point ambigu a été tranché ici. Tout est modifiable ; le fichier concerné est indiqué entre parenthèses.

## Méthode d'apprentissage

1. **Algorithme : Leitner à 7 étapes** plutôt que SM-2 (`js/core/srs.js`). Intervalles 1, 2, 4, 7, 15, 30, 60 jours, exactement ceux demandés ; plus lisible et plus facile à tester qu'un facteur de facilité par item.
2. **« Presque juste » sur un item jamais vu** : il reste à l'étape 0 et revient le lendemain (la règle « même étape » n'a pas d'intervalle à l'étape 0).
3. **Bonne réponse sur un item pas encore dû** (entraînement libre, flashcards en avance) : ni l'étape ni la date ne changent. On ne gagne pas d'étape en bachotant ; une erreur, elle, ramène toujours au début.
4. **Exercice raté** : il revient une fois en fin de session. Ce second passage rapporte 6 XP s'il est réussi mais ne modifie plus la fiche (déjà ramenée au début) et ne coûte pas de second cœur.
5. **Indice « Je ne connais pas encore »** : proposé sur un nouvel item à saisie libre qui a une expression associée. S'en servir compte comme « presque » : pas de cœur perdu, item revu le lendemain. Sans cela, tout nouveau mot serait une erreur garantie.
6. **Part de rappel actif** : au plus 40 % d'exercices « à choix » (QCM, paires, écoute à choix, repérage d'erreur, banque de mots) parmi les nouveautés d'une session (`js/core/session.js`).
7. **Rotation des types** : les fichiers de contenu sont rangés par type ; les nouveautés d'un thème sont donc tirées en faisant tourner les types, avec un point de départ qui dépend du thème et du nombre d'items déjà vus.
8. **Rien à réviser et plus rien de nouveau** : la session devient un entraînement libre sur les items déjà vus, sans effet sur leur calendrier.
9. **Maîtrise d'un thème** : moyenne de (étape ÷ 5), plafonnée à 100 % par item. « Appris » : étape ≥ 1.

## Gamification

10. **Objectif en minutes converti en XP** : 5 / 10 / 15 min = 100 / 200 / 300 XP et sessions de 10 / 20 / 30 exercices. L'objectif est validé à l'XP, pas au chronomètre : on ne « gagne » pas en laissant l'app ouverte.
11. **Barème d'XP** : 10 (juste), 8 (presque), 6 (réussi au second passage), 10 de bonus de fin de session, 3 par flashcard sue (`js/core/game.js`).
12. **Entraînement** : 10 items déjà vus, les plus en retard d'abord ; les erreurs n'y coûtent pas de cœur ; +1 cœur si au moins 80 % de réussite du premier coup.
13. **Plus de cœurs en cours de session** : les nouveautés restantes sont retirées, la session se termine sur les révisions.
14. **Gel de série** : un gel gagné tous les 7 jours de série, 2 en réserve au maximum, consommé automatiquement. Deux jours manqués demandent deux gels ; s'il n'y en a pas assez, la série retombe à 0 et les gels restants sont conservés.
15. **Changer d'objectif dans la journée** : si l'XP du jour suffit pour le nouvel objectif, le jour est validé aussitôt.

## Technique

16. **Stockage : localStorage** plutôt qu'IndexedDB (`js/core/store.js`). L'état complet pèse quelques dizaines de Ko ; une seule clé, lecture synchrone, export trivial. Si le stockage est refusé (navigation privée, page intégrée), l'app continue en mémoire et l'affiche.
17. **Service worker « cache d'abord, mise à jour en arrière-plan »** (`sw.js`). Aucune version à incrémenter quand on modifie le contenu ; contrepartie : une modification n'apparaît qu'au deuxième lancement.
18. **Rappel quotidien** : fichier `.ics` (événement quotidien, alarme, heure locale « flottante ») comme solution fiable ; bandeau à l'ouverture de l'app ; notification locale d'appoint, uniquement quand l'app est ouverte ou en arrière-plan récent. Pas de notifications push : elles exigent un serveur.
19. **Réglage « Exercices d'écoute : masqués »** ajouté, pour les moments sans écouteurs. Non demandé, mais nécessaire pour utiliser l'app « n'importe où ».
20. **Aucune dépendance** : ni npm ni pip. Tests de logique avec Node seul. Le test de bout en bout utilise Playwright et Chrome, déjà présents dans l'environnement de construction ; il est facultatif.
21. **Polices du système uniquement** (aucun téléchargement, compatible hors ligne). L'interface est en sans-serif, tout ce qui est en anglais en serif, pour distinguer d'un coup d'œil consigne et langue étudiée. Thème sombre automatique.
22. **`apercu.html`** : version en un seul fichier, générée par `tools/build-preview.js`, pour essayer par double-clic et pour la page de prévisualisation. `index.html` ne s'ouvre pas par double-clic (lecture de fichiers locaux interdite par les navigateurs).
23. **Page de prévisualisation** : c'est `apercu.html` publié tel quel. Dans ce contexte, pas de service worker, les téléchargements sont bloqués (le copier-coller de la sauvegarde les remplace) et la progression peut ne pas être conservée. Les fonctions propres à la plateforme de prévisualisation (stockage, voix, téléchargement) n'ont pas été utilisées, pour que la prévisualisation exécute exactement le même code que l'app déployée.

## Correction des réponses (`js/core/grading.js`)

24. **Faute de frappe = « Presque ! »** : distance de 1 (une lettre ajoutée, oubliée, remplacée ou deux lettres inversées) sur un mot d'au moins 5 lettres, une faute pour 6 mots au maximum.
25. **Exceptions volontaires** : un pluriel ou une terminaison verbale en trop ou en moins (`informations`, `increases` pour `increased`) et les paires de mots proches (`advice` / `advise`, `affect` / `effect`, `sensible` / `sensitive`…) sont comptés faux, parce que ce sont justement les erreurs à corriger. Plus strict que la règle demandée, mais pédagogiquement nécessaire.
26. **Équivalences** : casse, ponctuation, accents, traits d'union, contractions (y compris sans apostrophe), orthographes GB / US courantes, `%` / `percent` / `per cent`.
27. **Traductions** : l'article ou le « to » initial est facultatif (`deadline` accepté pour `a deadline`). Les formes listées dans `reject` sont toujours refusées.

## Contenu

28. **510 exercices** au lieu de 400 : 54 à 78 par thème, dont 18 graphiques. Orthographe britannique par défaut, avec une note quand l'usage américain diffère (32 notes).
29. **Dictées sans chiffres** : la voix lirait « 30 » et l'on pourrait écrire « thirty ». Les nombres sont travaillés dans les exercices d'écoute à choix.
30. **Terminologie** : vocabulaire IFRS pour l'anglais (`revenue`, `impairment`, `provision`, `accrual`) et termes français usuels du PCG et de l'audit légal (charge à payer, dépréciation, amortissement, lettre d'affirmation, seuil de signification).
31. **« Mes mots »** : chaque mot devient un exercice de traduction français → anglais à saisie libre et une flashcard, rattaché au thème choisi ou à « Sans thème ».
32. **Repérer l'erreur** : on touche le mot fautif ; la phrase corrigée s'affiche ensuite. Un seul mot fautif par phrase, pour qu'il n'y ait qu'une bonne réponse.

## Synchronisation entre appareils (ajoutée le 17/11)

33. **Gist GitHub privé** plutôt que Firebase ou Supabase : gratuit, aucun service à configurer, et le compte GitHub sert déjà à héberger l'app. L'API GitHub accepte les appels depuis une page web (CORS).
34. **Clé « classic » avec la seule permission « gist »** : la plus simple à créer et la plus limitée. Elle est stockée à part (`english-pro-sync-v1`), jamais dans la progression ni dans les exports.
35. **Fusion sans perte** (`js/core/merge.js`) : fiche la plus récente (heure exacte de la réponse) ; XP comptée par appareil (identifiant aléatoire) puis additionnée, avec un maximum par jour pour ne jamais compter deux fois ; mots perso réunis, suppressions propagées ; série la plus récente, record le plus haut ; réglages et cœurs non synchronisés.
36. **Quand synchroniser** : à l'ouverture, 4 secondes après une sauvegarde, au passage en arrière-plan, au retour du réseau, et sur demande. Jamais pendant un exercice : la synchronisation attend la fin de la session.
37. **Import d'une sauvegarde d'un autre appareil** : son XP est rangée sous l'identifiant de cet autre appareil, pour rester compatible avec la synchronisation.
38. **Remise à zéro** : déconnecte aussi l'appareil de la synchronisation, sinon la progression en ligne reviendrait aussitôt.
39. Les identifiants des mots perso contiennent maintenant celui de l'appareil (`custom-ab12cd34-1`), pour que deux mots créés sur deux appareils ne se confondent pas. Les anciens identifiants restent valables.

## Ce qui n'a pas pu être testé

- Le son réel de la synthèse vocale et la qualité des voix (pas de sortie audio dans l'environnement). La détection et le repli sont testés.
- Les notifications réelles et l'ouverture du fichier `.ics` dans le calendrier d'un téléphone. Le contenu du fichier est testé.
- L'installation sur un vrai iPhone et un vrai Android. Testé : Chrome en émulation mobile (390 px et 320 px), mode hors ligne compris.
- Safari. Le code n'utilise que des fonctions standard anciennes, mais aucun test n'a tourné sur ce navigateur.
- La synchronisation avec le vrai GitHub : testée contre une API simulée, aux formats de réponse de GitHub, dans les tests Node et dans Chrome avec deux appareils.
- La page de prévisualisation telle qu'elle s'affiche dans Claude. `apercu.html` a été testé dans un cadre isolé qui reproduit ses restrictions.
