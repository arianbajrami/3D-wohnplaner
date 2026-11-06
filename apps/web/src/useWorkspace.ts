import {
  applyVariant,
  extractDesign,
  parsePlan,
  sameDesign,
  slugify,
  stripDesign,
  VARIANT_SCHEMA_VERSION,
  type Plan,
  type Variant,
} from "@wohnplaner/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectStorage, type Storage } from "./api";

export interface Person {
  id: string;
  name: string;
}

export const variantKey = (v: Pick<Variant, "author" | "id">) => `${v.author}/${v.id}`;

const draftKey = (plan: string) => `wohnplaner:draft:${plan}`;
const legacyKey = (plan: string) => `wohnplaner:plan:${plan}`;

interface Draft {
  variant?: string;
  plan: unknown;
}

function loadDraft(planKey: string): { variant?: string; plan: Plan } | undefined {
  try {
    const raw = localStorage.getItem(draftKey(planKey));
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      return { variant: d.variant, plan: parsePlan(d.plan) };
    }
    // Stand aus der ersten Version (vor Varianten) übernehmen, damit nichts verloren geht
    const legacy = localStorage.getItem(legacyKey(planKey));
    if (legacy) return { plan: parsePlan(JSON.parse(legacy)) };
  } catch {
    /* kaputter Entwurf – ignorieren */
  }
  return undefined;
}

const stable = (p: Plan) => JSON.stringify(p);

/**
 * Arbeitsstand = Grundriss + Gestaltung der aktuellen Variante, mit Rückgängig.
 * Der Arbeitsstand wird laufend als Entwurf im Browser gesichert; „Speichern“ schreibt
 * Variante (designs/…) und – falls geändert – den Grundriss (plans/…).
 */
