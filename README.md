# 3D-Wohnplaner

Eine App, mit der man eine Wohnung aus ihrem Grundriss in 3D aufbaut und sie dann
virtuell einrichtet: Möbel stellen, Wände streichen, Böden tauschen, Varianten vergleichen –
bevor man auch nur einen Pinsel in die Hand nimmt.

Erster echter Anwendungsfall ist die Wohnung im 1. OG (Familienhaus), deren Grundriss als
Foto in [`samples/grundriss-1og-foto.jpeg`](samples/grundriss-1og-foto.jpeg) liegt.

---

## Grundidee

1. **Grundriss rein** – z. B. ein Handyfoto eines ausgedruckten Plans.
2. **Strukturiertes Modell raus** – Wände, Türen, Fenster, Räume mit echten Maßen in Metern.
3. **Prüfen & korrigieren** – das erkannte Modell wird in 2D über dem Original angezeigt und lässt sich von Hand nachjustieren.
4. **3D erzeugen** – aus dem Modell wird automatisch eine begehbare 3D-Szene extrudiert.
5. **Einrichten & gestalten** – Möbel platzieren, Wände bemalen, Böden wählen, Licht ansehen.
6. **Varianten speichern** – mehrere Einrichtungs- und Farbkonzepte pro Wohnung anlegen und vergleichen.

## Leitprinzip: foto-agnostisch

Das Foto ist **nur eine mögliche Quelle**, nicht die Grundlage der App.

```
  Eingabequellen                Kern                         Darstellung
 ┌────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
 │ Foto / Scan    │──┐  │                      │     │ 2D-Editor            │
 │ PDF / CAD      │──┼─▶│  Grundriss-Modell    │────▶│ 3D-Szene             │
 │ Manuell zeichnen│─┘  │  (kanonisch, in m)   │     │ Einrichtung/Material │
 └────────────────┘     └──────────────────────┘     └──────────────────────┘
        Importer              Single Source              kennen nur das
     (austauschbar)             of Truth                   Modell
```

- Alles nach dem Import arbeitet **ausschließlich** mit dem Grundriss-Modell – das 3D weiß nichts vom Foto.
- Importer sind austauschbare Adapter: Foto heute, PDF/DXF/IFC oder ein manueller Editor morgen.
- Das Modell ist ein offenes, versionierbares Format (z. B. JSON), damit man es auch ohne Foto anlegen, bearbeiten und teilen kann.
- Das Foto bleibt optional als Hintergrund-Referenz zum Abgleichen erhalten.

### Was das Grundriss-Modell mindestens beschreibt

| Element    | Inhalt (Entwurf) |
|------------|------------------|
| Wände      | Start-/Endpunkt, Stärke, Höhe, Typ (Außen-/Innenwand) |
| Öffnungen  | Tür/Fenster, Position auf der Wand, Breite, Höhe, Brüstung, Öffnungsrichtung |
| Räume      | Polygon, Name, Fläche (berechnet), Bodenbelag |
| Oberflächen| Wandfarbe/Tapete je Wandseite, Bodenmaterial, Decke |
| Einrichtung| Möbel mit Typ, Maßen, Position, Rotation |
| Meta       | Einheit, Maßstab, Geschoss, Quelle (Foto/manuell/…) |

## Features (Zielbild)

**Import**
- Foto eines Grundrisses hochladen, Perspektive/Schräglage korrigieren
- Maßketten nutzen, um den Maßstab zu bestimmen (bekannte Länge = echte Meter)
- Wände, Türen, Fenster und Raumflächen erkennen – mit manueller Korrektur

**3D & Gestaltung**
- 3D-Ansicht von oben (Puppenhaus) und in Augenhöhe zum Durchlaufen
- Wände einzeln bemalen (Farbcodes, z. B. RAL/NCS), Tapeten, Akzentwände
- Bodenbeläge pro Raum (Parkett, Fliesen, Vinyl …)
- Möbel aus einer Bibliothek mit echten Maßen platzieren, drehen, verschieben
- Kollisions- und Abstandshinweise (passt das Sofa? geht die Tür noch auf?)

**Planung**
- Mehrere Varianten pro Wohnung, Vorher/Nachher-Vergleich
- Flächen- und Maßübersicht je Raum
- Export als Bilder/Screenshots zum Teilen

## Nicht-Ziele (vorerst)

- Keine Statik, keine Bau- oder Genehmigungsplanung
- Kein vollwertiges CAD/BIM-Werkzeug
- Keine fotorealistische Render-Engine als Pflicht

## Referenzfall: 1. OG

Aus dem Plan in `samples/`:

- Wohnung Ost: **101,4 m²**
- Wohnung West: **68,2 m²**
- Gesamt 1. OG: **169,6 m²**
- Raumflächen zwischen 6,3 m² und 25,4 m², Maßketten außen und innen vorhanden

Zuordnung (im Foto): **Wohnung Ost** ist die linke Hälfte mit 7 Räumen (Zimmer 20,7 / 14,7 / 19,7 / 9,6 / 19,
Flur 11 und Raum 6,7), **Wohnung West** die rechte Hälfte mit 5 Räumen (Zimmer 20,7 / 7,3 / 25,4, Flur 8,5 und Raum 6,3).
Dazwischen liegt das Treppenhaus (6,93 m lang), das zu keiner Wohnung zählt. Das Modell liegt in
[`plans/1og.json`](plans/1og.json) und trifft alle Plan-Flächen auf unter 2 %.

