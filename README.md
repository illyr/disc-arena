# Disc Arena

Un petit clone de **Ricochet** (le mod multijoueur de Valve sur le moteur de Half-Life, 2000) dans le navigateur, en Three.js :
des plateformes au-dessus du vide, des disques qui rebondissent sur le mur de l'arène pour pousser les autres dans le vide,
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
| Tremplin vert | propulse vers une autre plateforme |
| M ou 🔊 | couper le son |

Un arbitre très sérieux annonce à voix haute chaque mort, le début et la fin des parties (synthèse vocale du navigateur),
et les exploits : premier sang, doublé, triplé, massacre… Chaque victime d'affilée sans mourir rapporte 1 point de plus
(3 au plus), faire tomber le meneur, qui porte une couronne, 2 points de plus.

Un disque qui touche le long cou (ou la tête) décapite, même un disque simple : saute et lance aussitôt pour viser les cous.
Une partie se joue en chacun pour soi : une décapitation vaut 5 points, éjecter quelqu'un dans le vide 1 point
(tomber sans avoir été poussé ne rapporte rien). Le premier à 20 points gagne.
Avant chaque partie, une salle d'attente : on s'échauffe sans marquer, puis l'hôte clique « Lancer la partie »
(Échap pour l'afficher) ; on y revient 6 s après chaque victoire.
Chaque place a son look (couleur, motif, oreilles, nez, queue…), et la salle d'attente montre le portrait de chacun.
Chacun y arrive avec un pseudo tiré au hasard et son alias court, qui sert en partie (`src/pseudos.js`, avec les
phrases des morts), et peut le changer dans le champ « Ton pseudo » : le nom choisi sert alors aussi d'alias.
Pas de bots par défaut ; pour s'entraîner seul : `?bots=3` (jusqu'à 7).

## Code

- `src/rules.js` : les règles (mouvement, pads, disques, collisions), sans Three.js.
- `src/main.js` : le rendu, les bots, le joueur, le gore, les parties et le HUD.
- `test/rules.test.js` : `npm test` (node --test).

## Multijoueur

Le premier qui ouvre la page héberge une room : son code et le lien à partager s'affichent en bas à droite.
Les autres ouvrent ce lien (`…/?room=CODE`) et prennent une place libre, jusqu'à 8 joueurs ; quand ils partent, leur place se libère.

- Les navigateurs se parlent en pair-à-pair (WebRTC). Le serveur public PeerJS (0.peerjs.com) ne sert qu'à les présenter.
- L'hôte calcule les disques, les touches et les morts ; chaque joueur calcule ses propres déplacements et les envoie.
- Les autres joueurs doivent pouvoir charger la page : sur le même réseau, `http://<IP de la machine>:8000/?room=CODE` ;
  par Internet, il faut publier ces fichiers statiques (GitHub Pages, Cloudflare Pages…).
- Le ralenti des décapitations est réservé au jeu en solo.
