import { parsePlan, validatePlan, wallGeometry, wallSideRooms, type Plan, type WallSide } from "@wohnplaner/model";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RAL_COLORS } from "./catalog/materials";
import { AreaTable, FinishPicker, FurniturePanel, RoomPanel } from "./panels";
import { Plan2D, type EditMode } from "./Plan2D";
import { bundledPlans, photoUrlFor } from "./plans";
import type { Selection } from "./selection";
import { downloadJson, usePlanStore } from "./usePlanStore";

// three.js erst laden, wenn jemand die 3D-Ansicht öffnet
const Scene3D = lazy(() => import("./Scene3D").then((m) => ({ default: m.Scene3D })));

const MODES: { id: EditMode; label: string; hint: string }[] = [
  { id: "furnish", label: "Einrichten", hint: "Klick wählt Raum oder Möbel. Möbel ziehen verschiebt (rastet an Wänden ein). Doppelklick zeigt nur den Raum." },
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

function Workspace({ entryKey, original, onSwitch }: { entryKey: string; original: Plan; onSwitch: (k: string) => void }) {
  const store = usePlanStore(entryKey, original);
  const { plan, setPlan } = store;
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [mode, setMode] = useState<EditMode>("furnish");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoOpacity, setPhotoOpacity] = useState(0.6);
  const [focus, setFocus] = useState("all");
  const [cutaway, setCutaway] = useState(true);
  const [painting, setPainting] = useState(false);
  const [paintColor, setPaintColor] = useState(RAL_COLORS.find((c) => c.code === "6021")!.hex);
  const [selection, setSelection] = useState<Selection>();
  const fileInput = useRef<HTMLInputElement>(null);

  const photoUrl = photoUrlFor(plan);
  const issues = useMemo(() => validatePlan(plan), [plan]);
  const selectedRoom = selection?.kind === "room" ? plan.rooms.find((r) => r.id === selection.id) : undefined;
  const selectedFurniture = selection?.kind === "furniture" ? plan.furniture.find((f) => f.id === selection.id) : undefined;

  const focusRoom = (roomId: string) => {
    setFocus(`room:${roomId}`);
    setSelection({ kind: "room", id: roomId });
  };

  /**
   * Streicht eine Wandseite. Wände sind an T-Stößen in Teilstücke geteilt; alle Teilstücke auf
   * derselben Linie, die zum selben Raum zeigen, werden mitgestrichen – so wie man eine Wand streicht.
   */
  const paintWall = (wallId: string, side: WallSide) => {
    const target = plan.walls.find((w) => w.id === wallId);
    if (!target) return;
    const g = wallGeometry(plan, target);
    const room = wallSideRooms(plan, g)[side];
    const updates = new Map<string, WallSide>([[wallId, side]]);
    if (room) {
      for (const w of plan.walls) {
        const g2 = wallGeometry(plan, w);
        const cross = g.dir[0] * g2.dir[1] - g.dir[1] * g2.dir[0];
        const off = (g2.start[0] - g.start[0]) * g.normal[0] + (g2.start[1] - g.start[1]) * g.normal[1];
        if (Math.abs(cross) > 1e-6 || Math.abs(off) > 1e-3) continue;
        const side2: WallSide = g.dir[0] * g2.dir[0] + g.dir[1] * g2.dir[1] > 0 ? side : side === "left" ? "right" : "left";
        if (wallSideRooms(plan, g2)[side2] === room) updates.set(w.id, side2);
      }
    }
    setPlan({
      ...plan,
      walls: plan.walls.map((w) => (updates.has(w.id) ? { ...w, finishes: { ...w.finishes, [updates.get(w.id)!]: paintColor } } : w)),
    });
  };

  // Tastatur: Entf löscht, R dreht, Strg/Cmd+Z macht rückgängig, Esc hebt Auswahl auf
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        store.undo();
      } else if (e.key === "Escape") {
        setSelection(undefined);
        setPainting(false);
      } else if (selectedFurniture && (e.key === "Delete" || e.key === "Backspace")) {
        setPlan({ ...plan, furniture: plan.furniture.filter((f) => f.id !== selectedFurniture.id) });
        setSelection(undefined);
      } else if (selectedFurniture && e.key.toLowerCase() === "r") {
        setPlan({ ...plan, furniture: plan.furniture.map((f) => (f.id === selectedFurniture.id ? { ...f, rotation: (f.rotation + 90) % 360 } : f)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, selectedFurniture, setPlan, store]);

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
          Ansicht{" "}
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="all">Ganzes Geschoss</option>
            {plan.apartments.map((a) => <option key={a.id} value={`apt:${a.id}`}>{a.name}</option>)}
            {[...plan.apartments.map((a) => ({ id: a.id, name: a.name })), { id: undefined, name: "Allgemein" }].map((a) => {
              const rooms = plan.rooms.filter((r) => r.apartment === a.id);
              return rooms.length ? (
                <optgroup key={a.id ?? "-"} label={`Räume – ${a.name}`}>
                  {rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>{r.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        {focus !== "all" && <button onClick={() => setFocus("all")} title="Alles zeigen">✕</button>}
        <div className="spacer" />
        <button onClick={store.undo} disabled={!store.canUndo} title="Rückgängig (Strg/Cmd+Z)">↶ Rückgängig</button>
        <button onClick={() => confirm("Alle Änderungen verwerfen und den Stand aus plans/ laden?") && store.reset()} disabled={!store.isModified}>
          Zurücksetzen
        </button>
        <button onClick={() => downloadJson(plan, `${entryKey}.json`)} title="Modell als JSON herunterladen">Exportieren</button>
        <button onClick={() => fileInput.current?.click()}>Importieren</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      {view === "2d" ? (
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
              <label><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} /> Originalfoto</label>
              <input type="range" min={0.1} max={1} step={0.05} value={photoOpacity} disabled={!showPhoto} onChange={(e) => setPhotoOpacity(+e.target.value)} />
            </>
          )}
        </div>
      ) : (
        <div className="toolbar">
          <label><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Wände abschneiden (Puppenhaus)</label>
          <button className={painting ? "active" : ""} onClick={() => setPainting(!painting)}>🖌 Wand streichen</button>
          {painting && (
            <div className="paint-picker">
              <FinishPicker label="Farbe" value={paintColor} fallback={paintColor} paint onChange={setPaintColor} />
            </div>
          )}
          <span className="hint">
            {painting
              ? "Auf eine Wandseite klicken, um sie zu streichen (Akzentwand). Esc beendet."
              : "Linke Maustaste dreht, rechte verschiebt, Mausrad zoomt. Klick wählt, Doppelklick auf einen Boden zeigt nur den Raum."}
          </span>
        </div>
      )}

      <main>
        <section className={`canvas ${painting && view === "3d" ? "painting" : ""}`}>
          {view === "2d" ? (
            <Plan2D
              plan={plan}
              setPlan={setPlan}
              checkpoint={store.checkpoint}
              mode={mode}
              photoUrl={photoUrl}
              showPhoto={showPhoto}
              photoOpacity={photoOpacity}
              focus={focus}
              selection={selection}
              onSelect={setSelection}
              onFocusRoom={focusRoom}
            />
          ) : (
            <Suspense fallback={<p className="empty">3D wird geladen …</p>}>
              <Scene3D
                plan={plan}
                focus={focus}
                cutaway={cutaway}
                selection={selection}
                onSelect={setSelection}
                onFocusRoom={focusRoom}
                paint={painting ? paintColor : undefined}
                onPaintWall={paintWall}
              />
            </Suspense>
          )}
        </section>

        <aside>
          {selectedFurniture ? (
            <FurniturePanel plan={plan} setPlan={setPlan} checkpoint={store.checkpoint} f={selectedFurniture} onSelect={setSelection} />
          ) : selectedRoom ? (
            <RoomPanel
              plan={plan}
              setPlan={setPlan}
              checkpoint={store.checkpoint}
              room={selectedRoom}
              focus={focus}
              setFocus={setFocus}
              onSelect={setSelection}
            />
          ) : (
            <div className="panel">
              <p className="muted">
                Einen Raum anklicken, um ihn zu gestalten und einzurichten. Doppelklick zeigt nur diesen Raum.
              </p>
            </div>
          )}

          <details open={!selection}>
            <summary>Flächen</summary>
            <AreaTable plan={plan} selection={selection} onSelect={setSelection} />
          </details>

          {issues.length > 0 && (
            <>
              <h2>Hinweise</h2>
              <ul className="issues">
                {issues.map((i, k) => <li key={k} className={i.level}>{i.message}</li>)}
              </ul>
            </>
          )}

          <details>
            <summary>Über das Modell</summary>
            <ul className="notes">
              {plan.meta.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </details>
          {store.isModified && (
            <p className="muted small">
              <strong>Geändert gegenüber plans/{entryKey}.json</strong>: im Browser gespeichert. Mit „Exportieren“ als Datei sichern.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
