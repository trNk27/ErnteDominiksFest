# ⛏️ ErnteDominiksFest — Klötzchen-Survival

Ein Minecraft-artiges Survival-Spiel in **Ego-Perspektive**, im Browser, ohne Installation.
Die Welt besteht aus Blöcken: du **baust sie ab** (linke Maustaste), **setzt sie wieder**
(rechte Maustaste), legst dir im **Raster** Werkzeug zurecht und hältst nachts die
**Bennis** aus. Kein Punktestand, keine Aufgabenliste — nur überleben.

**Ziel: 10 000 €.** Ernte **🍑 Dominiks** und wirf sie **Manni** über den Tresen — einen
Euro das Stück. Gekocht bringen sie ein Vielfaches: die **🍲 Dominik-Suppe** zahlt **100 €**.
Das Rezept dafür hat einer der **Jannessen**, und die rücken nichts umsonst heraus. Weil
wild nichts nachwächst, legst du dir irgendwann ein **Feld** an. Wer zehntausend
zusammenhat, hat gewonnen.

## Spielen

Das Spiel braucht einen **Webserver** (ES-Module und Texturen lassen sich nicht per
`file://` laden). Also entweder über GitHub Pages veröffentlichen oder lokal:

```bash
python3 -m http.server 8000
# dann http://localhost:8000/ im Browser öffnen
```

Beim ersten Klick ins Bild fängt die Maus ein (Pointer-Lock), `Esc` gibt sie wieder frei.

## Steuerung

| Taste | Wirkung |
|---|---|
| `W` `A` `S` `D` | laufen · `⇧ Shift` rennen |
| `␣ Leertaste` | springen · im Wasser **aufwärts schwimmen** |
| `⇧ Shift` | im Wasser **abtauchen** |
| Maus | umsehen |
| **Linke Maustaste** | Block abbauen (halten) · Benni schlagen |
| **Rechte Maustaste** | **Jannes ansprechen** · Block setzen · **hacken / säen** · Truhe/Werkbank benutzen · **Kochtopf aufsetzen** · Essen |
| `Q` | Gegenstand einen Block weit vor sich werfen · `⇧Q` den ganzen Stapel |
| `E` | Inventar mit Raster und Rezeptbuch |
| `1`–`9` / Mausrad | Platz in der Inventarleiste wählen |
| `P` | Pause |

Eine Stufe steigst du automatisch hoch, ab zwei Blöcken ist es eine Wand — für dich
wie für die Bennis.

## Überleben

- **❤️ Leben** — Bennis schlagen zu, tiefe Stürze und Hunger auch. Bis **vier Blöcke**
  Fallhöhe passiert nichts, darüber kostet jeder weitere gut drei Viertel — und wer im
  **Wasser** landet, kommt ganz ohne Schaden davon. Nach einem Treffer bist
  du kurz unverwundbar. Bei 0 wachst du am Startpunkt wieder auf, behältst dein Zeug und
  hast ein paar Sekunden Ruhe, bis es weitergeht.
- **🍗 Hunger** — läuft langsam leer. Iss 🍑 Dominiks, 🍄 Pilze oder etwas Gekochtes
  (rechte Maustaste mit dem Essen in der Hand): 🍯 Kompott und 🍳 Pilzpfanne sättigen
  ordentlich, die 🍲 Suppe füllt alles auf. Ist der Balken voll, heilst du dich langsam
  selbst; ist er leer, kostet es Leben.
- **🌙 Nacht** — ab der Dämmerung tauchen Bennis auf. **🔥 Fackeln** halten sie in weitem
  Umkreis fern, ein ⚔️ Steinschwert räumt auf, eine zwei Blöcke hohe Mauer auch.

## Abbauen und Bauen

Linke Maustaste **halten**: im Block bilden sich **Risse**, die von der Mitte nach außen
wachsen. Sind sie über die ganze Fläche gelaufen, **fällt er heraus** — als kleiner
drehender Würfel, den du aufsammelst, indem du hingehst. Mit dem passenden Werkzeug geht
es rund dreimal so schnell, Stein ohne 🪓/⛏️ dagegen zäh. Gewächse machen das nicht mit:
die **fallen beim ersten Klick** (siehe unten).

