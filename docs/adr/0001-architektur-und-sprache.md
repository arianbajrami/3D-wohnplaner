# ADR 0001: Architektur, Plattform und Programmiersprache

- Status: vorgeschlagen
- Datum: 2026-11-06

## Kontext

- Nutzer: zwei Personen (Paar), kein Produkt, keine Accounts, keine Skalierung.
- UX: zuerst schnelle 2D-Planung, 3D erst wenn ein Raum steht.
- Leitprinzip: foto-agnostisch. Das kanonische Grundriss-Modell (JSON) ist die Single Source of Truth.
- Vision-Modell für den Foto-Import: Claude.
- AWS steht zur Verfügung, ist aber keine Pflicht.

## Entscheidung

### Plattform

Web-App (PWA): Sie läuft auf Laptop, Tablet und Handy, ohne Installation. AR kommt später optional über WebXR.

### Sprache und Stack

Alles in **TypeScript**, als Monorepo (pnpm workspaces):

```
packages/
  model/       Schema (zod → JSON Schema), Geometrie, Flächenberechnung, Migrationen
  editor-2d/   2D-Editor (SVG), Foto optional als entzerrter Hintergrund
  scene-3d/    3D aus dem Modell (three.js / react-three-fiber)
  app/         UI (React + Vite), Varianten, Speichern
plans/         Grundriss-Modelle als JSON (versioniert in Git)
```

Einen eigenen Python-Dienst gibt es vorerst nicht (siehe Import).

### Modell

- Wände bilden einen Graphen: Knoten (x, y in Metern) und Wände zwischen Knoten, jeweils mit Stärke, Höhe und Typ.
- Öffnungen hängen an einer Wand und haben einen Abstand vom Startknoten, Breite, Höhe, Brüstung und Anschlag.
- Räume sind Polygone und dürfen den Status „zählt nicht zur Wohnfläche“ haben (z. B. das Treppenhaus im 1. OG).
- `schemaVersion` steht im Wurzelobjekt. Migrationen laufen als reine Funktionen `vN → vN+1`.
- Varianten sind Schichten (Oberflächen, Möbel) über dem Grundmodell und keine Kopien. Korrekturen am Grundriss wirken dadurch in allen Varianten.

### Foto-Import mit Claude

Der Import ist ein austauschbarer Adapter: Bild rein, Modell-JSON plus Unsicherheiten raus. Er wird in zwei Stufen gebaut:

1. **Jetzt:** Claude (Claude Code) liest das Foto, erzeugt das Modell-JSON in `plans/` und gleicht es gegen die m²-Angaben und Maßketten ab. Danach wird es im 2D-Editor über dem Foto geprüft und korrigiert. Dafür braucht es keine Infrastruktur und keinen API-Schlüssel. Bei einer Handvoll Grundrissen reicht das völlig.
2. **Später, bei Bedarf:** Ein Import-Knopf in der App ruft die Claude API über eine kleine Serverless-Funktion auf, z. B. eine AWS Lambda mit Function URL. Der API-Schlüssel darf nie im Browser liegen. Die Kosten sind getrennt vom Claude-Abo und liegen bei wenigen Cent pro Bild.

Klassische CV (OpenCV) kommt erst dazu, wenn Claude allein nicht präzise genug ist, z. B. um Wandkanten pixelgenau zu finden. Die 4-Punkt-Entzerrung und die Maßstabskalibrierung laufen im Browser und dienen ohnehin dem Overlay.

### Speichern und Teilen

- Stufe 1: lokal im Browser (IndexedDB) plus JSON-Export/-Import. Pläne leben zusätzlich in Git.
- Stufe 2 (wenn beide parallel planen wollen): ein gemeinsamer Speicher, z. B. S3-Bucket + Lambda mit einem geteilten Geheimnis. Einfache Konfliktregel: letzte Änderung pro Variante gewinnt.

### Hosting

Statische Seite. Optionen: AWS S3 + CloudFront, Cloudflare Pages oder Netlify (kostenlos). GitHub Pages geht bei privatem Repo nur mit einem kostenpflichtigen Plan.

### Möbel und Farben

- Möbel zuerst als parametrische Quader mit echten Maßen, glTF-Modelle später.
- Farben: RAL Classic (Farbwerte frei verfügbar). NCS ist lizenzpflichtig und deshalb vorerst nicht dabei.

## Verworfene Alternativen

- **Unity/Godot:** Im Web schwerfällig, für extrudierte Wände und Möbel überdimensioniert.
- **Native iOS (Swift, RoomPlan):** Bindet die App an eine Plattform. RoomPlan scannt Räume, liest aber keine Pläne.
- **Flutter:** Die 3D-Unterstützung ist schwach.
- **Python-Backend von Anfang an:** Mit Claude als Vision-Modell nicht nötig.

## Konsequenzen

- Es gibt nur eine Sprache und eine Modell-Implementierung, die von Editor, 3D und Import gemeinsam genutzt wird.
- Für Stufe 1 ist kein Server nötig.
- Bei einer neuen Wohnung läuft der Import anfangs über eine Claude-Code-Session statt über einen Knopf in der App.
