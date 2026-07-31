# ⛏️ ErnteDominiksFest — Klötzchen-Survival

Ein Minecraft-artiges Survival-Spiel in **Ego-Perspektive**, im Browser, ohne Installation.
Die Welt besteht aus Blöcken: du **baust sie ab** (linke Maustaste), **setzt sie wieder**
(rechte Maustaste), legst dir im **Raster** Werkzeug zurecht und hältst nachts die
**Bennis** aus. Kein Punktestand, keine Aufgabenliste — nur überleben.

**Ziel:** Das Rezept der **🍲 Dominik-Suppe** liegt als **📜 Zettel** in einer der
Truhen am äußersten Rand der Welt. Wer es findet und die Suppe kocht, hat gewonnen.

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
| **Rechte Maustaste** | Block setzen · Truhe/Werkbank/Kochtopf benutzen · 📖 Notiz lesen · Essen |
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
- **🍗 Hunger** — läuft langsam leer. Iss 🍑 Dominiks, 🍄 Pilze oder die fertige Suppe
  (rechte Maustaste mit dem Essen in der Hand). Ist der Balken voll, heilst du dich
  langsam selbst; ist er leer, kostet es Leben.
- **🌙 Nacht** — ab der Dämmerung tauchen Bennis auf. **🔥 Fackeln** halten sie in weitem
  Umkreis fern, ein ⚔️ Steinschwert räumt auf, eine zwei Blöcke hohe Mauer auch.

## Abbauen und Bauen

Linke Maustaste **halten**: im Block bilden sich **Risse**, die von der Mitte nach außen
wachsen. Sind sie über die ganze Fläche gelaufen, fällt der Block ins Inventar. Mit dem
passenden Werkzeug geht es rund dreimal so schnell, Stein ohne 🪓/⛏️ dagegen zäh.

| Block | Ergibt | Womit schneller |
|---|---|---|
| 🟩 Gras / 🟫 Erde / 🟨 Sand / ❄️ Schnee | Erde, Sand, Schnee (Sand manchmal 🧂 Salz) | — |
| 🪵 Holzstamm | Holzstamm | 🪓 Axt |
| 🍃 Laub | manchmal einen 🥢 Stock | — |
| 🪨 Stein / 🧱 Ziegel | Stein, Ziegel | ⛏️ Spitzhacke |
| 🍑 Dominik | Dominik (Essen + Zutat) | — |
| 🍄 Pilz | Pilz (Essen + Zutat) | — |

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
| **🍲 Dominik-Suppe** | 🍑🍑🍑 / 🍄🧂🍄 / ·🥣· | Kochtopf, **Rezept nötig** |

## Das Rezeptbuch

Unter dem Raster steht, was du kennst. Ein Rezept landet auf zwei Wegen darin:

1. **Gefunden.** In **🧰 Truhen** liegen **📜 Rezeptzettel**. Sie sind nach Entfernung
   sortiert: das Alltägliche (Werkbank, Fackel) liegt in den Truhen nah am Tal, das
   Seltenere weiter draußen. Ein Zettel geht direkt ins Buch, nicht ins Inventar.
2. **Selbst herausgefunden.** Das Raster fragt nicht, ob du das Rezept kennst — wer das
   Muster errät, hat es gebaut und kennt es ab dann. Nur die Suppe nicht.

**Das Suppenrezept** liegt in **einer der drei entlegensten Truhen** der Welt. Ohne den
Zettel bleibt der Kochtopf leer, egal wie richtig alles im Raster liegt.

Truhen enthalten außerdem Vorräte: Bretter, Stöcke, Fackeln, Salz, Pilze, Dominiks,
Schalen, Stein — gelegentlich auch ein Schwert.

## Notizen

Überall in der Welt stehen **📖 zwölf Notizen** herum (Rechtsklick zum Lesen). Sie
erzählen, wie das mit Dominik, den Bennis und dem Fest angefangen hat, und ein paar von
ihnen helfen konkret weiter. Sie liegen dort, wo man ohnehin vorbeikommt: eine gleich am
Startpunkt, je eine neben den drei Dorfplätzen, zwei auf den höchsten Gipfeln, zwei an
den Furten, der Rest verstreut im Grasland. Oben links steht, wie viele du gelesen hast.

## Die Welt

Aus einer festen Zufallsformel entsteht eine Landschaft von **121 × 121 Blöcken** — bei
jedem Start dieselbe, kein Speicherstand nötig.

- **Berge** bis 25 Blöcke hoch, ab 9 Fels, ab 18 Schnee.
- **Zwei Flüsse** durch Westen und Norden, mit Sandufern und Furten.
- **Wälder** in zusammenhängenden Gebieten; an manchen Bäumen hängen **🍑 Dominiks**,
  im Schatten stehen **🍄 Pilze**.
- **Drei Dörfer** aus je vier Häuschen um einen gepflasterten Platz.
- **16 Truhen**, drei davon in Dörfern; **12 Notizen** zum Lesen.
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