| Block | Ergibt | Womit schneller |
|---|---|---|
| 🟩 Gras / 🟫 Erde / 🟨 Sand / ❄️ Schnee | Erde, Sand, Schnee | — |
| 🪵 Holzstamm | Holzstamm | 🪓 Axt |
| 🍃 Laub | manchmal einen 🥢 Stock | — |
| 🪨 Stein / 🧱 Ziegel | Stein, Ziegel | ⛏️ Spitzhacke |
| 🧂 Salzader | Salz | ⛏️ Spitzhacke · nur tief im Fels |
| 🍑 Dominik | Dominik (Essen + Zutat) | — · hängt hoch, bau dir was drunter |
| 🍄 Pilz | Pilz (Essen + Zutat) | — |
| 🌶️ Pfefferstrauch | Pfeffer | — · nur hinter dem Fluss |

**🍑 Dominiks, 🍄 Pilze und 🌶️ Pfeffer** sind keine Klötze, sondern **zwei gekreuzte
Flächen** — man geht mitten durch sie hindurch, und sie verdecken nichts: unter der
Frucht bleibt das Laub geschlossen, unter Pilz und Strauch die Grasnarbe.

Sie werden auch nicht *abgebaut*, sondern **gepflückt**: ein Klick, und sie fallen —
kein Halten, kein Fortschrittsbalken, keine Risse. Mit gedrückter Maustaste über ein
Pilzfeld gestrichen, nimmst du eines nach dem anderen mit.

**Was wild wächst, wächst nicht nach.** Beim Pflücken fällt aber **Saatgut** ab — und
damit legst du dir dein eigenes Feld an, siehe unten.

Gesetzt wird alles, was ein Block ist: Erde, Stein, Bretter, Ziegel, Werkbank, Kochtopf,
Fackeln. Blöcke gehen nur an eine Fläche eines vorhandenen Blocks — nichts schwebt.
In dich selbst oder in einen Benni hinein baust du nicht.

## Was herumliegt

Nichts springt dir direkt in den Rucksack. Alles, was aus einem Block fällt, liegt als
**kleiner drehender Würfel** auf dem Boden und will abgeholt werden — komm auf gut einen
Schritt heran, dann hüpft es hinein. Gleiches, das nebeneinander landet, **fasst sich
zusammen**, damit ein abgeräumter Baum nicht die halbe Wiese pflastert.

Umgekehrt geht es auch: **`Q`** wirft, was du in der Hand hältst, **einen Block weit vor
dich**, **`⇧Q`** gleich den ganzen Stapel. Weit genug, dass du es nicht sofort wieder
aufhebst. Passt beim Aufräumen etwas nicht mehr in den Rucksack, fällt es ebenfalls vor
deine Füße statt verlorenzugehen.

Ein Dominik hängt hoch im Baum — schlägst du ihn ab, fällt er von selbst herunter.
Du musst ihn also nicht mehr oben in Empfang nehmen, nur unten aufheben.

## Bauen im Raster

`E` öffnet den Rucksack mit dem Handwerksfeld. Zutaten werden **hineingelegt** wie beim
Vorbild: Der angeklickte Stapel hängt am Mauszeiger, bis du ihn wieder irgendwo ablegst.

| | |
|---|---|
| **Linke Maustaste** | nimmt und legt den **ganzen Stapel**; auf einen fremden Stapel geklickt, tauscht sie beide |
| **Rechte Maustaste** | nimmt und legt **genau eins** — so verteilst du ein Muster, ohne den Stapel vorher zu teilen |

Stimmt das Muster, erscheint rechts das Ergebnis — anklicken, fertig. Was danach noch im
Raster oder am Zeiger hängt, wandert beim Schließen zurück in den Rucksack.

**Neben dem Fenster hängt die Rezeptleiste**: jedes Rezept, das du kennst, als **Bild** —
das Muster, wie es ins Raster gehört, und daneben das Ergebnis. Fehlt dir Material, steht
es blass da. Es gibt **keinen Bauen-Knopf**: die Leiste zeigt nur, *wie* es geht,
hinlegen musst du es selbst. Genau das ist der Spaß daran.

Sie zeigt, was **hier** möglich ist: im Rucksack nur, was ins Zweierraster passt, an der
Werkbank auch alles Größere — und das Sperrige steht dann oben, denn deswegen bist du ja
hingegangen.

Fährst du mit dem Zeiger über einen Gegenstand, steht daneben, was er kann: wie sehr er
sättigt, wieviel Schaden er macht, wofür er als Zutat taugt.

- Im Rucksack ist das Raster **2×2**.
- Eine gesetzte **🛠️ Werkbank** (Rechtsklick darauf) macht daraus **3×3**. Alles, was
  breiter oder höher als zwei ist, geht nur dort.
