# 🌳 ErnteDominiksFest — Klötzchen-Survival

Ein satirisches Minecraft-artiges Spiel in **Ego-Perspektive**, gebaut fürs **Handy im
Querformat**. Die Welt besteht aus Blöcken: du hackst Holz, klopfst Stein, baust an der
Werkbank Werkzeug und züchtest Bäume, an denen **Dominik-Köpfe** als Frucht hängen.

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
| Aussteigen | Knopf oben rechts | `R` |
| Pause | ⏸️ oben rechts | `P` |

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

## Einstieg

Sieben kurze Aufgaben führen durch den Kreislauf (pflanzen → gießen → Holz → Stein →
ernten → verkaufen → bauen). Oben steht, was dran ist, ein ⭐ zeigt den Weg. Solange das
Tutorial läuft, tauchen **keine Bennis** auf.

## Dateien

- `index.html` + `game.js` — das Spiel (three.js, lokal unter `vendor/`, MIT)
- `*.png` — die Charaktere und Dominik als Frucht
