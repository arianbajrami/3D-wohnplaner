# ADR 0002: Speichern, Varianten und Abgleich zwischen zwei Personen

- Status: angenommen
- Datum: 2026-11-06

## Kontext

- Zwei Personen (Arian und Leni) planen, jeweils auf dem eigenen Rechner (`npm run dev`).
- Beide wollen eigene Varianten anlegen und die des anderen sehen und vergleichen.
- Es soll kein Server und kein Konto nötig sein. Git und GitHub sind bereits vorhanden.
- Vorschlag war: ein Branch pro Person.

## Entscheidung

### Ein Branch, eine Datei pro Variante und Person

```
plans/1og.json                          Grundriss (gemeinsam, gilt für alle Varianten)
designs/1og/arian/kueche-landhaus.json  Variante von Arian
designs/1og/leni/kueche-modern.json     Variante von Leni
```

- **Grundriss und Gestaltung sind getrennt:** Eine Variante enthält nur die Gestaltung (Böden, Wandfarben, Akzentwände, Möbel), siehe `packages/model/src/variant.ts`. Korrekturen am Grundriss wirken damit auf alle Varianten.
- **Jede Person schreibt nur in ihren eigenen Ordner:** Fremde Varianten öffnet man, speichert sie aber als eigene Kopie. Dadurch gibt es beim Abgleich praktisch keine Konflikte.
- **Keine Branches pro Person:** Mit zwei Branches sähe man die Varianten des anderen erst nach einem Merge. Beim Merge entstünden außerdem Konflikte in derselben JSON-Datei. Ordner pro Person erreichen die gewünschte Trennung ohne diese Nachteile.

### Speichern über den lokalen Vite-Server

`apps/web/storage-plugin.ts` erweitert `npm run dev` um eine kleine API:

| Methode | Pfad | Zweck |
|---|---|---|
| GET/PUT | `/api/plans/:plan` | Grundriss lesen/schreiben |
| GET | `/api/designs/:plan` | alle Varianten aller Personen |
| PUT/DELETE | `/api/designs/:plan/:person/:id` | eine Variante speichern/löschen |
| GET | `/api/git/status` | ungesicherte Dateien, ahead/behind |
| POST | `/api/git/sync` | `add` → `commit` → `pull --rebase --autostash -X theirs` → `push`, nur `plans/` und `designs/` |

- Namen sind auf `[a-z0-9-]` beschränkt (kein `../`).
- **Konflikte:** Bei Konflikten gewinnt der Stand, der gerade hochgeladen wird („last write wins“). Konflikte entstehen praktisch nur, wenn dieselbe Person dieselbe Datei auf zwei Geräten geändert hat. Nicht überlappende Änderungen werden normal zusammengeführt. Schlägt das Holen trotzdem fehl, wird der Rebase abgebrochen, das Repo bleibt also nie halbfertig stehen.
- Dateien werden atomar geschrieben (zuerst eine temporäre Datei, dann umbenennen).
- **Ohne Server** (statisch gehostet) speichert die App Varianten nur im Browser.

### Entwurf im Browser

Der Arbeitsstand wird laufend im Browser gesichert. Ein Neuladen oder Absturz verliert also nichts. „● ungespeichert“ zeigt den Unterschied zur gespeicherten Variante bzw. zum Grundriss.

## Konsequenzen

- **Einmalige Einrichtung bei Leni:** Repo klonen, GitHub-Zugang als Collaborator und `git config user.name/email`.
- **Synchronisieren pusht direkt auf den aktuellen Branch (`main`):** Das ist für zwei Personen gewollt, aber kein Review-Prozess.
- **Netzwerk:** `npm run dev:lan` macht die API im WLAN erreichbar. Wer im selben Netz ist, kann dann speichern und synchronisieren. Für zu Hause ist das in Ordnung, in fremden Netzen sollte man es nicht nutzen.

## Ausblick: Stil per Freitext

Der lokale Server ist auch der richtige Ort für die spätere Anbindung an Claude: Der API-Schlüssel liegt dann in einer `.env`-Datei auf dem eigenen Rechner (`.env` steht in `.gitignore`). Der Browser schickt nur den Freitext und den Raum, der Server fragt Claude und bekommt Oberflächen-IDs aus dem Katalog zurück. Eine Lambda (siehe ADR 0001) braucht es erst, wenn die App einmal öffentlich gehostet wird.

## Später, falls nötig

- **Nutzung ohne lokalen Rechner (z. B. nur iPad):** gehostete App plus Speicher in S3 oder einer kleinen Datenbank. Das Format der Varianten-Dateien bleibt gleich.