- Muster sind **verschiebbar** und dürfen **gespiegelt** liegen — genau wie im Vorbild.
- **Gerichte gehören nicht ins Raster.** Die werden gekocht, siehe unten.

| Ergebnis | Muster | |
|---|---|---|
| 🟧 Bretter ×4 | 🪵 | Anordnung egal |
| 🥢 Stock ×4 | 🟧 / 🟧 | |
| 🛠️ Werkbank | 🟧🟧 / 🟧🟧 | |
| 🔥 Fackel ×4 | 🪨 / 🥢 | |
| 🧱 Ziegel ×4 | 🪨🟨 / 🟨🪨 | |
| 🥣 Schale ×2 | 🟧·🟧 / ·🟧· | Werkbank |
| ⚔️ Steinschwert | 🪨 / 🪨 / 🥢 | Werkbank |
| ⛏️ Spitzhacke | 🪨🪨🪨 / ·🥢· / ·🥢· | Werkbank |
| 🪓 Axt | 🪨🪨· / 🪨🥢· / ·🥢· | Werkbank |
| 🍲 Kochtopf | 🪨·🪨 / 🪨·🪨 / 🪨🟧🪨 | Werkbank |
| 🧑‍🌾 Hacke | 🪨🪨· / ·🥢· / ·🥢· | Werkbank |

## 🧑‍🌾 Das Feld

Wild wächst nichts nach. Damit die Ernte nicht ausgeht, legst du dir ein **Feld** an:

1. **Hacken.** Mit der 🧑‍🌾 **Hacke** in der Hand auf **Gras oder Erde** rechtsklicken —
   daraus wird **Ackerboden**. Das Rezept zeigt dir der Jannes gleich neben dem Startpunkt.
2. **Säen.** Mit **Saatgut** in der Hand auf den Acker rechtsklicken. Es steht ein
   **Setzling** da, farblich passend zu dem, was daraus wird.
3. **Warten.** Nach etwa einer Minute ist er reif.
4. **Ernten.** Ein Klick, und Frucht *und* Saatgut fallen heraus — vom Acker mehr als
   aus der Wildnis. Ein Feld trägt sich also selbst und wird von allein größer.

| Saatgut | fällt ab beim Pflücken von | wird zu |
|---|---|---|
| 🌰 Dominikkern | 🍑 Dominik | **🍑 Dominikstrauch** — am Boden, nicht am Baum |
| 🧫 Myzel | 🍄 Pilz | 🍄 Pilz |
| 🌾 Pfefferkorn | 🌶️ Pfefferstrauch | 🌶️ Pfefferstrauch |

Der gezogene Dominik hängt an keinem Stamm mehr: er sitzt als Strauch im Beet, in
Griffhöhe. Ein Feld voll davon neben dem Kochtopf und dem Markt ist die kürzeste
Strecke zwischen Ernte und Kasse.

## Kochen

Der **🍲 Kochtopf** ist kein Raster, sondern ein Topf. Stell ihn hin und **wirf die
Zutaten hinein** — `Q`, während du davorstehst. Am Fadenkreuz steht, wie voll er ist;
zwölf Sachen passen hinein. Ein **Rechtsklick** setzt ihn auf; nach ein paar Sekunden
springt oben heraus, was daraus geworden ist.

Stehst du davor und **siehst ihn an**, erscheint **rechts am Bildrand** die Liste der
Gerichte, die du kochen kannst — mit ihren Zutaten und dem, was gerade im Topf liegt.
Du musst also nicht ins Menü, um nachzusehen, was noch fehlt.

Im Topf liegt alles durcheinander, es zählt also nur **was** hineinkommt und **wieviel** —
keine Reihenfolge, kein Muster.

| Gericht | Zutaten | sättigt |
|---|---|---|
| 🍯 Dominik-Kompott | 2× 🍑 · 1× 🧂 · 1× 🥣 | 8 |
| 🍳 Pilzpfanne | 2× 🍄 · 1× 🌶️ · 1× 🥣 | 10 |
| **🍲 Dominik-Suppe** | 3× 🍑 · 2× 🍄 · 1× 🧂 · 2× 🌶️ · 1× 🥣 | alles |

Passt es **nicht** zusammen, kommt **🤢 angebrannte Pampe** heraus, und die Zutaten sind
weg. Dasselbe passiert, wenn die Zutaten zwar stimmen, du das **Rezept aber nicht kennst** —
dann weiß dein Koch schlicht nicht, was daraus werden soll. Frag einen Jannes.

