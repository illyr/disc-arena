# Disc Arena

Un petit clone de **Ricochet** (le mod multijoueur de Valve sur le moteur de Half-Life, 2000) dans le navigateur, en Three.js :
des plateformes sur trois étages au-dessus d'une mer de lave, sous un ciel étoilé, des disques qui rebondissent sur le mur de l'arène
pour pousser les autres dans la lave, et un décapiteur. Chaque plateforme est une place de village pavée (la plus grande fait 20 pas de large),
avec ses lampadaires, ses bancs, ses buissons, ses rochers et ses sapins (pour le décor seulement : ils n'arrêtent ni les joueurs ni les disques).

## Lancer

```sh
npm start          # ou : python3 -m http.server 8000
```

puis ouvrir http://localhost:8000. Three.js vient du CDN jsDelivr : il faut Internet, rien à installer.

## Jouer

| Touche | Action |
|---|---|
| ZQSD / WASD | bouger |
| Espace | sauter : par-dessus un disque |
| Clic gauche | disque : pousse la cible, rebondit 3 fois puis revient ; il vole vers ce qui est sous la croix du viseur ; à côté des disques, en bas à gauche, le temps avant le retour du prochain |
| Clic droit | décapiteur : prend les 3 disques, tue d'un coup, sauf dans les jambes, où il en coupe une |
| Tremplin vert | propulse vers une plateforme voisine, vers le haut comme vers le bas : chaque plateforme en a un vers chacune de ses voisines, et la place centrale un de plus vers chaque plateforme de l'étage |
| Façade de maison à liseré rose | abri : arrête les joueurs et renvoie les disques ; trop haute pour sauter par-dessus, seul un disque lancé de l'étage du dessus passe au-dessus |
| Molette | recule la vue derrière soi, à la 3e personne, jusqu'à voir la moitié de l'arène ; à fond vers l'avant, on revient dans ses yeux |
| T | narguer : la girafe sautille, se dandine et fait tourner sa tête, sur un « nananère » |
| 1 à 5 | boutique : dépenser ses disques d'or contre les autres (voir plus bas) |
| M ou 🔊 | couper le son (la musique aussi) |

Une commentatrice à la voix suave et langoureuse annonce à voix haute les morts qui valent un exploit, le début et la fin des parties (enregistrée dans `sounds/voice/`, la même pour tous ;
un pseudo tapé à la main, que personne n'a enregistré, est lu par la synthèse vocale du navigateur) ;
quand elle s'est tue 30 à 45 s, elle glisse une remarque : sur une plateforme qui clignote, le calme, le sang, une tête qui traîne, ou sur rien du tout (`ASIDES`, `src/pseudos.js`),
et un annonceur à la Unreal Tournament, voix grave et caverneuse avec de l'écho (enregistrée dans `sounds/`), crie les exploits :
« Premier sang ! », « En pleine tête ! » (« Chasseur de têtes ! » à la 3e décapitation), puis « Doublé ! », « Triplé ! », « Série meurtrière ! »…
jusqu'à « Appelez une ambulance ! ». Le duo se répond : quand elle parle sans qu'il ait d'exploit à crier, il lui renvoie un mot de guerrier (« Carnage ! », « Gloire ! », « Bien parlé ! »… : `RETORTS`, `src/pseudos.js`) (les frags de bonus s'affichent mais ne sont pas dits). Chaque victime d'affilée sans mourir rapporte 1 frag de plus
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
qui le prend a le « Big Fat Disc ! » : 12 disques au lieu de 3, pendant 60 s (perdu à la mort ; à la fin, on retombe à 3) ; il revient 30 s plus tard sur une tour au hasard. On ne réapparaît jamais sur une tour.
Autour du milieu de chaque plateforme du sol, deux malus, le mutateur Mastodonte (🐘, aussi sur le radar) : le milieu, où l'on atterrit, reste libre, mais pour gagner un tremplin ou un ferry il faut les esquiver ; qui passe dessus devient
4 fois plus grand pendant 10 s (sa vue monte d'autant, en douceur), donc facile à toucher, même depuis l'étage du dessus ; de si haut, viser juste est dur : hors d'un joueur sous le viseur, ses disques partent à plat, il suffit de se tourner vers sa cible ; il revient 20 s plus tard.
Toutes les 10 s, un objet apparaît sur une plateforme (2 au plus) : 🎯 disques têtus, à tête chercheuse (15 s), ⚡ mode berserk (10 s, jusqu'à 8 disques en vol),
🛡️ ceinture-bouclier (30 s, arrête un disque) ou 🧊 mutateur Patinoire (malus, 10 s).
Toutes les 15 s, une plateforme clignote en rouge 3 s puis disparaît 6 s : ceux qui sont dessus tombent, et les tremplins qui y mènent s'éteignent jusqu'à son retour.
La tête d'un décapité se shoote en marchant dessus ; dans la lave : « Et c'est le buuut ! ».
Tué par un autre joueur, on revoit sa mort par ses yeux (« Killcam »).
Le sang reste au sol, et là où il fait une flaque, on glisse comme sur la Patinoire.
Sur l'écran, chaque autre joueur a son alias à sa couleur (👑 devant celui du leader), de taille fixe, avec une flèche sur sa tête, visible même derrière un mur ;
hors de l'écran ou derrière soi, l'alias se colle au bord, la flèche tournée vers lui.
Pour jouer sans le son, ce qui t'arrive s'affiche sur une carte en bas de l'écran, 3 s, avec son effet : un bonus ou un malus ramassé (ou la patate chaude reçue), une jambe perdue, le bouclier usé, la fin d'un bonus, et « Pris en cible » quand un disque têtu te suit, avec le nom de son lanceur.

L'arène fait 1,5 fois la taille d'origine. Des bacs font la navette entre les plateformes du sol, et des champignons décorent l'arène (on passe au travers, comme les arbres).
Sur la place centrale, quatre tunnels en croix : à l'intérieur, on disparaît du radar des autres et le toit, transparent pour qui est dessous, arrête les disques venus d'en haut.
Chaque victime allonge le cou du tueur d'un cran (4 au plus, « Cou de girafe ! ») : sa vue monte en douceur avec, mais sa tête dépasse, au point d'être décapitée d'un disque lancé à plat de l'étage du dessus.
Toutes les 2 min, « La lave monte ! » : une carte au milieu de l'écran compte les secondes (25 environ) avant qu'elle recouvre le rez-de-chaussée,
et les tremplins du sol qui montent, les sorties de secours, clignotent (la place centrale a les siens, un vers chaque plateforme de l'étage) ;
elle monte vite des profondeurs, lentement par-dessus les bords, reste 15 s, puis redescend ; les bots fuient vers les étages.
Toutes les 90 s, une averse de 20 s rend tout glissant ; un tremplin, lui, pose toujours net à l'arrivée, même sous la pluie ou en Patinoire.
Deux disques qui se croisent se parent (« Parade ! ») et repartent chacun chez leur lanceur.
💣 La patate chaude (15 s) : la toucher à quelqu'un d'un disque la lui refile ; qui la garde jusqu'au bout explose (« Boum ! »), et le frag va à qui la lui a refilée.
Quand le public hue le premier, il le bombarde aussi de tomates (si c'est toi, ton écran se tache de rouge).
Mort, on revient 2,5 s plus tard.
Une musique de fond, synthétisée dans le navigateur, tourne pendant le jeu.

Un disque qui touche le long cou (ou la tête) décapite, même un disque simple : vise bien, le cou est plus fin que le corps.
Les joueurs sont des girafes : deux longues jambes, faciles à viser, sous un corps à l'horizontale et un long cou. Un disque simple qui touche bas, dans les jambes (vise vers le bas, ou touche un joueur en plein saut),
coupe une jambe au lieu de pousser, façon Chevalier noir des Monty Python : « C'est juste une égratignure ! ». La jambe s'envole comme une tête, et se shoote pareil.
La première jambe perdue ralentit et fait pencher ; sur celle qui reste, on avance à cloche-pied en sautillant (« boing » à chaque saut) et en sautant moins haut ;
sans jambes (« Match nul ! ») on rampe, enfoncé jusqu'au torse, encore plus lentement, sans sauter, jusqu'à la mort. Couper une jambe ne rapporte rien,
mais qui la coupe touche le frag si la victime tombe ensuite.
Une partie se joue en chacun pour soi : une décapitation vaut 5 frags, éjecter quelqu'un dans la lave 1 frag
(tomber tout seul en partie coûte 1 frag, et seul ce suicide vaut un « Humiliation ! » ; la lave qui monte, une plateforme qui disparaît ou la patate chaude ne coûtent rien). Chaque frag rapporte un disque d'or 📀 : le premier à 20 📀 en poche gagne. En haut à droite, une carte par joueur, le leader en haut, avec la tête de son perso et une jauge qui se remplit jusqu'à 20, les 📀 en petit à côté.
Ces 📀 se dépensent, aux touches 1 à 5, à embêter les autres, au prix de s'éloigner de la victoire : 🦵 Croche-patte (5, une jambe en moins à tous), 🦒 Grand cou (2, le cou au maximum pour tous),
💣 Patate (3, la patate chaude au meilleur des autres), 🍅 Tomates (3, la foule l'aveugle 5 s), 🙃 Commandes inversées (5, 8 s, pour les joueurs ; les bots, qui ne lisent pas le clavier, y échappent).
La boutique, en bas à gauche, grise ce qu'on ne peut pas s'offrir ; elle ouvre 30 s après « Fraggez ! », puis ferme 20 s après chaque achat, pour toute l'arène. Chaque achat s'affiche en carte au milieu de l'écran, sans être lu ; les bots n'achètent rien.
Avant chaque partie, l'échauffement : on joue sans marquer, puis l'hôte clique « Au combat ! » : tout le monde reste figé le temps que la commentatrice présente le tournoi (11 s, sous-titrée), puis après « 3, 2, 1, Fraggez ! » on bouge et les frags comptent ; l'arène se calme pour l'occasion : pas de plateforme qui disparaît ni d'averse les 30 premières secondes, et la lave attend 2 min
(Échap pour l'afficher). À la victoire, le jeu s'arrête sur le résumé du match : le portrait du vainqueur, le classement (frags, victimes, têtes, jambes coupées, morts,
meilleure série) et les faits marquants, chacun avec le portrait de son joueur (premier sang, coupeur de têtes, bûcheron, souffre-douleur, kamikaze…), avec en fond, au ralenti, l'action du match (la mort la plus spectaculaire, rejouée en boucle, la caméra tournant autour de la victime), qui reste affiché jusqu'à un clic, qui ramène dans la room (le jeu, lui, repasse à l'échauffement 15 s plus tard).
Autour de l'arène, des gradins pleins de spectateurs, qui sautent à chaque mort, et applaudissent et crient à chaque décapitation
(une vraie foule enregistrée dans `sounds/`, coupée avec le reste par M).
Chaque disque lancé siffle (le décapiteur plus grave, avec le tintement d'une lame), une décapitation ou une jambe coupée fait un bruit mouillé et gargouillant,
et chaque pas couine comme une chaussure de clown (avec un « plop » de temps en temps), synthétisés dans le navigateur, et d'autant plus faibles qu'ils sont loin.
Les simples éjections et les bonus ramassés
s'affichent sans être lus ni acclamés : l'humour est gardé pour les exploits.
Chaque place a son look (couleur, motif, oreilles, nez, queue…), et la salle d'attente montre le portrait de chacun.
Chacun y arrive avec un pseudo tiré au hasard et son alias court, qui sert en partie (`src/pseudos.js`, avec les
phrases des morts), et peut le changer dans le champ « Ton pseudo » : le nom choisi sert alors aussi d'alias.
Pas de bots par défaut ; pour s'entraîner seul : `?bots=3` (jusqu'à 7).

## Code

- `src/rules.js` : les règles (mouvement, tremplins, murs, disques, collisions), sans Three.js.
- `src/main.js` : le rendu, les bots, le joueur, le gore, les parties et le HUD.
- `test/` : `npm test` (node --test).
- `sounds/` : les cris de l'annonceur, enregistrés par `node scripts/make-cries.mjs` (macOS : `say`, voix Thomas, et ffmpeg) ;
  un cri ajouté à `CRIES` (`src/pseudos.js`) demande de relancer le script, qui peut n'enregistrer que lui : `node scripts/make-cries.mjs "Big Fat Disc !"`.
- `sounds/voice/` : la commentatrice, générée par ElevenLabs avec `node scripts/make-voice.mjs` (la clé dans `ELEVENLABS_API_KEY`
  ou `~/.config/elevenlabs/api-key`) : `design` propose 3 voix d'après une description, `keep <id>` en garde une, puis le script enregistre
  chaque ligne découpée autour des noms, et chaque alias, avec la voix Lily et le modèle v3, dans le ton écrit entre crochets en tête de ligne
  (`[laughs]`, `[whispers]`…, caché dans le fil) ; une ligne ajoutée au code demande de le relancer, il n'enregistre que ce qui manque,
  et pas plus de caractères que le nombre donné (`node scripts/make-voice.mjs 2000`).
- `sounds/crowd-*.mp3` : la foule, CC0, coupée à 4 s et 3,5 s : [Crowd Cheer](https://freesound.org/s/397434/) de FoolBoyMedia
  et [crowd booing](https://freesound.org/s/264378/) de HowardV, sur Freesound.

## Multijoueur

Le premier qui ouvre la page héberge une room : son code et le lien à partager s'affichent en bas à droite.
Les autres ouvrent ce lien (`…/?room=CODE`) et prennent une place libre, jusqu'à 8 joueurs ; quand ils partent, leur place se libère.

- Les navigateurs se parlent en pair-à-pair (WebRTC). Le serveur public PeerJS (0.peerjs.com) ne sert qu'à les présenter.
- L'hôte calcule les disques, les touches et les morts ; chaque joueur calcule ses propres déplacements et les envoie.
- Les autres joueurs doivent pouvoir charger la page : sur le même réseau, `http://<IP de la machine>:8000/?room=CODE` ;
  par Internet, il faut publier ces fichiers statiques (GitHub Pages, Cloudflare Pages…).
- Le ralenti des décapitations est réservé au jeu en solo.
