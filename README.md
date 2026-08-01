# ⛏️ ErnteDominiksFest — Klötzchen-Survival

Ein Minecraft-artiges Survival-Spiel in **Ego-Perspektive**, im Browser, ohne Installation.
Die Welt besteht aus Blöcken: du **baust sie ab** (linke Maustaste), **setzt sie wieder**
(rechte Maustaste), legst dir im **Raster** Werkzeug zurecht und hältst nachts die
**Bennis** aus. Kein Punktestand, keine Aufgabenliste — nur überleben.

**Ziel:** Das Rezept der **🍲 Dominik-Suppe** kennt nur noch ein **Jannes**, und der
sitzt hinter dem Fluss. Er rückt es erst heraus, wenn du ihm zwei fertige Gerichte
vorkochst. Wer die Suppe danach zusammenbekommt, hat gewonnen.

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
| `␣ Leertaste` | springen |
| Maus | umsehen |
| **Linke Maustaste** | Block abbauen (halten) · Benni schlagen |
| **Rechte Maustaste** | **Jannes ansprechen** · Block setzen · Truhe/Werkbank/Kochtopf benutzen · 📖 Notiz lesen · Essen |
| `E` | Inventar mit Raster und Rezeptbuch |
| `1`–`9` / Mausrad | Platz in der Inventarleiste wählen |
| `P` | Pause |

Eine Stufe steigst du automatisch hoch, ab zwei Blöcken ist es eine Wand — für dich
wie für die Bennis.

## Überleben

- **❤️ Leben** — Bennis schlagen zu, tiefe Stürze und Hunger auch. Bis drei Blöcke
  Fallhöhe passiert nichts, darüber kostet jeder weitere Block. Nach einem Treffer bist
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
wachsen. Sind sie über die ganze Fläche gelaufen, fällt der Block ins Inventar. Mit dem
passenden Werkzeug geht es rund dreimal so schnell, Stein ohne 🪓/⛏️ dagegen zäh.

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

Gesetzt wird alles, was ein Block ist: Erde, Stein, Bretter, Ziegel, Werkbank, Kochtopf,
Fackeln. Blöcke gehen nur an eine Fläche eines vorhandenen Blocks — nichts schwebt.
In dich selbst oder in einen Benni hinein baust du nicht.

## Bauen im Raster

`E` öffnet den Rucksack mit dem Handwerksfeld. Zutaten werden **hineingelegt** wie beim
Vorbild: Der angeklickte Stapel hängt am Mauszeiger, bis du ihn wieder irgendwo ablegst.

| | |
|---|---|
| **Linke Maustaste** | nimmt und legt den **ganzen Stapel**; auf einen fremden Stapel geklickt, tauscht sie beide |
| **Rechte Maustaste** | nimmt und legt **genau eins** — so verteilst du ein Muster, ohne den Stapel vorher zu teilen |

Stimmt das Muster, erscheint rechts das Ergebnis — anklicken, fertig. Was danach noch im
Raster oder am Zeiger hängt, wandert beim Schließen zurück in den Rucksack.

Fährst du mit dem Zeiger über einen Gegenstand, steht daneben, was er kann: wie sehr er
sättigt, wieviel Schaden er macht, wofür er als Zutat taugt.

- Im Rucksack ist das Raster **2×2**.
- Eine gesetzte **🛠️ Werkbank** (Rechtsklick darauf) macht daraus **3×3**. Alles, was
  breiter oder höher als zwei ist, geht nur dort.
- Die Suppe geht nur an einem aufgestellten **🍲 Kochtopf**.
- Muster sind **verschiebbar** und dürfen **gespiegelt** liegen — genau wie im Vorbild.

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
| 🍯 Dominik-Kompott | 🍑🧂🍑 / ·🥣· | Kochtopf, **Rezept nötig** |
| 🍳 Pilzpfanne | 🍄🌶️🍄 / ·🥣· | Kochtopf, **Rezept nötig** |
| **🍲 Dominik-Suppe** | 🍑🍑🍑 / 🍄🧂🍄 / 🌶️🥣🌶️ | Kochtopf, **Rezept nötig** |

## Die Jannessen

Überall in der Welt steht ein **Jannes** herum — im Starttal, in den Dorfhäusern, an
einer Furt, oben auf einem Berg, hinter dem Fluss. Sie sehen alle gleich aus und heißen
alle gleich, aber jeder will etwas anderes: **🍑 Dominiks**, **🍄 Pilze** oder ein
fertiges **Gericht**. Rechtsklick, und er zeigt, was er haben möchte.

