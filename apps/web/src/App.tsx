import { parsePlan, slugify, validatePlan, wallGeometry, wallSideRooms, type Plan, type WallSide } from "@wohnplaner/model";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RAL_COLORS } from "./catalog/materials";
import { Compare } from "./Compare";
import { walkInput } from "./interaction3d";
import { AreaTable, FinishPicker, FurniturePanel, RoomPanel } from "./panels";
import { Plan2D, type EditMode } from "./Plan2D";
import { bundledPlans, photoUrlFor } from "./plans";
import type { Selection } from "./selection";
import { downloadJson } from "./download";
import { useWorkspace, variantKey, type Person } from "./useWorkspace";

// three.js erst laden, wenn jemand die 3D-Ansicht öffnet
const Scene3D = lazy(() => import("./Scene3D").then((m) => ({ default: m.Scene3D })));

const MODES: { id: EditMode; label: string; hint: string }[] = [
  { id: "furnish", label: "Einrichten", hint: "Klick wählt Raum oder Möbel. Möbel ziehen verschiebt (rastet an Wänden ein). Doppelklick zeigt nur den Raum." },
  { id: "walls", label: "Wände", hint: "Wandknoten ziehen. Rastet auf 1 cm und an anderen Knoten ein." },
  { id: "rooms", label: "Räume", hint: "Raumecken ziehen. Fläche wird live nachgerechnet." },
  { id: "photo", label: "Foto ausrichten", hint: "Die vier Fotopunkte an die passenden Stellen im Plan ziehen." },
];

/** Vorschläge für „Wer plant gerade?“ – weitere Namen kann man eintippen */
const PEOPLE: Person[] = [
  { id: "arian", name: "Arian" },
  { id: "leni", name: "Leni" },
];

const ME_KEY = "wohnplaner:me";
function loadMe(): Person | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
    return p?.id && p?.name ? p : undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const [planKey, setPlanKey] = useState(bundledPlans[0]?.key ?? "");
  const [me, setMeState] = useState<Person | undefined>(loadMe);
  const setMe = (p: Person) => {
    setMeState(p);
    try {
      localStorage.setItem(ME_KEY, JSON.stringify(p));
    } catch {
      /* Komfort */
    }
  };
  const entry = bundledPlans.find((p) => p.key === planKey);
  if (!entry) return <p className="empty">Kein Grundriss in plans/ gefunden.</p>;
  return (
    <>
      <Workspace key={entry.key} entryKey={entry.key} original={entry.plan} onSwitch={setPlanKey} me={me} onChangeMe={() => setMeState(undefined)} />
      {!me && <PersonDialog onPick={setMe} />}
    </>
  );
}