Das Foto ist absichtlich ein guter Härtetest: schräg aufgenommen, Schattenwurf,
Papier nicht plan. Wenn der Import damit klarkommt, kommt er mit sauberen Scans erst recht klar.
Die angegebenen m²-Werte dienen als Kontrolle für die erkannten Raumpolygone.

## Offene Punkte

- [x] Technische Architektur → [ADR 0001](docs/adr/0001-architektur-und-sprache.md): Web-App, TypeScript, three.js
- [x] Format des Grundriss-Modells: Schema v1 in [`packages/model`](packages/model/src/schema.ts)
- [x] Erkennungsansatz für Fotos: Claude als Vision-Modell (vorerst direkt über Claude Code)
- [x] Referenzfall 1. OG als Modell erfasst: [`plans/1og.json`](plans/1og.json)
- [ ] Türanschläge (Öffnungsrichtung) im Modell nachtragen
- [x] Möbel platzieren, Wandfarben (RAL), Bodenbeläge, Stilvorlagen (erste Version)
- [ ] Varianten speichern und vergleichen
- [ ] Stil per Freitext („Landhausküche mit …“) über Claude
- [ ] Detailliertere Möbelmodelle (glTF) zusätzlich zu den parametrischen

## Lokal starten

Die App läuft vorerst nur auf dem eigenen Rechner unter `localhost`. Es gibt keinen Server und kein Konto.
Änderungen speichert der Browser.

**Einmalig einrichten**

1. [Node.js](https://nodejs.org/) in der LTS-Version installieren (mindestens 20.19 oder 22.12).
   Prüfen mit `node -v`.
2. [Git](https://git-scm.com/) installieren, falls noch nicht vorhanden. Unter macOS ist es meist schon da.
3. Das Repo klonen. Es ist privat, deshalb fragt Git nach dem GitHub-Login. Statt des Passworts gibt man ein
   [Personal Access Token](https://github.com/settings/tokens) ein. Einfacher geht es mit
   [GitHub Desktop](https://desktop.github.com/) (*File → Clone repository*) oder der GitHub CLI (`gh auth login`).

   ```bash
   git clone https://github.com/arianbajrami/3D-wohnplaner.git
   ```

   ```bash
   cd 3D-wohnplaner
   ```

4. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

**Starten**

```bash
npm run dev
```

Dann im Browser <http://localhost:5173> öffnen. Beenden mit `Strg+C` im Terminal.

Auf einem anderen Gerät im selben WLAN, z. B. Tablet oder Handy, startet man stattdessen mit
`npm run dev:lan`. Vite zeigt dann eine Adresse wie `http://192.168.x.y:5173` an.

**Aktualisieren** (neue Version holen)

```bash
git pull
```

```bash
npm install
```

**Was die App kann (Stand jetzt)**

- **Ansicht:** ganzes Geschoss, eine Wohnung oder ein einzelner Raum. Doppelklick auf einen Raum zeigt nur
  diesen. Alles andere wird ausgeblendet, auch das Treppenhaus.
- **Einrichten:** Raum anklicken, dann im Katalog Möbel hinzufügen (Wohnen, Essen, Küche, Schlafen, Bad,
  Arbeiten). Im 2D-Plan verschieben, Möbel rasten an Wänden ein. Taste R dreht, Entf löscht. Maße in cm und
  alle Oberflächen (Fronten, Arbeitsplatte, Bezug, Holz …) sind pro Möbel einstellbar.
- **Gestalten:** Boden je Raum (Holz hell/dunkel, Fliesen, Stein, Teppich), Wandfarbe je Raum (RAL oder
  eigene Farbe), einzelne Akzentwände in 3D mit „Wand streichen“.
- **Stilvorlagen:** Landhaus, Skandinavisch, Modern und Industrial setzen Wände, Boden und alle
  Möbeloberflächen eines Raums auf einmal, z. B. Landhausküche mit weißen Fronten und Holz-Arbeitsplatte.
- **3D-Ansicht:** optional als Puppenhaus mit abgeschnittenen Wänden.
- **Grundriss korrigieren:** Wände, Raumecken und die Lage des Originalfotos per Ziehen anpassen, mit
  Rückgängig (Strg/Cmd+Z). Dazu eine Flächenkontrolle gegen die Plan-Werte.
- **Speichern:** Der Browser merkt sich alles. Mit „Exportieren“ entsteht eine JSON-Datei. Um einen Stand
  dauerhaft zu übernehmen, diese Datei nach `plans/` legen und committen.

**Für Entwickler**

```bash
npm test
```

```bash
npm run typecheck
```

## Struktur

```
apps/web/        Web-App (React + Vite): 2D-Editor, 3D-Szene (three.js)
packages/model/  Grundriss-Modell: Schema (zod), Geometrie, Flächen, Homographie, Prüfungen
plans/           Grundriss-Modelle als JSON (Single Source of Truth)
samples/         Original-Grundrisse (Fotos) als Import-Quelle und Hintergrund-Referenz
docs/adr/        Architekturentscheidungen
```