export function useWorkspace(planKey: string, bundledBase: Plan, me: Person | undefined) {
  const [storage, setStorage] = useState<Storage>();
  const [base, setBase] = useState<Plan>(() => stripDesign(bundledBase));
  const [variants, setVariants] = useState<Variant[]>([]);
  const draft = useMemo(() => loadDraft(planKey), [planKey]);
  const [currentKey, setCurrentKey] = useState<string | undefined>(draft?.variant);
  const [plan, setPlanState] = useState<Plan>(() => draft?.plan ?? stripDesign(bundledBase));
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

  // ---- Rückgängig
  const undoStack = useRef<Plan[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const current = useRef(plan);
  current.current = plan;
  const checkpoint = useCallback(() => {
    undoStack.current.push(current.current);
    if (undoStack.current.length > 200) undoStack.current.shift();
    setCanUndo(true);
  }, []);
  const setPlan = useCallback(
    (next: Plan, withCheckpoint = true) => {
      if (withCheckpoint) checkpoint();
      current.current = next;
      setPlanState(next);
    },
    [checkpoint],
  );
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev) setPlanState(prev);
    setCanUndo(undoStack.current.length > 0);
  }, []);

  // ---- Entwurf im Browser sichern
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(planKey), JSON.stringify({ variant: currentKey, plan } satisfies Draft));
      localStorage.removeItem(legacyKey(planKey));
    } catch {
      /* Komfort */
    }
  }, [planKey, plan, currentKey]);

  // ---- Laden
  const reload = useCallback(
    async (s: Storage) => {
      const [serverBase, list] = await Promise.all([s.loadPlan(planKey).catch(() => undefined), s.listVariants(planKey)]);
      if (serverBase) setBase(stripDesign(serverBase));
      setVariants(list.filter((v) => v.plan === planKey).sort((a, b) => a.name.localeCompare(b.name, "de")));
      return { serverBase, list };
    },
    [planKey],
  );

  useEffect(() => {
    let alive = true;
    connectStorage().then(async (s) => {
      if (!alive) return;
      setStorage(s);
      const { serverBase } = await reload(s);
      if (!serverBase) return;
      if (!draft) setPlanState(stripDesign(serverBase));
      // Entwurf ohne eigene Grundriss-Änderungen: neuesten Grundriss übernehmen, Gestaltung behalten
      else if (stable(stripDesign(draft.plan)) === stable(stripDesign(bundledBase)))
        setPlanState(applyVariant(stripDesign(serverBase), extractDesign(draft.plan)));
    });
    return () => {
      alive = false;
    };
  }, [reload, draft, bundledBase]);

  const currentVariant = variants.find((v) => variantKey(v) === currentKey);
  const savedDesign = currentVariant ?? { rooms: {}, walls: {}, furniture: [] };
  const designDirty = !sameDesign(extractDesign(plan), savedDesign);
  const baseDirty = stable(stripDesign(plan)) !== stable(base);
  const mine = !!currentVariant && currentVariant.author === me?.id;

  const flash = (kind: "ok" | "error", text: string) => {
    setMessage({ kind, text });
    if (kind === "ok") setTimeout(() => setMessage((m) => (m?.text === text ? undefined : m)), 4000);
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const persistBase = async () => {
    if (!storage || !baseDirty) return;
    const b = stripDesign(current.current);
    await storage.savePlan(planKey, b);
    setBase(b);
  };

  /** Variante (neu) speichern. Fremde Varianten werden nicht überschrieben, sondern kopiert. */
  const saveAs = (name: string) =>
    guard("Speichern", async () => {
      if (!storage || !me) throw new Error("Bitte zuerst auswählen, wer gerade plant.");
      const taken = new Set(variants.filter((v) => v.author === me.id).map((v) => v.id));
      let id = slugify(name), n = 2;
      while (taken.has(id)) id = `${slugify(name)}-${n++}`;
      const now = new Date().toISOString();
      const v: Variant = {
        schemaVersion: VARIANT_SCHEMA_VERSION,
        id,
        name,
        author: me.id,
        plan: planKey,
        createdAt: now,
        updatedAt: now,
        ...extractDesign(current.current),
      };
      await persistBase();
      await storage.saveVariant(v);
      setVariants((list) => [...list, v].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setCurrentKey(variantKey(v));
      flash("ok", `„${name}“ gespeichert${storage.kind === "repo" ? ` (designs/${planKey}/${me.id}/${id}.json)` : " (im Browser)"}.`);
    });

  const save = () =>
    guard("Speichern", async () => {
      if (!storage || !me) throw new Error("Bitte zuerst auswählen, wer gerade plant.");
      if (!currentVariant || !mine) throw new Error("Bitte unter einem eigenen Namen speichern („Speichern als …“).");
      const v: Variant = { ...currentVariant, ...extractDesign(current.current), updatedAt: new Date().toISOString() };
      await persistBase();
      if (designDirty) await storage.saveVariant(v);
      setVariants((list) => list.map((x) => (variantKey(x) === variantKey(v) ? v : x)));
      flash("ok", `„${v.name}“ gespeichert.`);
    });

  const open = (key: string | undefined) => {
    const v = variants.find((x) => variantKey(x) === key);
    checkpoint();
    const geometry = stripDesign(current.current);
    setPlanState(v ? applyVariant(geometry, v) : geometry);
    setCurrentKey(v ? key : undefined);
  };

  const remove = (v: Variant) =>
    guard("Löschen", async () => {
      if (!storage) return;
      await storage.deleteVariant(v);
      setVariants((list) => list.filter((x) => variantKey(x) !== variantKey(v)));
      if (variantKey(v) === currentKey) setCurrentKey(undefined);
      flash("ok", `„${v.name}“ gelöscht.`);
    });

  const sync = () =>
    guard("Synchronisieren", async () => {
      if (!storage) return;
      const hadBaseEdits = baseDirty, hadDesignEdits = designDirty;
      const r = await storage.sync(me?.name ?? "Wohnplaner");
      const { serverBase, list } = await reload(storage);
      // Neues vom anderen übernehmen, aber nur dort, wo hier nichts Ungespeichertes liegt
      const fresh = list.find((v) => variantKey(v) === currentKey);
      const geometry = !hadBaseEdits && serverBase ? stripDesign(serverBase) : stripDesign(current.current);
      const design = !hadDesignEdits && fresh ? fresh : extractDesign(current.current);
      setPlanState(applyVariant(geometry, design));
      flash("ok", r.committed ? `${r.committed} Datei(en) hochgeladen und neuen Stand geholt.` : "Neuen Stand geholt – nichts Eigenes zu übertragen.");
    });

  const resetToSaved = () => {
    checkpoint();
    setPlanState(currentVariant ? applyVariant(base, currentVariant) : base);
  };

  return {
    storage,
    base,
    plan,
    setPlan,
    checkpoint,
    undo,
    canUndo,
    variants,
    currentVariant,
    designDirty,
    baseDirty,
    mine,
    busy,
    message,
    dismissMessage: () => setMessage(undefined),
    save,
    saveAs,
    open,
    remove,
    sync,
    resetToSaved,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
