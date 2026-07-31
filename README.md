# ⛏️ ErnteDominiksFest — Klötzchen-Survival

Ein Minecraft-artiges Survival-Spiel in **Ego-Perspektive**, im Browser, ohne Installation.
Die Welt besteht aus Blöcken: du **baust sie ab** (linke Maustaste), **setzt sie wieder**
(rechte Maustaste), stellst dir an der Werkbank Werkzeug her und hältst nachts die
**Bennis** aus. Kein Punktestand, keine Aufgabenliste — nur überleben.

**Ziel:** In **🧰 Truhen** überall in der Welt liegen vier Seiten eines alten Kochbuchs.
Zusammen ergeben sie das Rezept der **🍲 Dominik-Suppe**. Wer sie kocht, hat gewonnen.

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
| **Rechte Maustaste** | Block setzen · Truhe/Werkbank/Kochtopf benutzen · Essen |
| `E` | Inventar mit Bauliste |
| `1`–`9` / Mausrad | Platz in der Inventarleiste wählen |
| `P` | Pause |

Eine Stufe steigst du automatisch hoch, ab zwei Blöcken ist es eine Wand — für dich
wie für die Bennis.

## Überleben

- **❤️ Leben** — Bennis schlagen zu, tiefe Stürze und Hunger auch. Bei 0 wachst du am
  Startpunkt wieder auf und behältst dein Zeug.
- **🍗 Hunger** — läuft langsam leer. Iss 🍑 Dominiks, 🍄 Pilze oder die fertige Suppe
  (rechte Maustaste mit dem Essen in der Hand). Ist der Balken voll, heilst du dich
  langsam selbst; ist er leer, kostet es Leben.
- **🌙 Nacht** — ab der Dämmerung tauchen Bennis auf. **🔥 Fackeln** halten sie in weitem
  Umkreis fern, ein ⚔️ Steinschwert räumt auf, eine zwei Blöcke hohe Mauer auch.

## Abbauen und Bauen

Linke Maustaste **halten**, bis der Balken unterm Fadenkreuz voll ist — dann fällt der
Block ins Inventar. Mit dem passenden Werkzeug geht es rund dreimal so schnell, Stein
ohne 🪓/⛏️ dagegen zäh.

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

## Bauliste

`E` öffnet Inventar und Bauliste. Die einfachen Sachen gehen überall, alles Weitere
braucht eine gesetzte **🛠️ Werkbank** (Rechtsklick darauf), die Suppe einen aufgestellten
**🍲 Kochtopf**.

| Ergebnis | Zutaten | Wo |
|---|---|---|
| 🟧 Bretter ×4 | 1 🪵 | überall |
| 🥢 Stock ×4 | 2 🟧 | überall |
| 🛠️ Werkbank | 4 🟧 | überall |
| 🔥 Fackel ×4 | 2 🥢 + 1 🪨 | überall |
| 🥣 Schale ×2 | 3 🟧 | Werkbank |
| ⛏️ Spitzhacke | 3 🪨 + 2 🥢 | Werkbank |
| 🪓 Axt | 3 🪨 + 2 🥢 | Werkbank |
| ⚔️ Steinschwert | 2 🪨 + 1 🥢 | Werkbank |
| 🧱 Ziegel ×4 | 2 🪨 + 2 🟨 | Werkbank |
| 🍲 Kochtopf | 6 🪨 + 1 🟧 | Werkbank |
| **🍲 Dominik-Suppe** | 1 🥣 + 3 🍑 + 2 🍄 + 1 🧂 | Kochtopf, Rezept nötig |

## Das Rezept

Die vier Kochbuchseiten liegen in Truhen. **Zwei stecken in Dorftruhen** — Dörfer sieht
man von weitem, damit ist der Einstieg sicher. Die anderen beiden liegen irgendwo
draußen; oben links steht, wie viele du schon hast. Erst mit allen vier tauchen Rezept
und Zutatenliste in der Bauliste auf.

Truhen enthalten außerdem Vorräte: Bretter, Stöcke, Fackeln, Salz, Pilze, Dominiks,
Schalen, Stein — gelegentlich auch ein Schwert.

## Die Welt

Aus einer festen Zufallsformel entsteht eine Landschaft von **121 × 121 Blöcken** — bei
jedem Start dieselbe, kein Speicherstand nötig.

- **Berge** bis 25 Blöcke hoch, ab 9 Fels, ab 18 Schnee.
- **Zwei Flüsse** durch Westen und Norden, mit Sandufern und Furten.
- **Wälder** in zusammenhängenden Gebieten; an manchen Bäumen hängen **🍑 Dominiks**,
  im Schatten stehen **🍄 Pilze**.
- **Drei Dörfer** aus je vier Häuschen um einen gepflasterten Platz.
- **16 Truhen**, drei davon in Dörfern.
- Rund um den Startpunkt liegt ein **flaches Tal** ohne Bäume — Platz zum Bauen.

Gezeichnet wird nicht Würfel für Würfel, sondern **chunkweise nur die freiliegenden
Flächen**. Ein abgebauter oder gesetzter Block vernetzt genau seinen Chunk neu, nicht
die ganze Welt.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `*.png` — die Charaktere und Dominik als Frucht
