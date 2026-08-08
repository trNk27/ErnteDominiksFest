/* =====================================================================
   shared/economy.js — Rezepte, Preise und Jannes-Angebotslogik, ohne
   three.js und ohne DOM. Wird von game.js UND vom PartyKit-Server
   importiert: der Server braucht dieselben Daten, um Verkäufe/Käufe zu
   validieren und — ab Phase 4 — die Jannes-Angebote selbst auszuwürfeln,
   statt sich auf einen Client zu verlassen, der abweichen könnte.
   ===================================================================== */

// ------------------------------------------------------------------ Geld
// Das Ziel des Spiels: zehntausend Euro umgesetzt. Gezählt wird, was man
// insgesamt verdient hat, nicht was in der Kasse liegt — Einkaufen bringt
// einen also nicht zurück.
export const GOAL=10000;
// Was beim Pflücken an Saatgut abfällt — der Anfang jedes Beetes.
export const SEED_OF={dominik:'kern',bush:'kern',shroom:'mycel',pepper:'korn'};
// Was Manni annimmt und was er dafür zahlt. Die Frucht ist der Cent, die
// Suppe der große Schein; die beiden Gerichte liegen dazwischen, damit sich
// der Kochtopf auch lohnt, bevor man das Suppenrezept hat.
// Die Gerichte aus dem Kochtopf sind Mannis eigentliches Geschäft — je mehr
// Handgriffe darin stecken, desto mehr zahlt er. Die Suppe bleibt der große
// Schein und damit das Ziel; alles Neue liegt bewusst darunter, sonst wäre sie
// nicht mehr der Grund, überhaupt bis zum letzten Rezept zu handeln.
export const PRICES={dominik:1,salat:10,pfannkuchen:14,compote:12,panfry:15,
  omelett:18,roast:20,kuchen:25,eintopf:30,soup:100};
// Was Manni verkauft — nichts davon lässt sich bauen.
export const SHOP=[
  {id:'board', price:250,  txt:'Auf festem Boden fast doppelt so flott.'},
  {id:'boat',  price:750,  txt:'Setzt dich oben aufs Wasser statt hinein.'},
  {id:'glider',price:1500, txt:'Im Fallen gehalten, segelst du sanft hinab.'},
  {id:'fert',  price:120,  txt:'???'},
  // Das teuerste Stück im Sortiment: rasend schnell an Land, dafür im Wasser
  // ein Klotz — und wer damit gegen etwas fährt, muss nicht erst absteigen
  // und abbauen.
  {id:'truck', price:3000, txt:'Was im Weg steht, ist im Weg gewesen.'},
  // Skins: kein Gegenstand für den Rucksack, sondern ein Aussehen für die
  // Spielfigur — skin markiert das fürs Fenster (siehe game.js openMarket),
  // skinIdx zeigt auf SKINS dort (Index 0 = der Standard-Look, unverkäuflich).
  {id:'skin_dominik', price:400,  skin:true, skinIdx:1,
   txt:'Pfirsichfarbener Kittel, wie frisch vom Strauch gepflückt.'},
  {id:'skin_benni',   price:900,  skin:true, skinIdx:2,
   txt:'Zottelig und dunkel — man erschreckt sich selbst im Spiegel.'},
  {id:'skin_manni',   price:1800, skin:true, skinIdx:3,
   txt:'Mannis eigener Arbeitskittel, waschecht vom Markt.'},
];

