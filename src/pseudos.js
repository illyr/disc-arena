// The names of the slots, the host's and the bots'.
export const NAMES = ["Joueur 1", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];

// The names a player gets on arriving, before choosing one: animals, and things that fly round.
// The alias, two syllables at most, is what the game calls them by in the heat of the match.
export const PSEUDOS = [
  { name: "Cochon d'Inde à l'anneau pour les gouverner tous", alias: "Coco" },
  { name: "Hérisson du Seigneur des Anneaux", alias: "Riri" },
  { name: "Frelon Frisbee", alias: "Fifi" },
  { name: "Loutre lanceuse de soucoupes", alias: "Loulou" },
  { name: "Taupe à la soucoupe volante", alias: "Toto" },
  { name: "Escargot en orbite", alias: "Cargo" },
  { name: "Mante religieuse du disque rayé", alias: "Nonne" },
  { name: "Ornithorynque du cercle de feu", alias: "Nini" },
  { name: "Pingouin aux anneaux olympiques", alias: "Pinpin" },
  { name: "Bousier qui roule sa galette", alias: "Boubou" },
  { name: "Lama du 33 tours", alias: "Lala" },
  { name: "Coccinelle de l'anneau unique", alias: "Cocci" },
  { name: "Raton laveur du donut", alias: "Donut" },
  { name: "Paresseux au cerceau", alias: "Pépère" },
  { name: "Hamster dans sa roue", alias: "Roro" },
  { name: "Chouette du CD rayé", alias: "Chouchou" },
  { name: "Moustique au disque d'or", alias: "Zizou" },
  { name: "Capybara de la galette des rois", alias: "Capy" },
  { name: "Scarabée aux anneaux de Saturne", alias: "Scara" },
  { name: "Gerbille du Frisbee perdu", alias: "Gégé" },
  { name: "Blaireau du disque dur", alias: "Blaireau" },
  { name: "Écureuil à la pizza volante", alias: "Pizza" },
  { name: "Libellule de l'auréole", alias: "Lili" },
  { name: "Koala au bagel", alias: "Bagel" },
  { name: "Grenouille du ricochet", alias: "Rico" },
  { name: "Pigeon d'argile en cavale", alias: "Pipou" },
  { name: "Lombric du rond-point", alias: "Lolo" },
  { name: "Poulpe aux huit frisbees", alias: "Poulpy" },
  { name: "Panda du disque de jade", alias: "Panpan" },
  { name: "Fourmi du disque de frein", alias: "Mimi" },
  { name: "Crabe de la soucoupe", alias: "Crabos" },
  { name: "Wombat du hula hoop", alias: "Hula" },
  { name: "Tatou qui se met en rond", alias: "Tatou" },
  { name: "Cafard du vinyle", alias: "Cafou" },
  { name: "Phoque à la bouée", alias: "Phopho" },
  { name: "Bourdon du disque solaire", alias: "Bzzz" },
  { name: "Sauterelle du cerceau magique", alias: "Hophop" },
  { name: "Ver luisant du disco", alias: "Disco" },
  { name: "Mouette au frisbee volé", alias: "Mouette" },
  { name: "Chèvre au camembert volant", alias: "Biquette" },
  { name: "Chenille de la crêpe volante", alias: "Crêpe" },
  { name: "Sanglier du frisbee-golf", alias: "Gruik" },
];

