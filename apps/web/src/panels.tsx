import {
  apartmentAreaChecks,
  roomAreaChecks,
  roomLabelPoint,
  wallGeometry,
  wallSideRooms,
  type Furniture,
  type Plan,
  type Room,
} from "@wohnplaner/model";
import { useMemo, useState } from "react";
import { CATEGORIES, FURNITURE, FURNITURE_BY_ID, ROLES, type Role } from "./catalog/furniture";
import { DEFAULT_WALL, materialsFor, RAL_COLORS, resolveFinish, type Use } from "./catalog/materials";
import { applyStyle, defaultFinishes, furnitureInRoom, STYLES } from "./catalog/styles";
import { apartmentColor, fmtArea, fmtPercent } from "./format";
import type { Selection } from "./selection";

interface StoreProps {
  plan: Plan;
  setPlan: (p: Plan, withCheckpoint?: boolean) => void;
  checkpoint: () => void;
}

// zuletzt gewählte Möbel-Kategorie merken, auch wenn das Panel zwischendurch verschwindet
let lastCategory = CATEGORIES[0]!;

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

// ---------------------------------------------------------------- Oberflächen-Auswahl

export function FinishPicker(props: { label: string; value?: string; fallback: string; use?: Use; paint: boolean; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = resolveFinish(props.value ?? props.fallback);
  const materials = props.use ? materialsFor(props.use) : [];
  const groups = [...new Set(materials.map((m) => m.group))];
  return (
    <div className="finish-picker">
      <button className="finish-current" onClick={() => setOpen(!open)}>
        <span className="swatch-lg" style={{ background: current.color }} />
        <span className="finish-text">
          <span className="finish-label">{props.label}</span>
          <span>{current.name}</span>
        </span>
        <span className="chevron">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="finish-options">
          {groups.map((g) => (
            <div key={g}>
              <div className="finish-group">{g}</div>
              <div className="swatches">
                {materials.filter((m) => m.group === g).map((m) => (
                  <button
                    key={m.id}
                    className={`swatch-btn ${props.value === m.id ? "active" : ""} pattern-${m.pattern}`}
                    style={{ background: m.color }}
                    title={m.name}
                    onClick={() => props.onChange(m.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {props.paint && (
            <div>
              <div className="finish-group">Farben (RAL, Bildschirm-Näherung)</div>
              <div className="swatches">
                {RAL_COLORS.map((c) => (
                  <button
                    key={c.code}
                    className={`swatch-btn ${props.value?.toLowerCase() === c.hex ? "active" : ""}`}
                    style={{ background: c.hex }}
                    title={`RAL ${c.code} ${c.name}`}
                    onClick={() => props.onChange(c.hex)}
                  />
                ))}
                <label className="swatch-btn custom" title="Eigene Farbe">
                  <input type="color" value={current.color} onChange={(e) => props.onChange(e.target.value)} />
                  +
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Raum

export function RoomPanel(
  props: StoreProps & { room: Room; focus: string; setFocus: (f: string) => void; onSelect: (s: Selection) => void },
) {
  const { plan, setPlan, room } = props;
  const [category, setCategoryState] = useState(lastCategory);
  const setCategory = (c: string) => {
    lastCategory = c;
    setCategoryState(c);
  };
  const updateRoom = (patch: Partial<Room>, withCheckpoint = true) =>
    setPlan({ ...plan, rooms: plan.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r)) }, withCheckpoint);
  const setFinish = (key: "floor" | "walls", value: string) => updateRoom({ finishes: { ...room.finishes, [key]: value } });

  const inRoom = plan.furniture.filter((f) => furnitureInRoom(room, f));

  // Akzentwände: Wandseiten dieses Raums mit eigener Farbe
  const accentSides = useMemo(
    () =>
      plan.walls.flatMap((w) => {
        if (!w.finishes) return [];
        const sides = wallSideRooms(plan, wallGeometry(plan, w));
        return (["left", "right"] as const).filter((s) => sides[s] === room.id && w.finishes?.[s]).map((s) => ({ wall: w.id, side: s }));
      }),
    [plan, room.id],
  );

  const addFurniture = (type: string) => {
    const t = FURNITURE_BY_ID.get(type)!;
    const [x, y] = roomLabelPoint(room);
    const f: Furniture = {
      id: newId("m"),
      type,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      rotation: 0,
      elevation: t.elevation ?? 0,
      width: t.w,
      depth: t.d,
      height: t.h,
      finishes: defaultFinishes(type, room),
    };
    setPlan({ ...plan, furniture: [...plan.furniture, f] });
    props.onSelect({ kind: "furniture", id: f.id });
  };

  const isolated = props.focus === `room:${room.id}`;
  return (
    <div className="panel">
      <h2>Raum</h2>
      <label className="field">
        Name
        <input value={room.name} onFocus={props.checkpoint} onChange={(e) => updateRoom({ name: e.target.value }, false)} />
      </label>
      <label className="field">
        Wohnung
        <select
          value={room.apartment ?? ""}
          onChange={(e) => updateRoom({ apartment: e.target.value || undefined, countsAsLivingArea: !!e.target.value })}
        >
          <option value="">– keine (z. B. Treppenhaus) –</option>
          {plan.apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className="row">
        {isolated ? (
          <button onClick={() => props.setFocus(room.apartment ? `apt:${room.apartment}` : "all")}>← Ganze Wohnung zeigen</button>
        ) : (
          <button onClick={() => props.setFocus(`room:${room.id}`)}>Nur diesen Raum zeigen</button>
        )}
      </div>

      <h3>Stilvorlage</h3>
      <div className="styles">
        {STYLES.map((s) => (
          <button
            key={s.id}
            className={`style-card ${room.finishes?.style === s.id ? "active" : ""}`}
            title={s.description}
            onClick={() => setPlan(applyStyle(plan, room.id, s))}
          >
            <span className="style-swatches">
              <span style={{ background: resolveFinish(s.walls).color }} />
              <span style={{ background: resolveFinish(s.floor).color }} />
              <span style={{ background: resolveFinish(s.roles.front).color }} />
              <span style={{ background: resolveFinish(s.roles.worktop).color }} />
            </span>
            {s.name}
          </button>
        ))}
      </div>
      <p className="muted small">Setzt Wandfarbe, Boden und die Oberflächen aller Möbel in diesem Raum.</p>

      <h3>Boden und Wände</h3>
      <FinishPicker label="Boden" value={room.finishes?.floor} fallback="#ddd6c8" use="floor" paint={false} onChange={(f) => setFinish("floor", f)} />
      <FinishPicker label="Wandfarbe" value={room.finishes?.walls} fallback={DEFAULT_WALL} paint onChange={(f) => setFinish("walls", f)} />
      {accentSides.length > 0 && (
        <div className="row">
          <span className="muted small">{accentSides.length} Akzentwand{accentSides.length > 1 ? "seiten" : "seite"}</span>
          <button
            onClick={() =>
              setPlan({
                ...plan,
                walls: plan.walls.map((w) => {
                  const own = accentSides.filter((a) => a.wall === w.id);
                  if (!own.length) return w;
                  const finishes = { ...w.finishes };
                  for (const a of own) delete finishes[a.side];
                  return { ...w, finishes };
                }),
              })
            }
          >
            Zurücksetzen
          </button>
        </div>
      )}
      <p className="muted small">Einzelne Wände (Akzentwand) streicht man in der 3D-Ansicht mit „Wand streichen“.</p>

      <h3>Möbel hinzufügen</h3>
      <div className="tabs-small">
        {CATEGORIES.map((c) => (
          <button key={c} className={c === category ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="catalog">
        {FURNITURE.filter((f) => f.category === category).map((f) => (
          <button key={f.id} onClick={() => addFurniture(f.id)} title={`${Math.round(f.w * 100)} × ${Math.round(f.d * 100)} × ${Math.round(f.h * 100)} cm`}>
            {f.name}
          </button>
        ))}
      </div>

      {inRoom.length > 0 && (
        <>
          <h3>Im Raum ({inRoom.length})</h3>
          <ul className="item-list">
            {inRoom.map((f) => (
              <li key={f.id}>
                <button className="link" onClick={() => props.onSelect({ kind: "furniture", id: f.id })}>
                  {f.name ?? FURNITURE_BY_ID.get(f.type)?.name ?? f.type}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Möbel

export function FurniturePanel(props: StoreProps & { f: Furniture; onSelect: (s: Selection) => void }) {
  const { plan, setPlan, f } = props;
  const type = FURNITURE_BY_ID.get(f.type);
  const update = (patch: Partial<Furniture>, withCheckpoint = true) =>
    setPlan({ ...plan, furniture: plan.furniture.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }, withCheckpoint);
  const roles = (type?.roles ?? (Object.keys(f.finishes) as Role[])).filter((r) => ROLES[r]);

  const cm = (key: "width" | "depth" | "height" | "elevation", label: string) => (
    <label className="field small-field">
      {label}
      <input
        type="number"
        min={key === "elevation" ? 0 : 1}
        step={1}
        value={Math.round(f[key] * 100)}
        onFocus={props.checkpoint}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          if (Number.isFinite(v) && (key === "elevation" ? v >= 0 : v > 0)) update({ [key]: v }, false);
        }}
      />
    </label>
  );

  return (
    <div className="panel">
      <h2>{type?.name ?? f.type}</h2>
      <label className="field">
        Bezeichnung
        <input value={f.name ?? ""} placeholder={type?.name} onFocus={props.checkpoint} onChange={(e) => update({ name: e.target.value || undefined }, false)} />
      </label>
      <h3>Maße (cm)</h3>
      <div className="row">
        {cm("width", "Breite")}
        {cm("depth", "Tiefe")}
        {cm("height", "Höhe")}
        {cm("elevation", "über Boden")}
      </div>
      <h3>Drehung</h3>
      <div className="row">
        <button onClick={() => update({ rotation: (f.rotation + 270) % 360 })} title="90° gegen den Uhrzeigersinn">⟲ 90°</button>
        <button onClick={() => update({ rotation: (f.rotation + 90) % 360 })} title="90° im Uhrzeigersinn (Taste R)">⟳ 90°</button>
        <label className="field small-field inline">
          <input
            type="number"
            step={5}
            value={Math.round(f.rotation)}
            onFocus={props.checkpoint}
            onChange={(e) => Number.isFinite(+e.target.value) && update({ rotation: ((+e.target.value % 360) + 360) % 360 }, false)}
          />
          °
        </label>
      </div>
      <h3>Oberflächen</h3>
      {roles.map((role) => (
        <FinishPicker
          key={role}
          label={ROLES[role].label}
          value={f.finishes[role]}
          fallback={ROLES[role].default}
          use={ROLES[role].use}
          paint={ROLES[role].paint}
          onChange={(v) => update({ finishes: { ...f.finishes, [role]: v } })}
        />
      ))}
      <div className="row actions">
        <button
          onClick={() => {
            const copy = { ...f, id: newId("m"), x: f.x + 0.3, y: f.y + 0.3 };
            setPlan({ ...plan, furniture: [...plan.furniture, copy] });
            props.onSelect({ kind: "furniture", id: copy.id });
          }}
        >
          Duplizieren
        </button>
        <button
          className="danger"
          onClick={() => {
            setPlan({ ...plan, furniture: plan.furniture.filter((x) => x.id !== f.id) });
            props.onSelect(undefined);
          }}
        >
          Löschen (Entf)
        </button>
      </div>
      <p className="muted small">Im 2D-Plan verschieben. Taste R dreht um 90°. Die dicke Linie markiert die Vorderseite.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Flächen

export function AreaTable({ plan, selection, onSelect }: { plan: Plan; selection: Selection; onSelect: (s: Selection) => void }) {
  const rooms = useMemo(() => roomAreaChecks(plan), [plan]);
  const apartments = useMemo(() => apartmentAreaChecks(plan), [plan]);
  return (
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
                <tr key={r.id} className={selection?.kind === "room" && selection.id === r.id ? "selected" : ""} onClick={() => onSelect({ kind: "room", id: r.id })}>
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
  );
}

function Deviation({ v, limit }: { v?: number; limit: number }) {
  if (v === undefined) return null;
  return <span className={Math.abs(v) > limit ? "warn" : "ok"}>{fmtPercent(v)}</span>;
}
