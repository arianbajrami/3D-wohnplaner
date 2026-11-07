import { applyVariant, compareDesigns, stripDesign, type Plan, type Variant } from "@wohnplaner/model";
import { lazy, Suspense, useMemo, useState } from "react";
import { FURNITURE_BY_ID } from "./catalog/furniture";
import { resolveFinish } from "./catalog/materials";
import { STYLE_BY_ID } from "./catalog/styles";
import { Plan2D } from "./Plan2D";
import { variantKey, type Person } from "./useWorkspace";

const Scene3D = lazy(() => import("./Scene3D").then((m) => ({ default: m.Scene3D })));

const CURRENT = "__current__";
const noop = () => {};

/** Zwei Varianten nebeneinander, dazu Raum für Raum die Unterschiede. */
export function Compare(props: {
  working: Plan;
  currentKey?: string;
  variants: Variant[];
  people: Person[];
  focus: string;
}) {
  const { working, variants } = props;
  const others = variants.filter((v) => variantKey(v) !== props.currentKey);
  const [a, setA] = useState(CURRENT);
  const [b, setB] = useState(others[0] ? variantKey(others[0]) : CURRENT);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [onlyDiff, setOnlyDiff] = useState(true);

  const geometry = useMemo(() => stripDesign(working), [working]);
  const resolve = (key: string): Plan => {
    if (key === CURRENT) return working;
    const v = variants.find((x) => variantKey(x) === key);
    return v ? applyVariant(geometry, v) : geometry;
  };
  const planA = useMemo(() => resolve(a), [a, working, variants]); // eslint-disable-line react-hooks/exhaustive-deps
  const planB = useMemo(() => resolve(b), [b, working, variants]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(() => compareDesigns(geometry, planA, planB), [geometry, planA, planB]);
  const shown = diff.filter((d) => !onlyDiff || d.differs);

  const personName = (id: string) => props.people.find((p) => p.id === id)?.name ?? id;
  const label = (key: string) => {
    if (key === CURRENT) return "Aktueller Stand";
    const v = variants.find((x) => variantKey(x) === key);
    return v ? `${v.name} (${personName(v.author)})` : key;
  };

  const picker = (value: string, set: (k: string) => void) => (
    <select value={value} onChange={(e) => set(e.target.value)}>
      <option value={CURRENT}>Aktueller Stand</option>
      {[...new Set(variants.map((v) => v.author))].map((author) => (
        <optgroup key={author} label={personName(author)}>
          {variants.filter((v) => v.author === author).map((v) => (
            <option key={variantKey(v)} value={variantKey(v)}>{v.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const pane = (plan: Plan) =>
    view === "2d" ? (
      <Plan2D plan={plan} setPlan={noop} checkpoint={noop} mode="furnish" showPhoto={false} photoOpacity={0} focus={props.focus} selection={undefined} onSelect={noop} onFocusRoom={noop} />
    ) : (
      <Suspense fallback={<p className="empty">3D wird geladen …</p>}>
        <Scene3D plan={plan} focus={props.focus} cutaway selection={undefined} onSelect={noop} onFocusRoom={noop} onPaintWall={noop} />
      </Suspense>
    );

  return (
    <div className="compare">
      <div className="compare-bar">
        <span className="compare-tag a">A</span> {picker(a, setA)}
        <span className="compare-tag b">B</span> {picker(b, setB)}
        <div className="tabs">
          <button className={view === "2d" ? "active" : ""} onClick={() => setView("2d")}>2D</button>
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D</button>
        </div>
        <span className="hint">Die Ansicht (Geschoss, Wohnung, Raum) oben gilt für beide Seiten.</span>
      </div>
      <div className="compare-panes">
        <div className="compare-pane"><div className="compare-label a">A · {label(a)}</div>{pane(planA)}</div>
        <div className="compare-pane"><div className="compare-label b">B · {label(b)}</div>{pane(planB)}</div>
      </div>
      <div className="compare-diff">
        <div className="row">
          <strong>{diff.filter((d) => d.differs).length} Räume unterscheiden sich</strong>
          <label className="small"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> nur Unterschiede</label>
        </div>
        <table className="diff-table">
          <thead>
            <tr><th>Raum</th><th>Stil</th><th>Boden</th><th>Wände</th><th>Möbel</th></tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.roomId} className={d.differs ? "differs" : ""}>
                <td>{d.name}</td>
                <td><Pair a={styleName(d.style[0])} b={styleName(d.style[1])} /></td>
                <td><Pair a={d.floor[0]} b={d.floor[1]} finish /></td>
                <td>
                  <Pair a={d.walls[0]} b={d.walls[1]} finish />
                  {(d.accentWalls[0] || d.accentWalls[1]) > 0 && <div className="muted small">Akzentwände: A {d.accentWalls[0]} · B {d.accentWalls[1]}</div>}
                  {(d.removedWalls[0] || d.removedWalls[1]) > 0 && (
                    <div className={d.removedWalls[0] !== d.removedWalls[1] ? "small" : "muted small"}>
                      Entfernte Wände: A {d.removedWalls[0]} · B {d.removedWalls[1]}
                    </div>
                  )}
                </td>
                <td><Pair a={furnitureList(d.furniture[0])} b={furnitureList(d.furniture[1])} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styleName = (id?: string) => (id ? STYLE_BY_ID.get(id)?.name ?? id : undefined);

function furnitureList(types: string[]): string | undefined {
  if (!types.length) return undefined;
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n > 1 ? `${n}× ` : ""}${FURNITURE_BY_ID.get(t)?.name ?? t}`).join(", ");
}

function Pair({ a, b, finish }: { a?: string; b?: string; finish?: boolean }) {
  const cell = (v: string | undefined, tag: "a" | "b") => (
    <div className="pair-line">
      <span className={`compare-tag small ${tag}`}>{tag.toUpperCase()}</span>
      {finish && v && <span className="swatch" style={{ background: resolveFinish(v).color }} />}
      <span className={v ? "" : "muted"}>{v ? (finish ? resolveFinish(v).name : v) : "–"}</span>
    </div>
  );
  if (a === b)
    return (
      <div className="pair">
        <div className="pair-line">
          {finish && a && <span className="swatch" style={{ background: resolveFinish(a).color }} />}
          <span className="muted">{a ? (finish ? resolveFinish(a).name : a) : "–"} (gleich)</span>
        </div>
      </div>
    );
  return (
    <div className="pair changed">
      {cell(a, "a")}
      {cell(b, "b")}
    </div>
  );
}