// What the feed says of a death, {K} the killer and {V} the victim, by their aliases. The commentator
// reads them in the tone between brackets, which the feed does not show.
export const DECAP_LINES = [
  "[gasps] Oh ! {V} n'a plus toute sa tête… merci {K} !",
  "[excited] Quel geste de {K} ! {V} a gardé son corps… mais pas sa tête !",
  "[amused] {V} avait la tête sur les épaules… avait ! Bien joué, {K} !",
  "[seductive] {K} a fait perdre la tête à {V}… sans même l'inviter à dîner.",
  "[excited] Whaou ! {V} a perdu la tête, c'était beau à voir ! Bravo {K} !",
  "[gasps] Oh là là ! {V} perd la tête face à {K}… littéralement !",
  "[excited] Et {K} dévisse la tête de {V}, sans tournevis ! Quelle technique !",
  "[amused] Regardez-moi ça… {K} a transformé {V} en fontaine. Elle est jolie, la fontaine.",
  "[excited] Coupe très courte pour {V}, au ras des épaules ! Signé {K} !",
  "[curious] {V} cherche encore sa tête… {K}, lui, sait où elle est.",
  "[excited] Et {K} débouche {V}, comme un vieux cidre ! Santé !",
  "[amused] {K} décoiffe {V}… et la tête part avec !",
  "[excited] Décapsulé ! {K} décapsule {V}… c'est pétillant !",
  "[amused] {V} a enfin le cou dégagé… merci qui ? Merci {K} !",
  "[gasps] {V} perd le fil… et le cou avec ! Énorme, {K} !",
  "[excited] Et la tête de {V} part en orbite ! Le reste a refusé de suivre. Superbe, {K} !",
  "[amused] {K} transforme {V} en porte-manteau… il ne manque plus que le chapeau.",
];
export const PUSH_LINES = [
  "[excited] Oh ! {V} prend l'ascenseur… sans ascenseur ! Merci {K} !",
  "[excited] {K} envoie {V} vérifier la lave… verdict : elle est chaude !",
  "[amused] Petit bain chaud pour {V}, offert par {K}… très chaud.",
  "[excited] Et {K} fait fondre {V}, comme une raclette ! Qui a le pain ?",
  "[amused] {V} découvre que la lave ne rebondit pas… Belle leçon de {K} !",
  "[sarcastic] {V} quitte la conversation… poussé par {K}.",
  "[excited] {K} sert {V}… bien cuit !",
  "[excited] Quel plongeon de {V} ! Bon, {K} a beaucoup aidé.",
  "[amused] {K} montre la sortie à {V}… et le pousse dedans !",
  "[amused] Aller simple pour {V} ! {K} garde le retour.",
  "[excited] {K} flambe {V}, comme une crêpe ! Magnifique !",
  "[amused] {K} range {V} à la cave… rayon grillades.",
  "[sarcastic] {V} voulait bronzer… {K} a un peu trop aidé.",
];
export const FALL_LINES = [
  "[amused] Et {V} teste la gravité… verdict : elle fonctionne !",
  "[sighs] {V} tombe tout seul… personne n'avait rien demandé.",
  "[sarcastic] {V} voulait voir la lave de plus près… c'est réussi.",
  "[amused] {V} confond la lave avec une piscine chauffée… erreur classique.",
  "[sarcastic] {V} s'élimine sans l'aide de personne. Quelle autonomie !",
  "[gasps] {V} saute… la plateforme, non !",
  "[sighs] {V} a cru savoir voler. Raté.",
  "[amused] {V} perd pied… puis tout le reste.",
  "[curious] {V} va chercher un disque dans la lave… introuvable.",
  "[sighs] {V} s'en va sans dire au revoir… ni remonter.",
  "[sarcastic] {V} prend un bain de lave… sans invitation.",
];

// What the commentator says as a match starts, and as it ends: by the winner's lead over the second, {V}, then
// a word for the last, {L}, when there is a third player.
export const START_LINES = [
  "[excited] Mesdames et messieurs, disques en main… et que le meilleur gagne !", // cut from a longer take: short, the match starts sooner
];
export const END_LINES = {
  close: "[excited] C'est fini ! C'est fini ! {K} l'emporte d'un cheveu ! {V} y était presque… Quel match, mais quel match !", // 2 frags or less
  clear: "[excited] Et c'est terminé ! Victoire de {K}, solide, sans trembler. {V} n'a rien pu faire.",
  crushing: "[excited] Terminé ! {K} a tout écrasé, ce n'était même pas un match. {V}, deuxième… a surtout vu de la lave.", // 10 frags or more
  last: "[whispers] {L}, à la dernière place… on t'aime quand même.", // {L} first: said after the end, it starts no piece
};

