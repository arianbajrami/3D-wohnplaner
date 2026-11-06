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

Das Foto ist absichtlich ein guter Härtetest: schräg aufgenommen, Schattenwurf,
Papier nicht plan. Wenn der Import damit klarkommt, kommt er mit sauberen Scans erst recht klar.
Die angegebenen m²-Werte dienen als Kontrolle für die erkannten Raumpolygone.

## Offene Punkte

- [ ] Technische Architektur (Plattform, 3D-Engine, Erkennungs-Pipeline) – wird separat diskutiert
- [ ] Format des Grundriss-Modells festlegen (Schema + Versionierung)
- [ ] Erkennungsansatz für Fotos: klassisches CV, ML-Modell, Vision-LLM oder Mischung
- [ ] Wo läuft die App: Web, Mobile, Tablet, AR?
- [ ] Woher kommen Möbelmodelle und Farbpaletten?
- [ ] Referenzfall 1. OG einmal manuell als Modell erfassen (Ground Truth für den Import)

## Struktur

```
docs/      Konzepte, Architekturentscheidungen (folgt)
samples/   Beispiel-Grundrisse zum Testen des Imports
```
