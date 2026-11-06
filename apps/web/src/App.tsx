import { apartmentAreaChecks, parsePlan, roomAreaChecks, validatePlan } from "@wohnplaner/model";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { apartmentColor, fmtArea, fmtPercent } from "./format";
import { Plan2D, type EditMode } from "./Plan2D";
import { bundledPlans, photoUrlFor } from "./plans";
import { downloadJson, usePlanStore } from "./usePlanStore";

// three.js erst laden, wenn jemand die 3D-Ansicht öffnet
const Scene3D = lazy(() => import("./Scene3D").then((m) => ({ default: m.Scene3D })));

const MODES: { id: EditMode; label: string; hint: string }[] = [
  { id: "view", label: "Ansehen", hint: "Ziehen verschiebt, Mausrad zoomt, Klick wählt einen Raum." },
  { id: "walls", label: "Wände", hint: "Wandknoten ziehen. Rastet auf 1 cm und an anderen Knoten ein." },
  { id: "rooms", label: "Räume", hint: "Raumecken ziehen. Fläche wird live nachgerechnet." },
  { id: "photo", label: "Foto ausrichten", hint: "Die vier Fotopunkte an die passenden Stellen im Plan ziehen." },
];

export function App() {
  const [planKey, setPlanKey] = useState(bundledPlans[0]?.key ?? "");
  const entry = bundledPlans.find((p) => p.key === planKey);
  if (!entry) return <p className="empty">Kein Grundriss in plans/ gefunden.</p>;
  return <Workspace key={entry.key} entryKey={entry.key} original={entry.plan} onSwitch={setPlanKey} />;
}

