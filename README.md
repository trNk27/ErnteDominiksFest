# ⛏️ ErnteDominiksFest — Klötzchen-Survival

Ein Minecraft-artiges Survival-Spiel in **Ego-Perspektive**, im Browser, ohne Installation.
Die Welt besteht aus Blöcken: du **baust sie ab** (linke Maustaste), **setzt sie wieder**
(rechte Maustaste), legst dir im **Raster** Werkzeug zurecht und hältst nachts die
**Bennis** aus — nicht jede Nacht gleich ruhig. Kein Punktestand, keine Aufgabenliste —
nur überleben.

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

## Zu viert spielen (Multiplayer)

Bis zu **vier Spieler** teilen sich eine einzige, dauerhafte Welt hinter einem
gemeinsamen Passwort. Was geteilt ist: die Welt selbst (abgebaute/gesetzte
Blöcke, Truhen, Kochtöpfe, Felder, Fackeln), die Kasse (💶 und 🎯 sind ein
gemeinsamer Topf, kein Wettbewerb), das Rezeptbuch (📜 — wer ein Rezept
lernt, kann es allen zeigen) und die Bewohner (Jannessen, Manni, Bennis laufen
für alle gleich). Was **nicht** geteilt ist und nur im eigenen Browser bleibt:
Rucksack, Leben, Hunger, Position — keine Accounts, kein Login, keine
Spielerdaten auf dem Server.

**Die Zeit steht still, solange niemand spielt.** Der Server rechnet die Welt
nur weiter, wenn mindestens einer verbunden ist: geht der Letzte raus, wird der
Stand gespeichert und die Uhr angehalten — Tag und Nacht, wachsende Felder,
laufende Kochtöpfe und die Wartezeit der Jannessen frieren genau dort ein. Beim
nächsten Beitritt geht es an derselben Stelle weiter. Wer abends bei Sonnenlicht
aufhört, steht am nächsten Wochenende wieder im selben Sonnenlicht, und der halb
gewachsene Weizen ist immer noch halb gewachsen — statt dass drei Tage Pause
vierzig Spieltage samt Bennis durchlaufen lassen.

### Server aufsetzen (einmalig)

