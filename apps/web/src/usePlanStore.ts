import { parsePlan, type Plan } from "@wohnplaner/model";
import { useCallback, useEffect, useRef, useState } from "react";

const storageKey = (key: string) => `wohnplaner:plan:${key}`;

function loadStored(key: string): Plan | undefined {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? parsePlan(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hält das aktuell bearbeitete Modell.
 * Änderungen landen im Browser (localStorage); die Datei in plans/ bleibt unverändert,
 * bis man das Modell exportiert und ins Repo zurücklegt.
 */
export function usePlanStore(key: string, original: Plan) {
  const [plan, setPlanState] = useState<Plan>(() => loadStored(key) ?? original);
  const undoStack = useRef<Plan[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    setPlanState(loadStored(key) ?? original);
    undoStack.current = [];
    setCanUndo(false);
  }, [key, original]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(plan));
    } catch {
      /* Speichern ist Komfort – ohne localStorage geht es trotzdem */
    }
  }, [key, plan]);

  const current = useRef(plan);
  current.current = plan;

  /** Merkt den aktuellen Stand für „Rückgängig“, z. B. zu Beginn eines Ziehvorgangs. */
  const checkpoint = useCallback(() => {
    undoStack.current.push(current.current);
    if (undoStack.current.length > 200) undoStack.current.shift();
    setCanUndo(true);
  }, []);

  /** Neuer Stand. `withCheckpoint: false` für Zwischenschritte (z. B. während des Ziehens). */
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

  const reset = useCallback(() => setPlan(original), [original, setPlan]);
  const isModified = JSON.stringify(plan) !== JSON.stringify(original);

  return { plan, setPlan, checkpoint, undo, canUndo, reset, isModified };
}

export function downloadJson(plan: Plan, filename: string) {
  const blob = new Blob([JSON.stringify(plan, null, 1) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