Gekocht wird nicht nur zum Sattwerden: die Gerichte sind das, womit man bei Manni Geld
verdient. Aus drei Dominiks (3 €) wird mit Pilzen, Salz und Pfeffer eine Suppe (100 €).

Ein Topf, den du wieder abbaust, gibt seinen Inhalt zurück.

## Im Wasser

Die Flüsse haben eine **tiefe Rinne** und **flache Furten**. Durch eine Furt watet man
hindurch, in der Rinne **schwimmt** man: **`␣`** zieht nach oben, **`⇧`** taucht ab, und
lässt du beide los, trägt dich der Auftrieb von selbst zurück an die Oberfläche — mit dem
Kopf gerade heraus. Unter Wasser wird die Sicht kurz und blau.

Wasser fängt jeden Sturz, egal aus welcher Höhe. Vorwärts kommt man langsamer, und an
die Böschung schiebt man sich mit gedrückter `␣` wieder hinauf. Was dir dabei aus der
Hand fällt, **treibt an der Oberfläche** statt auf dem Grund zu verschwinden.

## 🛒 Manni-Markt — Geld verdienen und ausgeben

Gleich neben dem Startpunkt steht **Manni** in seinem Stand — vier Pfosten, ein Dach,
ein Tresen. Er handelt nicht mit Knöpfen: **wirf ihm hin, was du verkaufen willst** (`Q`,
`⇧Q` für den ganzen Stapel), und er zahlt bar. Ein ganzer Stapel wird auf einmal bezahlt.

| Er kauft | Preis |
|---|---|
| 🍑 Dominik | **1 €** |
| 🍯 Dominik-Kompott | 12 € |
| 🍳 Pilzpfanne | 15 € |
| **🍲 Dominik-Suppe** | **100 €** |

Alles andere lässt er liegen. Ein Dominik zu einer Suppe verkocht ist das Dreiunddreißig-
fache wert — **kochen lohnt sich**, und deshalb lohnen sich die Rezepte der Jannessen.

Verkaufen tut er nur, was sich **nicht bauen lässt**. Rechtsklick öffnet den Laden:

| Ware | Preis | Wirkung (in der Hand gehalten) |
|---|---|---|
| 🛹 Skateboard | 250 € | An Land fast doppelt so flott unterwegs |
| 🛶 Boot | 750 € | Setzt dich **oben aufs** Wasser statt hinein, und schnell |
| 🪂 Gleitschirm | 1500 € | Im Fallen segelst du sanft hinab statt zu stürzen |

Die drei wirken, solange du sie in der Hand hältst — sie kosten also den Platz für Hacke
oder Schwert. Alle drei bringen dich schneller zur nächsten Ernte und zahlen sich damit
selbst zurück.

Oben links steht, wieviel in der Kasse liegt (💶) und wieviel du **insgesamt verdient**
hast (🎯). Einkaufen mindert das Verdiente nicht — das Ziel ist der Umsatz, nicht der
Kontostand.

## Die Jannessen

Acht **Jannessen** streifen durch die Welt — einer im Starttal, drei in den Dorfhäusern,
der Rest draußen an Furt, Berg und hinter dem Fluss. Sie sehen alle gleich aus, heißen
alle gleich und tragen **kein Namensschild**; wer vor einem steht, sieht es am
Fadenkreuz. Sie bleiben nicht stehen, sondern gehen ein paar Schritte umher.

**Jedes Rezept im Spiel gibt es bei einem von ihnen** — und keines zweimal: was der eine
aushängen hat, bietet der andere nicht an. Rechtsklick, und er zeigt, was er dafür haben
will: Essen, mal roh, mal gekocht. Was er hergibt, **sagt** er nicht, er **zeigt** es —
das Muster, wie es ins Raster gehört, und daneben, was dabei herauskommt. Dieselbe Karte
kannst du jederzeit wieder ansehen, wenn du ihn erneut ansprichst.

Nach einem Handel muss er **überlegen**: knapp eine Minute später hat er ein **neues
Rezept** im Angebot — und will dafür mehr als beim letzten Mal. So kommst du nach und
nach an alles heran, ohne dass ein einzelner alles auf einmal hergibt.

Der **erste im Tal** zeigt immer zuerst die 🧑‍🌾 **Hacke** — ohne sie gäbe es kein Feld
und damit keinen Nachschub. Wer irgendwann alles kennt, bekommt zu hören, dass da nichts
mehr ist.

## Woher die Rezepte kommen