function Workspace({ entryKey, original, onSwitch }: { entryKey: string; original: typeof bundledPlans[number]["plan"]; onSwitch: (k: string) => void }) {
  const store = usePlanStore(entryKey, original);
  const { plan } = store;
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [mode, setMode] = useState<EditMode>("view");
  const [showPhoto, setShowPhoto] = useState(true);
  const [photoOpacity, setPhotoOpacity] = useState(0.6);
  const [focus, setFocus] = useState("all");
  const [cutaway, setCutaway] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const photoUrl = photoUrlFor(plan);
  const rooms = useMemo(() => roomAreaChecks(plan), [plan]);
  const apartments = useMemo(() => apartmentAreaChecks(plan), [plan]);
  const issues = useMemo(() => validatePlan(plan), [plan]);
  const selected = plan.rooms.find((r) => r.id === selectedRoom);

  const importFile = async (file: File) => {
    try {
      store.setPlan(parsePlan(JSON.parse(await file.text())));
    } catch (e) {
      alert(`Datei konnte nicht gelesen werden:\n${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>3D-Wohnplaner</h1>
        {bundledPlans.length > 1 ? (
          <select value={entryKey} onChange={(e) => onSwitch(e.target.value)}>
            {bundledPlans.map((p) => <option key={p.key} value={p.key}>{p.plan.meta.name}</option>)}
          </select>
        ) : (
          <span className="plan-name">{plan.meta.name}</span>
        )}
        <div className="tabs">
          <button className={view === "2d" ? "active" : ""} onClick={() => setView("2d")}>2D-Plan</button>
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D</button>
        </div>
        <label>
          Fokus{" "}
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="all">ganzes Geschoss</option>
            {plan.apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div className="spacer" />
        <button onClick={store.undo} disabled={!store.canUndo} title="Rückgängig">↶ Rückgängig</button>
        <button onClick={() => confirm("Alle Änderungen verwerfen und den Stand aus plans/ laden?") && store.reset()} disabled={!store.isModified}>
          Zurücksetzen
        </button>
        <button onClick={() => downloadJson(plan, `${entryKey}.json`)} title="Modell als JSON herunterladen">Exportieren</button>
        <button onClick={() => fileInput.current?.click()}>Importieren</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      {view === "2d" && (
        <div className="toolbar">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)} disabled={m.id === "photo" && !photoUrl}>
              {m.label}
            </button>
          ))}
          <span className="hint">{MODES.find((m) => m.id === mode)?.hint}</span>
          <div className="spacer" />
          {photoUrl && (
            <>
              <label><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} /> Foto</label>
              <input type="range" min={0.1} max={1} step={0.05} value={photoOpacity} disabled={!showPhoto} onChange={(e) => setPhotoOpacity(+e.target.value)} />
            </>
          )}
        </div>
      )}
      {view === "3d" && (
        <div className="toolbar">
          <label><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Wände abschneiden (Puppenhaus)</label>
          <span className="hint">Linke Maustaste dreht, rechte verschiebt, Mausrad zoomt. Klick auf einen Boden wählt den Raum.</span>
        </div>
      )}

      <main>
        <section className="canvas">
          {view === "2d" ? (
            <Plan2D
              plan={plan}
              setPlan={store.setPlan}
              checkpoint={store.checkpoint}
              mode={mode}
              photoUrl={photoUrl}
              showPhoto={showPhoto}
              photoOpacity={photoOpacity}
              focus={focus}
              selectedRoom={selectedRoom}
              onSelectRoom={setSelectedRoom}
            />
          ) : (
            <Suspense fallback={<p className="empty">3D wird geladen …</p>}>
              <Scene3D plan={plan} focus={focus} cutaway={cutaway} selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} />
            </Suspense>
          )}
        </section>

        <aside>
          <h2>Flächen</h2>
          <table>
            <thead>
              <tr><th>Raum</th><th>Modell</th><th>Plan</th><th>Abw.</th></tr>
            </thead>
            <tbody>
              {[...plan.apartments.map((a) => a.id), undefined].map((aptId) => {
                const apt = apartments.find((a) => a.id === aptId);
                const list = plan.rooms.filter((r) => r.apartment === aptId);
                if (!list.length) return null;
                return [
                  <tr key={`h-${aptId}`} className="apt-row">
                    <td><span className="swatch" style={{ background: apartmentColor(aptId) }} />{apt?.name ?? "Allgemein"}</td>
                    <td>{apt ? fmtArea(apt.area) : ""}</td>
                    <td>{apt?.target ? fmtArea(apt.target) : ""}</td>
                    <td><Deviation v={apt?.deviation} limit={0.01} /></td>
                  </tr>,
                  ...list.map((r) => {
                    const c = rooms.find((x) => x.id === r.id)!;
                    return (
                      <tr key={r.id} className={r.id === selectedRoom ? "selected" : ""} onClick={() => setSelectedRoom(r.id)}>
                        <td className="indent">{r.name}</td>
                        <td>{fmtArea(c.area, 2)}</td>
                        <td>{c.target ? fmtArea(c.target) : "–"}</td>
                        <td><Deviation v={c.deviation} limit={0.03} /></td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>

          {selected && (
            <div className="room-edit">
              <h2>Raum</h2>
              <label>
                Name
                <input
                  value={selected.name}
                  onFocus={store.checkpoint}
                  onChange={(e) =>
                    store.setPlan({ ...plan, rooms: plan.rooms.map((r) => (r.id === selected.id ? { ...r, name: e.target.value } : r)) }, false)
                  }
                />
              </label>
              <label>
                Wohnung
                <select
                  value={selected.apartment ?? ""}
                  onChange={(e) =>
                    store.setPlan({
                      ...plan,
                      rooms: plan.rooms.map((r) => (r.id === selected.id ? { ...r, apartment: e.target.value || undefined, countsAsLivingArea: !!e.target.value } : r)),
                    })
                  }
                >
                  <option value="">– keine (z. B. Treppenhaus) –</option>
                  {plan.apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
          )}

          {issues.length > 0 && (
            <>
              <h2>Hinweise</h2>
              <ul className="issues">
                {issues.map((i, k) => <li key={k} className={i.level}>{i.message}</li>)}
              </ul>
            </>
          )}

          <h2>Über das Modell</h2>
          <ul className="notes">
            {plan.meta.notes.map((n, i) => <li key={i}>{n}</li>)}
            {store.isModified && <li><strong>Geändert gegenüber plans/{entryKey}.json</strong>: im Browser gespeichert. Mit „Exportieren“ sichern.</li>}
          </ul>
        </aside>
      </main>
    </div>
  );
}

function Deviation({ v, limit }: { v?: number; limit: number }) {
  if (v === undefined) return null;
  return <span className={Math.abs(v) > limit ? "warn" : "ok"}>{fmtPercent(v)}</span>;
}