function PersonDialog({ onPick }: { onPick: (p: Person) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Wer plant gerade?</h2>
        <p className="muted">Eure Varianten werden getrennt gespeichert, damit ihr euch nichts überschreibt. Sehen könnt ihr beide alles.</p>
        <div className="row">
          {PEOPLE.map((p) => (
            <button key={p.id} className="big" onClick={() => onPick(p)}>{p.name}</button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onPick({ id: slugify(name), name: name.trim() });
          }}
        >
          <input placeholder="anderer Name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>OK</button>
        </form>
      </div>
    </div>
  );
}

function Workspace(props: { entryKey: string; original: Plan; onSwitch: (k: string) => void; me?: Person; onChangeMe: () => void }) {
  const { entryKey, me } = props;
  const ws = useWorkspace(entryKey, props.original, me);
  const { plan, setPlan } = ws;
  const [view, setView] = useState<"2d" | "3d" | "compare">("2d");
  const [mode, setMode] = useState<EditMode>("furnish");
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoOpacity, setPhotoOpacity] = useState(0.6);
  const [focus, setFocus] = useState("all");
  const [cutaway, setCutaway] = useState(true);
  const [walk, setWalk] = useState(false);
  const [painting, setPainting] = useState(false);
  const [paintColor, setPaintColor] = useState(RAL_COLORS.find((c) => c.code === "6021")!.hex);
  const [selection, setSelection] = useState<Selection>();
  const fileInput = useRef<HTMLInputElement>(null);

  const people = useMemo(() => {
    const list = [...PEOPLE];
    for (const v of ws.variants) if (!list.some((p) => p.id === v.author)) list.push({ id: v.author, name: v.author });
    if (me && !list.some((p) => p.id === me.id)) list.push(me);
    return list;
  }, [ws.variants, me]);
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  const photoUrl = photoUrlFor(plan);
  const issues = useMemo(() => validatePlan(plan), [plan]);
  const selectedRoom = selection?.kind === "room" ? plan.rooms.find((r) => r.id === selection.id) : undefined;
  const selectedFurniture = selection?.kind === "furniture" ? plan.furniture.find((f) => f.id === selection.id) : undefined;
  const dirty = ws.designDirty || ws.baseDirty;

  const focusRoom = (roomId: string) => {
    setFocus(`room:${roomId}`);
    setSelection({ kind: "room", id: roomId });
  };

  const askName = () => {
    const suggestion = ws.currentVariant ? `${ws.currentVariant.name}${ws.mine ? " (Kopie)" : ""}` : "";
    const name = prompt("Name der Variante, z. B. „Küche Landhaus“:", suggestion);
    if (name?.trim()) ws.saveAs(name.trim());
  };
  const save = () => (ws.currentVariant && ws.mine ? ws.save() : askName());

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

  // Tastatur: Strg/Cmd+S speichert, Strg/Cmd+Z macht rückgängig, Entf löscht, R dreht, Esc hebt auf
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        ws.undo();
      } else if (e.key === "Escape") {
        setSelection(undefined);
        setPainting(false);
        setWalk(false);
      } else if (walk) {
        return; // Tasten gehören beim Durchlaufen der Bewegung
      } else if (selectedFurniture && (e.key === "Delete" || e.key === "Backspace")) {
        setPlan({ ...plan, furniture: plan.furniture.filter((f) => f.id !== selectedFurniture.id) });
        setSelection(undefined);
      } else if (selectedFurniture && e.key.toLowerCase() === "r") {
        setPlan({ ...plan, furniture: plan.furniture.map((f) => (f.id === selectedFurniture.id ? { ...f, rotation: (f.rotation + 90) % 360 } : f)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Warnen, bevor ungespeicherte Arbeit verloren geht (der Entwurf bleibt aber im Browser erhalten)
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const importFile = async (file: File) => {
    try {
      setPlan(parsePlan(JSON.parse(await file.text())));
    } catch (e) {
      alert(`Datei konnte nicht gelesen werden:\n${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const authors = [...new Set(ws.variants.map((v) => v.author))].sort((a, b) => (a === me?.id ? -1 : b === me?.id ? 1 : a.localeCompare(b)));

  return (
    <div className="app">
      <header>
        <h1>3D-Wohnplaner</h1>
        {bundledPlans.length > 1 && (
          <select value={entryKey} onChange={(e) => props.onSwitch(e.target.value)}>
            {bundledPlans.map((p) => <option key={p.key} value={p.key}>{p.plan.meta.name}</option>)}
          </select>
        )}

        <div className="variant-bar">
          <label>
            Variante{" "}
            <select
              value={ws.currentVariant ? variantKey(ws.currentVariant) : ""}
              onChange={(e) => {
                if (dirty && !confirm("Ungespeicherte Änderungen verwerfen und die andere Variante öffnen?")) return;
                ws.open(e.target.value || undefined);
                setSelection(undefined);
              }}
            >
              <option value="">– ohne Variante (Entwurf) –</option>
              {authors.map((a) => (
                <optgroup key={a} label={a === me?.id ? `${personName(a)} (du)` : personName(a)}>
                  {ws.variants.filter((v) => v.author === a).map((v) => (
                    <option key={variantKey(v)} value={variantKey(v)}>{v.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {dirty && <span className="dirty" title={ws.baseDirty ? "Grundriss und/oder Gestaltung geändert" : "Gestaltung geändert"}>● ungespeichert</span>}
          <button onClick={save} disabled={!!ws.busy} title={ws.currentVariant && !ws.mine ? "Variante gehört jemand anderem – wird als eigene Kopie gespeichert" : "Speichern (Strg/Cmd+S)"}>
            {ws.busy === "Speichern" ? "Speichert …" : ws.currentVariant && !ws.mine ? "Als Kopie speichern" : "Speichern"}
          </button>
          <button onClick={askName} disabled={!!ws.busy}>Speichern als …</button>
          {ws.storage?.git && (
            <button onClick={ws.sync} disabled={!!ws.busy} title="Eigene Varianten hochladen und die der anderen holen (Git)">
              {ws.busy === "Synchronisieren" ? "Synchronisiert …" : "⇅ Synchronisieren"}
            </button>
          )}
        </div>

        <div className="spacer" />
        <div className="tabs">
          <button className={view === "2d" ? "active" : ""} onClick={() => setView("2d")}>2D-Plan</button>
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D</button>
          <button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}>Vergleichen</button>
        </div>
        <label>
          Ansicht{" "}
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="all">Ganzes Geschoss</option>
            {plan.apartments.map((a) => <option key={a.id} value={`apt:${a.id}`}>{a.name}</option>)}
            {[...plan.apartments.map((a) => ({ id: a.id as string | undefined, name: a.name })), { id: undefined, name: "Allgemein" }].map((a) => {
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
        <button onClick={ws.undo} disabled={!ws.canUndo} title="Rückgängig (Strg/Cmd+Z)">↶</button>
        <details className="menu">
          <summary className="menu-button">⋯</summary>
          <div className="menu-items">
            <div className="menu-info">
              {me ? <>Du planst als <strong>{me.name}</strong></> : "Niemand gewählt"} ·{" "}
              <button className="link" onClick={props.onChangeMe}>wechseln</button>
              <br />
              {ws.storage?.kind === "repo"
                ? <>Speicherort: Repo{ws.storage.branch ? ` (Branch ${ws.storage.branch})` : ""}</>
                : <>Speicherort: nur dieser Browser</>}
            </div>
            <button onClick={() => confirm("Ungespeicherte Änderungen verwerfen?") && ws.resetToSaved()} disabled={!dirty}>Änderungen verwerfen</button>
            {ws.currentVariant && ws.mine && (
              <button className="danger" onClick={() => confirm(`Variante „${ws.currentVariant!.name}“ löschen?`) && ws.remove(ws.currentVariant!)}>Variante löschen</button>
            )}
            <button onClick={() => downloadJson(plan, `${entryKey}${ws.currentVariant ? `-${ws.currentVariant.id}` : ""}.json`)}>Als JSON exportieren</button>
            <button onClick={() => fileInput.current?.click()}>JSON importieren</button>
          </div>
        </details>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      {ws.message && (
        <div className={`message ${ws.message.kind}`} onClick={ws.dismissMessage}>
          <pre>{ws.message.text}</pre>
          <span className="close">✕</span>
        </div>
      )}

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
              <label><input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} /> Originalfoto</label>
              <input type="range" min={0.1} max={1} step={0.05} value={photoOpacity} disabled={!showPhoto} onChange={(e) => setPhotoOpacity(+e.target.value)} />
            </>
          )}
        </div>
      )}
      {view === "3d" && (
        <div className="toolbar">
          <button className={walk ? "active" : ""} onClick={() => { setWalk(!walk); setPainting(false); }}>🚶 Begehen</button>
          {!walk && (
            <>
              <label><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Wände abschneiden</label>
              <button className={painting ? "active" : ""} onClick={() => setPainting(!painting)}>🖌 Wand streichen</button>
            </>
          )}
          {painting && (
            <div className="paint-picker">
              <FinishPicker label="Farbe" value={paintColor} fallback={paintColor} paint onChange={setPaintColor} />
            </div>
          )}
          <span className="hint">
            {walk
              ? "W/S oder ↑/↓ gehen, A/D seitwärts, ←/→ drehen, Maus ziehen schaut sich um, Umschalt = schneller. Esc beendet."
              : painting
                ? "Auf eine Wandseite klicken, um sie zu streichen (Akzentwand). Esc beendet."
                : "Möbel ziehen verschiebt sie. Linke Maustaste dreht die Ansicht, rechte verschiebt, Mausrad zoomt. Doppelklick auf einen Boden zeigt nur den Raum."}
          </span>
        </div>
      )}

      <main>
        {view === "compare" ? (
          <Compare working={plan} currentKey={ws.currentVariant ? variantKey(ws.currentVariant) : undefined} variants={ws.variants} people={people} focus={focus} />
        ) : (
          <>
            <section className={`canvas ${painting && view === "3d" ? "painting" : ""}`}>
              {view === "2d" ? (
                <Plan2D
                  plan={plan}
                  setPlan={setPlan}
                  checkpoint={ws.checkpoint}
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
                    setPlan={setPlan}
                    checkpoint={ws.checkpoint}
                    walk={walk}
                  />
                  {walk && <WalkPad />}
                </Suspense>
              )}
            </section>

            <aside>
              {selectedFurniture ? (
                <FurniturePanel plan={plan} setPlan={setPlan} checkpoint={ws.checkpoint} f={selectedFurniture} onSelect={setSelection} />
              ) : selectedRoom ? (
                <RoomPanel plan={plan} setPlan={setPlan} checkpoint={ws.checkpoint} room={selectedRoom} focus={focus} setFocus={setFocus} onSelect={setSelection} />
              ) : (
                <div className="panel">
                  <p className="muted">Einen Raum anklicken, um ihn zu gestalten und einzurichten. Doppelklick zeigt nur diesen Raum.</p>
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
              {ws.baseDirty && (
                <p className="muted small">
                  <strong>Grundriss geändert.</strong> Beim Speichern wird auch plans/{entryKey}.json aktualisiert – das gilt dann für alle Varianten.
                </p>
              )}
            </aside>
          </>
        )}
      </main>
    </div>
  );
}

/** Steuerkreuz für Tablets und Handys (beim Durchlaufen) */
function WalkPad() {
  const hold = (key: keyof typeof walkInput, value: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      walkInput[key] = value;
    },
    onPointerUp: () => (walkInput[key] = 0),
    onPointerCancel: () => (walkInput[key] = 0),
  });
  useEffect(() => () => void Object.assign(walkInput, { forward: 0, strafe: 0, turn: 0 }), []);
  return (
    <div className="walk-pad">
      <button {...hold("forward", 1)} title="vor">▲</button>
      <div>
        <button {...hold("turn", 1)} title="links drehen">⟲</button>
        <button {...hold("forward", -1)} title="zurück">▼</button>
        <button {...hold("turn", -1)} title="rechts drehen">⟳</button>
      </div>
    </div>
  );
}