// ------------------------------------------------------------------ Rezepte
// pat  Zeilen von oben nach unten, key übersetzt die Zeichen, ' ' bleibt leer
// shapeless  Zutaten in beliebiger Anordnung
// rank je kleiner, desto alltäglicher — danach sortiert sich das Rezeptbuch
// secret  nur mit Rezept zu bauen; ohne bleibt der Topf leer
// Ob eine Werkbank nötig ist, steht nirgends: was breiter oder höher als zwei
// ist, passt schlicht nicht ins 2×2-Raster des Inventars.
export const RECIPES=[
  {id:'plank', rank:0, out:['plank',4], shapeless:['log']},
  {id:'stick', rank:1, out:['stick',4], pat:['P','P'],     key:{P:'plank'}},
  {id:'bench', rank:2, out:['bench',1], pat:['PP','PP'],   key:{P:'plank'}},
  {id:'chest', rank:2.5,out:['chest',1],pat:['PPP','P P','PPP'], key:{P:'plank'}},
  // Drei Bretter in einer Reihe — schmal, aber breiter als 2, darum wie
  // Truhe/Kochtopf nur an der Werkbank zu bauen.
  {id:'sign',  rank:2.6,out:['sign',1], pat:['PPP'],       key:{P:'plank'}},
  {id:'torch', rank:3, out:['torch',4], pat:['S','K'],     key:{S:'stone',K:'stick'}},
  {id:'brick', rank:4, out:['brick',4], pat:['SA','AS'],   key:{S:'stone',A:'sand'}},
  {id:'sword', rank:6, out:['sword',1], pat:['S','S','K'], key:{S:'stone',K:'stick'}},
  {id:'pick',  rank:7, out:['pick',1],  pat:['SSS',' K ',' K '], key:{S:'stone',K:'stick'}},
  {id:'axe',   rank:8, out:['axe',1],   pat:['SS ','SK ',' K '], key:{S:'stone',K:'stick'}},
  {id:'pot',   rank:9, out:['pot',1],   pat:['S S','S S','SPS'], key:{S:'stone',P:'plank'}},
  {id:'hoe',   rank:3, out:['hoe',1],   pat:['SS ',' K ',' K '], key:{S:'stone',K:'stick'}},
  // Gerichte. Sie entstehen nur im Kochtopf und nur mit Rezept — das gibt es
  // bei den Jannessen, nicht durch Herumprobieren. Im Topf liegt alles
  // durcheinander, darum zählt hier die Zutatenliste und kein Muster.
  //
  // Die 🥣 Schale ist ersatzlos verschwunden. Sie war in jedem Gericht das
  // gleiche tote Vorspiel: erst zwei Bretter zur Schale, dann kochen. Ein
  // Gericht besteht jetzt aus dem, was man wirklich hineintut — Zutaten und
  // sonst nichts. Das macht die Rezepte kürzer, lesbarer und den Kochtopf zu
  // dem, was er sein soll.
  {id:'compote',rank:10,out:['compote',1], station:'pot', secret:true,
   shapeless:['dominik','dominik','salt']},
  {id:'panfry', rank:11,out:['panfry',1],  station:'pot', secret:true,
   shapeless:['mushroom','mushroom','pepper']},
  {id:'soup',  rank:99,out:['soup',1],     station:'pot', secret:true,
   shapeless:['dominik','dominik','dominik','mushroom','mushroom',
              'salt','pepper','pepper']},
  // Was das Huhn ins Spiel bringt: 🥚 Ei und 🍖 rohes Hähnchen. Beides ist roh
  // kaum der Rede wert (siehe food in ITEMS) — erst der Topf macht etwas
  // daraus, und genau dafür ist er da.
  {id:'salat',   rank:9.5, out:['salat',1],   station:'pot', secret:true,
   shapeless:['mushroom','pepper','pepper']},
  {id:'pfannkuchen',rank:9.8,out:['pfannkuchen',1], station:'pot', secret:true,
   shapeless:['egg','dominik','salt']},
  {id:'roast',   rank:10.2,out:['roast',1],   station:'pot', secret:true,
   shapeless:['meat','meat','salt']},
  {id:'omelett', rank:10.4,out:['omelett',1], station:'pot', secret:true,
   shapeless:['egg','egg','mushroom','pepper']},
  {id:'kuchen',  rank:11.2,out:['kuchen',1],  station:'pot', secret:true,
   shapeless:['dominik','dominik','egg','egg']},
  {id:'eintopf', rank:12,  out:['eintopf',1], station:'pot', secret:true,
   shapeless:['meat','mushroom','mushroom','salt','pepper']},
  // Schleuder: Griff aus Stöcken, Gabel aus einem dritten — die Schnur spannt das Band.
  {id:'sling',  rank:6.5,out:['sling',1],  pat:['KSK',' K ',' K '], key:{K:'stick',S:'string'}},
  // Kein Muster, nur eine Mischung — im Kochtopf würde man das nicht essen wollen.
  {id:'cracker',rank:7.5,out:['cracker',3],shapeless:['coal','fert']},
];

// ------------------------------------------------------------------ Angebote
// Jedes Rezept ist bei irgendeinem Jannes zu haben, und keines zweimal: was
// einer aushängen hat, bietet der nächste nicht an. Nach einem Handel
// überlegt er sich eine Weile etwas Neues — und wird dabei jedes Mal ein
// bisschen gieriger.
export const REFRESH=40;                 // Sekunden bis zum nächsten Angebot
export const RAW=['dominik','mushroom','pepper'];
// offerWant ist rein — der aufrufende Zufallsgenerator (OFFER_RND) wird von
// außen übergeben, damit Client und Server je ihre eigene Instanz halten
// können, ohne dass beide Seiten irgendetwas synchron auswürfeln müssten.
export function offerWant(r,round,offerRnd){
  if(r.id==='soup') return [['compote',1+round],['panfry',1+round]];
  const grow=1+round*.7;
  const base=r.rank>=10?7:r.rank>=6?5:3;
  // Pfeffer verlangt nur, wer schon Werkzeug hergibt — vorher war man kaum
  // hinter dem Fluss.
  const pool=r.rank>=6?RAW:RAW.slice(0,2);
  const id=pool[Math.floor(offerRnd()*pool.length)];
  return [[id,Math.max(1,Math.round(base*grow))]];
}
