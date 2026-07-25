# 🌳 ErnteDominiksFest — Klötzchen-Survival

Ein satirisches Minecraft-artiges Spiel in **Ego-Perspektive**, gebaut fürs **Handy im
Querformat**. Die Welt besteht aus Blöcken: du hackst Holz, klopfst Stein, **setzt und
baust Blöcke ab**, baust an der Werkbank Werkzeug und züchtest Bäume, an denen
**Dominik-Köpfe** als Frucht hängen.

Um die Plantage herum liegt eine **erzeugte Landschaft** aus Bergen, Flüssen, Wäldern
und Dörfern — 121 × 121 Blöcke, bei jedem Start dieselbe.

**Kein Zeitdruck, kein Game Over.** Das Ziel ist einfach: möglichst viele Dominiks
verkaufen. Vom Geld kaufst du Waffen, Rüstung und einen Traktor — denn **nachts kommen
die Bennis**.

## Spielen

Das Spiel braucht einen **Webserver** (ES-Module und Texturen lassen sich nicht per
`file://` laden). Also entweder über GitHub Pages veröffentlichen oder lokal:

```bash
python3 -m http.server 8000
# dann http://localhost:8000/ im Browser öffnen
```

## Steuerung

| | Handy | Desktop |
|---|---|---|
| Laufen | links wischen (Joystick) | `WASD` / Pfeiltasten, `Shift` rennen |
| Umsehen | rechts wischen | Maus |
| Aktionen | Buttons rechts unten antippen | `E`, `1`–`4` |
| Zuschlagen | roter Knopf rechts | `F` oder Mausklick |
| Baustoff wechseln | Platz in der Inventarleiste antippen | `B` |
| Inventar | 🎒 oben rechts | `I` |
| Aussteigen | Aktion am Traktor | `R` |
| Pause | ⏸️ oben rechts | `P` |

Auf dem Bildschirm liegen nur noch drei Knöpfe: 🎒 Inventar, ⏸️ Pause und der
Angriffsknopf, der nur auftaucht, wenn Bennis unterwegs sind. Alles andere läuft
über das Fadenkreuz und die Inventarleiste.

## Tag

Bäume pflanzen, gießen, schneiden, spritzen, ernten — und im Dorf verkaufen. Das
Gärtnern ist entspannt: eine volle Gießkanne hält **gut drei Minuten**, ein Baum
vertrocknet erst nach **über vier Minuten** Vernachlässigung, und **Blattläuse fressen
nur die Ernte** statt den Baum zu töten.

Im Dorf liegen **Laden, Feststand, Werkbank und Brunnen dicht beieinander** — Manni
verkauft, Jannes kauft deine Ernte (Dominiks zum Tagespreis, Basketbälle für 6 €).

## Nacht

Ab der Dämmerung tauchen **Bennis** auf und rempeln dich um. Stirbst du, wachst du beim
Laden auf und verlierst die Hälfte deiner getragenen Dominiks — mehr passiert nicht.

| Gegenmittel | Wirkung |
|---|---|
| 🔥 Fackeln | in ihrem Umkreis spawnen keine Bennis |
| 🏏 Knüppel / ⚔️ Schwert | Nahkampf, Schwert tötet in 2 Treffern |
| 🔫 Dominik-Kanone | Fernkampf — verschießt deine Dominiks als Munition |
| 🪖 Helm / 🦺 Warnweste | weniger Schaden |
| 🚜 Traktor | doppelt so schnell und überfährt Bennis einfach |

Erledigte Bennis lassen 🏀 Basketbälle fallen, die Jannes dir abkauft.

## Rohstoffe & Werkbank

| Ressource | Woher |
|---|---|
| 🪵 Holz | Waldbäume hacken (wachsen nach) |
| 🪨 Stein | Felsen im Steinbruch abklopfen |
| 🍑 Dominik | vom eigenen Baum ernten |

An der Werkbank entstehen daraus Samen, Fackeln, Knüppel, Steinschwert, Spray, Kompost
sowie Gießkanne, Erntekorb, Schere und Stiefel — meist günstiger als im Laden.