// What the commentator says now and then, when she has said nothing for a while: on what goes on, the platform
// blinking, nobody dead for long, blood everywhere, a head lying about; or on anything at all.
export const ASIDES = {
  any: [
    "[whispers] Petit moment de calme pour admirer ces sapins… plantés à la main par la mairie. Ils ne servent à rien, mais ils sont jolis.",
    "[sighs] Les lampadaires restent allumés toute la partie… la facture d'électricité, elle, pleure.",
    "[amused] Vous remarquerez que ces bancs n'ont jamais servi. Personne ne s'assoit pendant un massacre.",
    "[whispers] Petite pensée pour l'équipe d'entretien de la lave… ils repêchent les disques à la main.",
    "[curious] Le saviez-vous ? La lave est maintenue à mille deux cents degrés. Le chauffage, c'est le plus gros poste du budget.",
    "[sarcastic] On me signale que la lave a été nettoyée ce matin. Ça ne se voit plus du tout.",
    "[whispers] Entre nous… ces gradins ont coûté une fortune. Le conseil municipal les a votés à une voix près.",
    "[amused] Trois mille quatre cents spectateurs ce soir… et toujours pas de buvette.",
    "[serious] Rappel aux spectateurs : il est interdit de lancer des disques depuis les tribunes.",
    "[amused] Les girafes ont un cou de deux mètres. Pratique pour voir loin… moins pour les disques.",
    "[whispers] Pendant ce temps, dans la vallée… quelqu'un fait une raclette.",
    "[seductive] Je porte une robe rouge ce soir… [whispers] ça ne se voit pas, mais c'est important.",
    "[curious] Il paraît que le disque a été inventé par un boulanger… je n'ai pas vérifié.",
    "[whispers] Le Big Fat Disc attend sur sa tour… lui n'a pas peur de la hauteur.",
  ],
  vanish: ["[excited] Attention, cette plateforme s'en va ! Elle, elle revient… vous, non.", "[amused] Une plateforme clignote… ce n'est pas une décoration."],
  calm: ["[whispers] C'est calme… trop calme.", "[sighs] Je rappelle que le but du jeu est de se lancer des disques… pas de se regarder."],
  blood: ["[amused] Le sol est un peu glissant aujourd'hui… on se demande bien pourquoi."],
  head: ["[serious] Petite annonce : une tête a été retrouvée près d'un banc. Son propriétaire est prié de venir la chercher."],
};

// What the announcer shouts for kills in a row without dying, by their count.
export const STREAK_SHOUTS = ["", "", "Doublé !", "Triplé !", "Série meurtrière !", "Déchaîné !", "Inarrêtable !", "Monstrueux !", "Divin !",
  "Appelez une ambulance !"];
// The announcer's answer to the commentator when she says a line with no cry after it: a warrior's word, out of tune with her.
export const RETORTS = ["Carnage !", "Gloire !", "Baston !", "Du sang !", "Sans pitié !", "Ouais !", "Massacre !", "À l'attaque !", "Bien parlé !", "Hourra !"];
// Every cry of the announcer, each recorded once in sounds/ by scripts/make-cries.mjs.
export const CRIES = [...STREAK_SHOUTS.filter(Boolean), "Premier sang !", "En pleine tête !", "Chasseur de têtes !", "Brochette !",
  "Par la bande !", "Détrôné !", "Remontada !", "Un frag pour la gloire !", "Et c'est le buuut !", "Humiliation !",
  "Tu as pris la tête !", "Tu as perdu la tête !", "Fraggez !", "Sans une égratignure !", "C'est juste une égratignure !", "Match nul !", "Big Fat Disc !",
  "La lave monte !", "Averse !", "Parade !", "Boum !", "Cou de girafe !", ...RETORTS];
// A cry's file name: « Et c'est le buuut ! » → et-c-est-le-buuut.
export const crySlug = (cry) => cry.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// A line without its tones, as the feed shows it.
export const untoned = (line) => line.replace(/\[[^\]]*\] */g, "");
// A piece of the commentator's line, in sounds/voice/: the words between the names, or a name.
export const voiceSlug = (bit, alias) => (alias ? `alias-${crySlug(alias)}` : crySlug(untoned(bit)));