**Alle Rezepte gibt es bei den Jannessen** — sie sind die einzige Quelle. Wer will, kann
sie auch selbst erraten: das Raster fragt nicht, ob du ein Rezept kennst; wer das Muster
richtig legt, hat es gebaut und kennt es ab dann.

Was du kennst, steht danach in der **Rezeptleiste** neben dem Handwerksfeld (kleine
Sachen im Rucksack, große an der Werkbank) beziehungsweise **rechts am Bildrand**, wenn
du vor einem Kochtopf stehst. Oben links zählt 📜 mit, wieviele es schon sind.

Die **drei Gerichte** sind davon ausgenommen: Kompott, Pfanne und Suppe entstehen **nur
mit Rezept**. Wer die richtigen Zutaten ohne das Rezept in den Topf wirft, bekommt Pampe.

**🧰 Truhen** sind selten geworden — acht in der ganzen Welt — und halten nur noch
Vorräte bereit: Bretter, Stöcke, Fackeln, Schalen, Stein, Ziegel, gelegentlich ein
Schwert. **Zutaten liegen nicht mehr darin**, die holst du dir draußen selbst.

## Die Welt

Aus einer festen Zufallsformel entsteht eine Landschaft von **145 × 145 Blöcken** — bei
jedem Start dieselbe, kein Speicherstand nötig.

- **Berge** bis 25 Blöcke hoch, ab 9 Fels, ab 18 Schnee.
- **Zwei Flüsse** durch Westen und Norden, mit Sandufern. Die Rinne ist vier Blöcke
  tief — da wird geschwommen —, die **Furten** dazwischen nur einen.
- **Wälder** in zusammenhängenden Gebieten aus **hohen Bäumen** — zehn bis zwölf Blöcke
  Stamm, darüber die Krone. An jedem fünften hängen unter dem Laub **🍑 Dominiks**:
  zwei gekreuzte Flächen statt eines Klotzes, mit Dominiks Gesicht darauf. Man geht
  durch sie hindurch, und vom Boden kommt man **nicht** heran — dazu müssen zwei bis
  vier Blöcke untergebaut werden. Im Schatten stehen **🍄 Pilze**.
- **Hinter den Flüssen** — dem Streifen im Westen und im Norden, den man nur über eine
  Furt erreicht — wachsen **🌶️ Pfeffersträucher** in lockeren Feldern. Diesseits keiner.
- **Tief im Fels** sitzen **🧂 Salzadern**: helle Kristallnester, ab fünf Blöcken unter
  der Oberfläche, gut zwei Prozent des Gesteins. Ohne ⛏️ Spitzhacke wird das nichts.
- **Drei Dörfer** aus je vier Häuschen um einen gepflasterten Platz. Im ersten Haus
  steht eine Truhe, im zweiten wohnt ein **Jannes**.
- Wild wachsende **🍑 Dominiks, 🍄 Pilze und 🌶️ Pfeffer** kommen **nicht wieder** —
  wer dauerhaft ernten will, legt sich ein 🧑‍🌾 **Feld** an.
- **8 Truhen**, drei davon in Dörfern; **8 Jannessen**, die umherstreifen.
- Rund um den Startpunkt liegt ein **flaches Tal** ohne Bäume — Platz zum Bauen, und
  darin der **🛒 Manni-Markt**.
- Ganz unten liegt **Grundgestein**: zwölf Blöcke unter dem Meeresspiegel ist Schluss,
  tiefer gräbst du dich nicht.

Gezeichnet wird nicht Würfel für Würfel, sondern **chunkweise nur die freiliegenden
Flächen**. Ein abgebauter oder gesetzter Block vernetzt genau seinen Chunk neu, nicht
die ganze Welt.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `vendor/font/` — Pixelify Sans als Schrift (SIL Open Font License 1.1, `OFL.txt` liegt dabei)
- `*.png` — die Charaktere und Dominik als Frucht
- `sprites/items/` — die Gegenstände für Leiste, Raster, Truhe und Rezeptbuch; dieselben
  Bilder tragen auch die Würfel, die herumliegen
- `sprites/ui/` — Herzen, Essensbalken und die Knöpfe oben rechts

Die Sprites sind Gegenstände auf durchsichtigem Grund, keine Kachelmuster —
die Blockflächen der Welt entstehen weiterhin als Pixelrauschen im Code.
Fehlt ein Bild, zeigt der Browser den `alt`-Text, und das ist wieder das Emoji
von vorher; das Spiel läuft also auch ohne den Ordner.