## Die Welt

Rings um die Plantage erzeugt das Spiel aus einer festen Zufallsformel eine Landschaft
von **121 × 121 Blöcken** — sie sieht bei jedem Start gleich aus, kein Speicherstand
nötig.

- **Berge** bis 25 Blöcke Höhe, ab 9 Fels, ab 18 Schnee. Du läufst sie hoch: **eine
  Stufe pro Schritt** ist begehbar, steilere Kanten sind Wand.
- **Zwei Flüsse** ziehen durch Westen und Norden, mit Sandufern. Tiefes Wasser hält
  dich auf — aber jeder Fluss hat **Furten**, an denen du hinüberwatest. Wo keine ist,
  hilft eine selbst gebaute **Brücke**.
- **Wälder** stehen in zusammenhängenden Gebieten auf ebenem Grasland, nicht als
  Streusel über die Karte.
- **Drei Dörfer** aus je vier Häuschen um einen gepflasterten Platz. Sie stehen auf
  eingeebneten Terrassen, damit nichts schwebt.

Die **Plantage samt Dorfkern liegt in einem flachen Tal** — dort ändert sich nichts,
Beete und Wege sind wie gehabt. Rund 95 % der Karte sind zu Fuß erreichbar.

Der Boden wird nicht als Würfel gezeichnet, sondern **chunkweise als sichtbare
Flächen**: von einer Geländesäule sieht man fast nur die Oberseite, das spart rund
drei Viertel der Dreiecke.

## Bauen und Abbauen

Holz und Stein wandern nicht nur in die Werkbank: **überall in der Welt setzt du daraus
Blöcke**. Visier den Boden oder einen gesetzten Block an — „Block setzen" baut an der
angepeilten Seite an, „Block abbauen" holt ihn wieder weg und **gibt das Material
vollständig zurück**. Der letzte Hotbar-Platz zeigt den gewählten Baustoff und wie viele
davon dein Vorrat noch hergibt.

| Baustoff | Kosten |
|---|---|
| 🟫 Bretter | 1 🪵 |
| 🟤 Stamm | 2 🪵 |
| ⬜ Steinblock | 1 🪨 |
| 🧱 Mauerstein | 1 🪨 + 1 🪵 |

Gestapelt wird **fünf Blöcke über dem Gelände**, egal ob im Tal oder auf einem Berg.
Blöcke brauchen Anschluss an den Boden, an einen Nachbarblock oder an eine Felswand —
frei in der Luft schwebt nichts. Auf Beeten, in Gebäuden und da, wo du gerade stehst,
lässt sich nichts setzen.

**Ein Block ist eine Stufe, zwei sind eine Wand.** Auf einen einzelnen Block steigst du
hinauf; ab zwei Blöcken hält die Mauer dich auf — und die Bennis auch. Eine Mauer um die
Plantage ist damit eine echte Alternative zu Fackeln und Schwert. Über Wasser gebaut
wird daraus eine Brücke ans andere Ufer.

## Inventar

Unten liegt die **Inventarleiste**: links die Vorräte (Kanne, Ernte, Samen, Holz, Stein,
Fackeln), rechts die vier Baustoffe. Ein Tipp auf einen Baustoff-Platz wählt ihn aus,
der aktive ist gelb umrandet; die Zahl sagt, wie viele davon dein Material noch hergibt.

Der 🎒-Knopf oben rechts öffnet das **volle Inventar** mit allen Beständen, Rohstoffen
und der Ausrüstung. Dort wählst du auch **Baustoff und Waffe** direkt aus.

## Einstieg

Sieben kurze Aufgaben führen durch den Kreislauf (pflanzen → gießen → Holz → Stein →
ernten → verkaufen → bauen). Oben steht, was dran ist, ein ⭐ zeigt den Weg. Solange das
Tutorial läuft, tauchen **keine Bennis** auf.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `*.png` — die Charaktere und Dominik als Frucht
