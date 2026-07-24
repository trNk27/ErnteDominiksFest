# 🌳 ErnteDominiksFest 3D

Ein satirisches Plantagenspiel in **Ego-Perspektive**, gebaut fürs **Handy im Querformat**.
Du bewirtschaftest die Dominik-Plantage allein: Bäume pflanzen, gießen, schneiden,
spritzen — und die reifen **Dominiks** ernten, bevor sie matschig vom Baum fallen.

**Manni**, **Jannes** und **Benni** stehen als Figuren in der Welt: Manni führt den Laden,
Jannes kauft dir am Feststand die Ernte ab, Benni läuft über den Acker und kommentiert
die Lage – helfen tut er eher nicht.

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
| Aktionen | Buttons rechts unten antippen | `E` (Hauptaktion), `1`–`4` |
| Pause | ⏸️ oben rechts | `P` |

Stell dich vor einen Baum, eine Station oder eine Person — rechts unten erscheinen die
möglichen Aktionen. Symbole über den Bäumen (💧 ✂️ 🪲 🧺 ⏳) zeigen, was fehlt; Pfeile
am Bildrand weisen zu Bäumen außerhalb des Blickfelds.

## Ziel

**450 € Umsatz bis zum Ende von Tag 10.** Was du im Laden wieder ausgibst, zählt weiter
für die Festkasse — investieren lohnt sich also. Danach gibt es einen Endlos-Modus.

Der Druck kommt vom Laufweg: Gießkanne (nur begrenzt Ladungen, am Brunnen nachfüllen),
Rucksack (begrenzte Tragekraft, am Feststand leeren), Blattläuse mit Countdown,
kurze Erntefenster und ein schwankender Dominik-Preis. Jeder Tag wird härter.

## Dateien

- `index.html` + `game.js` — das 3D-Spiel (three.js, lokal unter `vendor/` abgelegt, MIT)
- `2d.html` — die frühere 2D-Version mit Auftragswarteschlange für drei Arbeiter
- `*.png` — die Charaktere und Dominik als Frucht