Der Mehrspieler-Teil läuft als kleiner
[Cloudflare-Worker](https://developers.cloudflare.com/workers/) mit einem
Durable Object unter `party/`, getrennt vom eigentlichen Spiel:

```bash
cd party
npm install
npx wrangler login                        # einmalig, öffnet den Browser
npx wrangler deploy                       # baut & deployt party/src/index.js
npx wrangler secret put ROOM_PASSWORD     # das Passwort für den Beitritt festlegen
```

`wrangler deploy` gibt die Adresse aus, unter der der Worker erreichbar ist
(hier `erntedominik.manigames.xyz`, siehe die Custom Domain in
[`party/wrangler.jsonc`](party/wrangler.jsonc)). Die trägst du in
[`net.js`](net.js) ein:

```js
export const PARTY_URL = 'wss://erntedominik.manigames.xyz';
```

Danach `net.js` committen und pushen — die statische Seite (GitHub Pages/Vercel/…)
zieht die neue Adresse beim nächsten Deploy automatisch mit. Das Passwort teilst
du deinen Mitspielern auf einem anderen Weg mit (Chat, nicht im Repo).

**Zwei getrennte Deploy-Wege**: Änderungen unter `party/` oder `shared/` brauchen
einen Server-Deploy; alles andere (`game.js`, `index.html`, …) braucht nur den
normalen Git-Push. Leicht zu vergessen, wenn man nur an einer der beiden Seiten
gearbeitet hat — darum erledigt
[`.github/workflows/deploy-party.yml`](.github/workflows/deploy-party.yml) den
Server-Teil bei jedem Push auf `main` automatisch mit (und ist unter Actions
auch von Hand auslösbar). Dafür muss einmalig ein Repository-Secret
`CLOUDFLARE_API_TOKEN` hinterlegt sein — ein Cloudflare-Token mit der
Berechtigung *Workers Scripts: Edit*. Von Hand geht es weiterhin mit
`cd party && npx wrangler deploy`.

### Lokal entwickeln/testen

Ohne laufenden Server startet das Spiel trotzdem — offline, als Einzelspieler,
genau wie bisher (ein Toast weist kurz darauf hin). Für einen echten
Mehrspieler-Test lokal:

```bash
cd party && npx wrangler dev              # Server auf ws://127.0.0.1:8787
python3 -m http.server 8000               # Spiel wie gewohnt, zweiter Terminal
```

`party/.dev.vars` (nicht eingecheckt, siehe `party/.gitignore`) mit
`ROOM_PASSWORD=<irgendein-testpasswort>` legt für den lokalen Server ein Passwort
fest; ohne diese Datei lehnt er jede Verbindung ab (kein Passwort konfiguriert
heißt zu, nicht offen).

Ein falsches Passwort öffnet erneut die Passwortabfrage, ein volles Zimmer
(schon vier Spieler drin) ebenso mit entsprechendem Hinweis.

`node test/smoke-test.mjs` (im zweiten Terminal, gegen den laufenden
`wrangler dev`) prüft Passwort, Zimmergröße, Kasse und die angehaltene Uhr
durch.

### Entwicklerhilfen in der Konsole

Zum Ausprobieren muss niemand erst stundenlang Dominiks pflücken. In der
Browser-Konsole (F12) gibt es:

```js
game.dev.money()        // genug für Mannis ganze Auslage auf einmal
game.dev.money(500)     // oder ein eigener Betrag; negativ nimmt wieder weg
game.dev.vehicles()     // alle Fahrzeuge in den Rucksack, ohne Umweg über Manni
game.dev.skin(2)        // Skin anziehen (0 = Standard), ohne ihn zu kaufen
```

Das Geld landet **nur** in der Kasse, nicht bei 💶 verdient — die 🎯
Siegesmeldung löst ein Test damit also nicht aus. Online entscheidet wie immer
der Server über die gemeinsame Kasse; der Betrag gilt darum für alle im Zimmer.
Es gibt bewusst keine Taste und keinen Knopf dafür: wer nicht in der Konsole
danach sucht, stolpert auch nicht hinein.

## Steuerung

| Taste | Wirkung |
|---|---|
| `W` `A` `S` `D` | laufen · `⇧ Shift` rennen |
| `␣ Leertaste` | springen · im Wasser **aufwärts schwimmen** |
| `⇧ Shift` | im Wasser **abtauchen** |
| Maus | umsehen |
| **Linke Maustaste** | Block abbauen (halten) · Benni schlagen |
| **Rechte Maustaste** | **Jannes ansprechen** · Block setzen · **hacken / säen** · Truhe/Werkbank benutzen · **Kochtopf aufsetzen** · **Schleuder abfeuern / Wurfwaffe werfen** · Essen |
| `Q` | Gegenstand einen Block weit vor sich werfen · `⇧Q` den ganzen Stapel |
| `E` | Inventar mit Raster und Rezeptbuch |
| `1`–`9` / Mausrad | Platz in der Inventarleiste wählen |
| `P` | Pause |

Eine Stufe steigst du automatisch hoch, ab zwei Blöcken ist es eine Wand — für dich
wie für die Bennis.

**Unten rechts hältst du sichtbar, was gewählt ist.** Ein Block liegt als Würfel mit
seiner echten Textur in der Hand, alles andere als Plättchen; ohne Auswahl bleibt die
bloße Faust. Die Hand schwingt beim Schlagen und Abbauen mit, wippt beim Laufen und
duckt sich kurz weg, wenn du den Platz wechselst — so siehst du am Bildrand, was du
gleich benutzt, ohne den Blick auf die Leiste zu senken. In der Verfolgeransicht, bei
Pause und hinter einem offenen Fenster verschwindet sie.

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
- **🌙 Nacht** — ab der Dämmerung tauchen Bennis auf, insgesamt spürbar weniger als früher:
  höchstens sieben gleichzeitig statt zwölf, und zwischen zwei Ankünften vergehen sechs bis
  elf statt zweieinhalb bis fünf Sekunden. **🔥 Fackeln** halten sie in weitem Umkreis vom
  Auftauchen ab, eine zwei Blöcke hohe Mauer sperrt sie aus. Erledigt, lassen sie jetzt auch
  etwas fallen:

  **Eine Wand schützt wieder.** Bisher stellte sich ein Benni vor eine ein Block dicke
  Mauer und schlug einfach hindurch, solange er nur auf ähnlicher Höhe stand — ein
  Schlafhaus half gegen alles außer gegen den Schlag durch die eigene Wand. Jetzt zählt
  die Sichtlinie: liegt zwischen Benni und dir ein voller Block, kommt der Schlag nicht
  an. Das gilt auch für den fliegenden Fluch-Benni — über deine Mauer kommt er weiterhin,
  hindurch nicht mehr.

  | Sorte | Leben · Schaden | Fällt beim Tod |
  |---|---|---|
  | **Benni** — der gewöhnliche | 10 · 3 | 🏀 Basketball |
  | **Spinnen-Benni** — geduckt, breit, das Kreischen tief ins Verzerrte gezogen | 14 · 4, kaum vom Fleck zu stoßen | 🧵 Schnur |
  | **Fluch-Benni** — nur in der Blutmondnacht: klein, fliegt, rotes hohles Gesicht, ein hoher, dünner Schrei | 7 · 2 | 🧵 Schnur |

- **🩸 Blutmond** — ungefähr jede siebte Nacht. Es ist reine Rechnung aus der Tageszahl,
  keiner muss es ansagen: alle am selben Server erleben ohne ein Wort dieselbe
  Blutmondnacht. Der Himmel kippt ins Dunkelrote, es kommen deutlich mehr Bennis als sonst,
  und nur in dieser einen Nacht mischt sich der Fluch-Benni darunter. Er fliegt — die zwei
  Blöcke hohe Mauer, die sonst ausreicht, hält ihn nicht auf.
- **⚔️ Wehren** — jeder Treffer stößt jetzt auch, von der bloßen Faust bis zum
  ⚔️ Steinschwert, und jede Benni-Sorte nimmt den Stoß anders hin: die Spinne bleibt fast
  stehen, der Fluch-Benni taumelt wie ein Blatt. Dazu drei geworfene Waffen: die
  **🏹 Schleuder** verschießt 🍑 Dominiks mit einem hohen Quietschen, ohne sich selbst zu
  verbrauchen; der **🏀 Basketball** fliegt im Bogen; der **🧨 Knaller** zündet nach kurzer
  Lunte und stößt alles im Umkreis weg, ohne dabei Blöcke zu zerlegen.

  Die beiden ersten reichen jetzt **weit**: die Schleuder schießt flach und schnell fast
  geradeaus, der Basketball geht in hohem Bogen über eine halbe Lichtung. Beide treffen
  damit einen Benni, lange bevor er bei dir ist — der Knaller bleibt bewusst eine Waffe
  für den Nahbereich, sonst wirft man ihn sich selbst nicht mehr vor die Füße.

  | Waffe | Schaden | Stoß | Reichweite |
  |---|---|---|---|
  | 🏹 Schleuder | 4 | 2 | weit, flach |
  | 🏀 Basketball | 5 | 4 | weit, im Bogen |
  | 🧨 Knaller | 7 | 7 | kurz |

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
| ⚫ Kohleader | Kohle | ⛏️ Spitzhacke · nur tief im Fels |
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
| 🏹 Schleuder | 🥢🧵🥢 / ·🥢· / ·🥢· | Werkbank |
| 🧨 Knaller ×3 | ⚫ · 🧪 | Anordnung egal |

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
ein Tresen. Rechtsklick öffnet seinen Laden: oben steht nur die Kasse, darunter seine
Annahme und seine Auslage. Namen, Preise und was ein Ding tut, stehen nirgends im
Fließtext — die zeigt sich erst, wenn der Mauszeiger darüberhält.

**Verkaufen**: den Stapel aufnehmen — wie im Raster hängt er dann am Zeiger — und auf
Mannis Annahme fallen lassen, schon ist er bezahlt, ein ganzer Stapel auf einmal. Wer
lieber wirft: **`Q`**/**`⇧Q`** vor ihm hin tut es weiterhin genauso.

| Er kauft | Preis |
|---|---|
| 🍑 Dominik | **1 €** |
| 🍯 Dominik-Kompott | 12 € |
| 🍳 Pilzpfanne | 15 € |
| **🍲 Dominik-Suppe** | **100 €** |

Alles andere lässt er liegen. Ein Dominik zu einer Suppe verkocht ist das Dreiunddreißig-
fache wert — **kochen lohnt sich**, und deshalb lohnen sich die Rezepte der Jannessen.

**Kaufen**: in der Auslage anklicken, und es landet direkt im Rucksack statt vor seinen
Füßen. Verkaufen tut er nur, was sich **nicht bauen lässt**:

| Ware | Preis | Wirkung |
|---|---|---|
| 🛹 Skateboard | 250 € | An Land fast doppelt so flott unterwegs |
| 🛶 Boot | 750 € | Setzt dich **oben aufs** Wasser statt hinein, und schnell |
| 🪂 Gleitschirm | 1500 € | Im Fallen segelst du sanft hinab statt zu stürzen |
| 🚚 **Monstertruck** | **3000 €** | Rast an Land — und **bricht durch, was im Weg steht** |
| 🧪 Aquariendünger | 120 € | ??? |

Die Fahrzeuge stellst du ab und steigst ein (Rechtsklick), statt sie in der Hand zu
halten. Sie bringen dich schneller zur nächsten Ernte und zahlen sich damit selbst
zurück. Was der Dünger tut, verrät Manni nicht — und dabei bleibt es.

**🚚 Der Monstertruck** ist das teuerste Stück im Sortiment und das einzige, das die
Landschaft verändert: Wer damit gegen eine Wand fährt, fährt hindurch. Die Blöcke fallen
dabei ganz normal heraus und lassen sich aufsammeln — der Truck ist im Grunde eine
Spitzhacke, die beim Fahren zuschlägt. **Grundgestein** bremst ihn wie jedes andere
Fahrzeug, und im **Wasser** ist er ein Klotz: dafür bleibt das Boot. Im Stand zerlegt er
nichts, es braucht wirklich Fahrt.

**🙂 Skins** — drei Kostüme für die eigene Figur, ebenfalls bei Manni:

| Skin | Preis |
|---|---|
| 🍑 Dominik-Kostüm | 400 € |
| 👹 Benni-Kostüm | 900 € |
| 🦺 Mannis Arbeitskittel | 1800 € |

Ein Skin ist **kein Gegenstand**: er kostet keinen Platz im Rucksack, kann nicht
herausfallen und geht beim Sterben nicht verloren. Gekauft gehört er dir dauerhaft; im
Laden klickst du zwischen den gekauften hin und her, um dich umzuziehen. **Deine
Mitspieler sehen, was du anhast** — das Aussehen läuft in derselben Nachricht mit wie
deine Position.

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
- **Tief im Fels** sitzen **🧂 Salzadern** — helle Kristallnester, ab fünf Blöcken unter
  der Oberfläche, inzwischen gut anderthalbmal so dicht gesät wie früher. Eine Lage
  höher, schon ab vier Blöcken Tiefe, liegen dunklere **⚫ Kohleadern**. Ohne ⛏️
  Spitzhacke wird bei beiden nichts.
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

### Die Welt wurde einmal zurückgesetzt

Mit den Wurfweiten, dem Monstertruck und den Skins fängt alles von vorn an: gesetzte und
abgebaute Blöcke, Truhen, Felder, Fackeln, Schilder, Fahrzeuge, die gemeinsame Kasse und
das Rezeptbuch auf dem Server, dazu Rucksack und Standort in jedem Browser. Die
Landschaft selbst ist dieselbe — sie kommt ja aus der festen Zufallsformel —, nur eben
wieder unberührt.

Technisch hängt das an zwei umgestellten Schlüsseln: der Server speichert unter
`world2` statt `world` (siehe `STORAGE_KEY` in `party/src/game-server.js`), der Browser
unter `edf_player2`/`edf_slots2` (siehe `savePersist` in `game.js`). Der alte Stand ist
damit **nicht gelöscht**, sondern liegengelassen — wer den Reset bereut, zeigt beide
Schlüssel zurück und hat die alte Welt wieder.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `vendor/font/` — Pixelify Sans als Schrift (SIL Open Font License 1.1, `OFL.txt` liegt dabei)
- `*.png` — die Charaktere und Dominik als Frucht
- `sprites/items/` — die Gegenstände für Leiste, Raster, Truhe und Rezeptbuch; dieselben
  Bilder tragen auch die Würfel, die herumliegen
- `sprites/ui/` — Herzen, Essensbalken und die Knöpfe oben rechts
- `shared/world.js`, `shared/economy.js` — Weltgenerierung, Rezepte und Preise als
  reines JS ohne three.js/DOM, damit `game.js` **und** der Mehrspieler-Server exakt
  dieselben Daten aus demselben Samen erzeugen, ohne dass eine Seite der anderen
  etwas davon schicken müsste
- `net.js` — die Netzwerkverbindung des Spiels zum Server (rohes WebSocket, keine
  Bibliothek)
- `party/` — der Mehrspieler-Server selbst (siehe „Zu viert spielen" oben);
  `party/server.js` ist die einzige Datei, die man normalerweise anfasst

Die Sprites sind Gegenstände auf durchsichtigem Grund, keine Kachelmuster —
die Blockflächen der Welt entstehen weiterhin als Pixelrauschen im Code.
Fehlt ein Bild, zeigt der Browser den `alt`-Text, und das ist wieder das Emoji
von vorher; das Spiel läuft also auch ohne den Ordner.