Was er dafür hergibt, ist ein **📜 Rezept** — und er sagt es nicht, er **zeigt** es:
das Muster, wie es ins Raster gehört, und daneben, was dabei herauskommt. Genau dieselbe
Karte kannst du jederzeit noch einmal sehen, wenn du ihn wieder ansprichst.

| Er will | Er zeigt |
|---|---|
| 3× 🍑 | 🥣 Schale |
| 4× 🍄 | 🍲 Kochtopf |
| 5× 🍑 | 🍯 Dominik-Kompott |
| 6× 🍄 | 🍳 Pilzpfanne |
| 1× 🍯 | ⛏️ Spitzhacke |
| 1× 🍳 | 🪓 Axt |
| 2× 🍑 + 2× 🍄 | ⚔️ Steinschwert |
| 1× 🍯 + 1× 🍳 | **🍲 Dominik-Suppe** |

Der Weg ist also eine Kette: erst Schale und Topf, damit die beiden Gerichte, und mit
denen alles Weitere bis zur Suppe.

## Das Rezeptbuch

Unter dem Raster steht, was du kennst. Ein Rezept landet auf zwei Wegen darin:

1. **Eingetauscht.** Bei einem Jannes, siehe oben.
2. **Selbst herausgefunden.** Das Raster fragt nicht, ob du das Rezept kennst — wer das
   Muster errät, hat es gebaut und kennt es ab dann.

Die **drei Gerichte** sind davon ausgenommen: Kompott, Pfanne und Suppe entstehen **nur
mit Rezept**. Ohne bleibt der Kochtopf leer, egal wie richtig alles im Raster liegt.

**🧰 Truhen** sind selten geworden — acht in der ganzen Welt — und halten nur noch
Vorräte bereit: Bretter, Stöcke, Fackeln, Schalen, Stein, Ziegel, gelegentlich ein
Schwert. **Zutaten liegen nicht mehr darin**, die holst du dir draußen selbst.

## Notizen

Überall in der Welt stehen **📖 dreizehn Notizen** herum (Rechtsklick zum Lesen). Sie
erzählen, wie das mit Dominik, den Bennis und dem Fest angefangen hat, und ein paar von
ihnen helfen konkret weiter. Sie liegen dort, wo man ohnehin vorbeikommt: eine gleich am
Startpunkt, je eine neben den drei Dorfplätzen, zwei auf den höchsten Gipfeln, zwei an
den Furten, der Rest verstreut im Grasland. Oben links steht, wie viele du gelesen hast.

## Die Welt

Aus einer festen Zufallsformel entsteht eine Landschaft von **145 × 145 Blöcken** — bei
jedem Start dieselbe, kein Speicherstand nötig.

- **Berge** bis 25 Blöcke hoch, ab 9 Fels, ab 18 Schnee.
- **Zwei Flüsse** durch Westen und Norden, mit Sandufern und Furten.
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
- **8 Truhen**, drei davon in Dörfern; **8 Jannessen**; **13 Notizen** zum Lesen.
- Rund um den Startpunkt liegt ein **flaches Tal** ohne Bäume — Platz zum Bauen.
- Ganz unten liegt **Grundgestein**: zwölf Blöcke unter dem Meeresspiegel ist Schluss,
  tiefer gräbst du dich nicht.

Gezeichnet wird nicht Würfel für Würfel, sondern **chunkweise nur die freiliegenden
Flächen**. Ein abgebauter oder gesetzter Block vernetzt genau seinen Chunk neu, nicht
die ganze Welt.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `vendor/font/` — Pixelify Sans als Schrift (SIL Open Font License 1.1, `OFL.txt` liegt dabei)
- `*.png` — die Charaktere und Dominik als Frucht
- `sprites/items/` — die Gegenstände für Leiste, Raster, Truhe und Rezeptbuch
- `sprites/ui/` — Herzen, Essensbalken und die Knöpfe oben rechts

Die Sprites sind Gegenstände auf durchsichtigem Grund, keine Kachelmuster —
die Blockflächen der Welt entstehen weiterhin als Pixelrauschen im Code.
Fehlt ein Bild, zeigt der Browser den `alt`-Text, und das ist wieder das Emoji
von vorher; das Spiel läuft also auch ohne den Ordner.
