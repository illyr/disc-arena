# Disc Arena

Un petit clone de **Ricochet** (le mod multijoueur de Valve sur le moteur de Half-Life, 2000) dans le navigateur, en Three.js :
des plateformes sur trois étages au-dessus du vide, des disques qui rebondissent sur le mur de l'arène pour pousser les autres dans le vide,
et un décapiteur.

## Lancer

```sh
npm start          # ou : python3 -m http.server 8000
```

puis ouvrir http://localhost:8000. Three.js vient du CDN jsDelivr : il faut Internet, rien à installer.

## Jouer

| Touche | Action |
|---|---|
| ZQSD / WASD | bouger |
| Espace | sauter : par-dessus un disque, ou pour lancer à hauteur de cou |
| Clic gauche | disque : pousse la cible, rebondit 3 fois puis revient |
| Clic droit | décapiteur : prend les 3 disques, tue d'un coup |
| Tremplin vert | propulse vers une autre plateforme, et seul moyen de monter d'un étage ; on redescend en sautant dans le vide vers la plateforme d'en dessous |
| Mur à liseré rose | abri : arrête les joueurs et renvoie les disques lancés à plat ; on saute par-dessus, et un disque lancé en sautant passe au-dessus |
| M ou 🔊 | couper le son |

Un arbitre très sérieux annonce à voix haute chaque mort, le début et la fin des parties (synthèse vocale du navigateur),
et un annonceur à la Unreal Tournament, voix grave et caverneuse avec de l'écho (enregistrée dans `sounds/`), crie les exploits :
« Premier sang ! », « En pleine tête ! » (« Chasseur de têtes ! » à la 3e décapitation), puis « Doublé ! », « Triplé ! », « Série meurtrière ! »…
jusqu'à « Appelez une ambulance ! » (les frags de bonus s'affichent mais ne sont pas dits). Chaque victime d'affilée sans mourir rapporte 1 frag de plus
(3 au plus), faire tomber le premier, qui porte une couronne, 2 frags de plus (« Détrôné ! »), chaque rebond du disque avant la touche 1 frag de plus
(3 au plus, « Par la bande ! »). Un disque qui traverse deux joueurs ou plus fait une « Brochette ! ». Le public est partisan : il hue le premier quand il marque
et acclame le dernier qui en élimine un (« Remontada ! »). À 18 frags, « Un frag pour la gloire ! » : la foule gronde et le joueur est cerclé de rouge sur le radar.
Chacun entend « Tu as pris la tête ! » ou « Tu as perdu la tête ! » quand il passe premier ou ne l'est plus.
Chaque exploit s'affiche 2 s au milieu de l'écran, avec la carte du joueur.

Le disque part où l'on vise, vers le haut comme vers le bas, et rebondit sur le dessus et le dessous des plateformes.
Le radar, en bas à droite, tourne avec le joueur
(devant = en haut) : les plateformes au liseré de leur étage, les autres joueurs à leur couleur avec leur alias, plus petits à l'étage du dessous,
cerclés de blanc à celui du dessus, d'or pour le premier.
Sur une des tours du dernier étage, un booster doré, signalé par une colonne de lumière et une ★ sur le radar :
qui le prend lance des disques XXL, 10 fois plus larges, pendant 60 s (perdu à la mort) ; il revient 30 s plus tard sur une tour au hasard. On ne réapparaît jamais sur une tour.
Au pied de chaque tremplin qui monte du sol, à côté de l'abri, un malus violet (✖ sur le radar) : qui passe dessus devient
4 fois plus grand pendant 10 s, donc facile à toucher, même depuis l'étage du dessus ; il revient 20 s plus tard.
Toutes les 10 s, un objet apparaît sur une plateforme (2 au plus) : 🎯 disques têtus, à tête chercheuse (15 s), ⚡ mode berserk (10 s, jusqu'à 8 disques en vol),
🛡️ ceinture-bouclier (30 s, arrête un disque) ou 🧊 mutateur Patinoire (malus, 10 s).
Toutes les 15 s, une plateforme clignote en rouge 3 s puis disparaît 6 s : ceux qui sont dessus tombent.
La tête d'un décapité se shoote en marchant dessus ; dans le vide : « Et c'est le buuut ! ».
Tué par un autre joueur, on revoit sa mort par ses yeux (« Killcam »).

Un disque qui touche le long cou (ou la tête) décapite, même un disque simple : saute et lance aussitôt pour viser les cous.
Une partie se joue en chacun pour soi : une décapitation vaut 5 frags, éjecter quelqu'un dans le vide 1 frag
(tomber tout seul en partie coûte 1 frag). Le premier à 20 frags gagne.
Avant chaque partie, l'échauffement : on joue sans marquer, puis l'hôte clique « Au combat ! », et après « 3, 2, 1, Fraggez ! » les frags comptent
(Échap pour l'afficher) ; on y revient 6 s après chaque victoire.
Autour de l'arène, des gradins pleins de spectateurs, qui sautent à chaque mort, et applaudissent et crient à chaque décapitation
(son synthétisé dans le navigateur, coupé avec le reste par M).
Chaque place a son look (couleur, motif, oreilles, nez, queue…), et la salle d'attente montre le portrait de chacun.
Chacun y arrive avec un pseudo tiré au hasard et son alias court, qui sert en partie (`src/pseudos.js`, avec les
phrases des morts), et peut le changer dans le champ « Ton pseudo » : le nom choisi sert alors aussi d'alias.
Pas de bots par défaut ; pour s'entraîner seul : `?bots=3` (jusqu'à 7).

## Code

- `src/rules.js` : les règles (mouvement, tremplins, murs, disques, collisions), sans Three.js.
- `src/main.js` : le rendu, les bots, le joueur, le gore, les parties et le HUD.
- `test/` : `npm test` (node --test).
- `sounds/` : les cris de l'annonceur, enregistrés par `node scripts/make-cries.mjs` (macOS : `say`, voix Thomas, et ffmpeg) ;
  un cri ajouté à `CRIES` (`src/pseudos.js`) demande de relancer le script.

## Multijoueur

Le premier qui ouvre la page héberge une room : son code et le lien à partager s'affichent en bas à droite.
Les autres ouvrent ce lien (`…/?room=CODE`) et prennent une place libre, jusqu'à 8 joueurs ; quand ils partent, leur place se libère.

- Les navigateurs se parlent en pair-à-pair (WebRTC). Le serveur public PeerJS (0.peerjs.com) ne sert qu'à les présenter.
- L'hôte calcule les disques, les touches et les morts ; chaque joueur calcule ses propres déplacements et les envoie.
- Les autres joueurs doivent pouvoir charger la page : sur le même réseau, `http://<IP de la machine>:8000/?room=CODE` ;
  par Internet, il faut publier ces fichiers statiques (GitHub Pages, Cloudflare Pages…).
- Le ralenti des décapitations est réservé au jeu en solo.
