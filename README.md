# 🌳 ErnteDominiksFest — Klötzchen-Edition

Ein satirisches Plantagenspiel in **Ego-Perspektive**, gebaut fürs **Handy im Querformat**.
Die Welt besteht aus Blöcken: du hackst Holz im Wald, klopfst Stein im Steinbruch, baust
dir an der Werkbank Werkzeug — und züchtest Bäume, an denen **Dominik-Köpfe** als Frucht
hängen.

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

Stell dich vor einen Baum, einen Felsen, eine Station oder eine Person — rechts unten
erscheinen die möglichen Aktionen.

## Einstieg

Kein Textblock zum Auswendiglernen: das Spiel führt dich durch **sieben kurze Aufgaben**
(pflanzen → gießen → Holz hacken → Stein klopfen → ernten → verkaufen → bauen). Oben steht
immer, was als Nächstes dran ist, ein ⭐ zeigt den Weg. **Solange das Tutorial läuft,
steht die Uhr still** — erst danach beginnt der Countdown.

## Ziel

**450 € Umsatz bis zum Ende von Tag 10.** Was du im Laden wieder ausgibst, zählt weiter
für die Festkasse — investieren lohnt sich also. Danach gibt es einen Endlos-Modus.

Der Druck kommt vom Laufweg: Gießkanne (begrenzte Ladungen, am Brunnen nachfüllen),
Erntekorb (begrenzte Tragekraft, am Feststand leeren), Blattläuse mit Countdown, kurze
Erntefenster und ein schwankender Dominik-Preis. Jeder Tag wird härter.

## Rohstoffe & Werkbank

| Ressource | Woher |
|---|---|
| 🪵 Holz | Waldbäume hacken (wachsen nach) |
| 🪨 Stein | Felsen im Steinbruch abklopfen |
| 🍑 Dominik | vom eigenen Baum ernten |

An der **Werkbank** entstehen daraus Samen, Blattlaus-Spray, Kompost, größere Gießkanne,
Erntekorb, Schere und Stiefel. Im **Laden** bei Manni gibt es gegen Geld Samen, Bio-Samen
und Spray; **freie Beete** kaufst du draußen direkt am Schild.

## Dateien

- `index.html` + `game.js` — das 3D-Spiel (three.js, lokal unter `vendor/`, MIT)
- `2d.html` — die frühere 2D-Version mit Auftragswarteschlange für drei Arbeiter
- `*.png` — die Charaktere und Dominik als Frucht
