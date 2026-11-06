import { parsePlan, Variant, type Plan } from "@wohnplaner/model";

/**
 * Speicher-Zugriff. Läuft die App über `npm run dev`, speichert der lokale Server direkt ins Repo
 * (plans/, designs/) und kann über Git synchronisieren. Ohne Server (z. B. statisch gehostet)
 * landen Varianten nur im Browser.
 */
export interface Storage {
  kind: "repo" | "browser";
  git: boolean;
  branch?: string;
  loadPlan(key: string): Promise<Plan | undefined>;
  savePlan(key: string, plan: Plan): Promise<void>;
  listVariants(plan: string): Promise<Variant[]>;
  saveVariant(v: Variant): Promise<void>;
  deleteVariant(v: Variant): Promise<void>;
  gitStatus(): Promise<{ changes: number; ahead: number; behind: number } | undefined>;
  sync(author: string): Promise<{ committed: number; log: string }>;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${method} ${url}: ${res.status}`);
  return data as T;
}

const parseVariants = (raw: unknown[]): Variant[] =>
  raw.flatMap((x) => {
    const r = Variant.safeParse(x);
    return r.success ? [r.data] : [];
  });

function repoStorage(health: { git: boolean; branch?: string }): Storage {
  return {
    kind: "repo",
    git: health.git,
    branch: health.branch,
    loadPlan: async (key) => parsePlan(await call("GET", `/api/plans/${key}`)),
    savePlan: (key, plan) => call("PUT", `/api/plans/${key}`, plan),
    listVariants: async (plan) => parseVariants(await call<unknown[]>("GET", `/api/designs/${plan}`)),
    saveVariant: (v) => call("PUT", `/api/designs/${v.plan}/${v.author}/${v.id}`, v),
    deleteVariant: (v) => call("DELETE", `/api/designs/${v.plan}/${v.author}/${v.id}`),
    gitStatus: () => (health.git ? call("GET", "/api/git/status") : Promise.resolve(undefined)),
    sync: (author) => call("POST", "/api/git/sync", { author }),
  };
}

function browserStorage(): Storage {
  const key = (plan: string) => `wohnplaner:variants:${plan}`;
  const read = (plan: string): Variant[] => {
    try {
      return parseVariants(JSON.parse(localStorage.getItem(key(plan)) ?? "[]"));
    } catch {
      return [];
    }
  };
  const write = (plan: string, list: Variant[]) => localStorage.setItem(key(plan), JSON.stringify(list));
  return {
    kind: "browser",
    git: false,
    loadPlan: async () => undefined,
    savePlan: async () => {
      throw new Error("Grundriss speichern geht nur mit dem lokalen Server (npm run dev).");
    },
    listVariants: async (plan) => read(plan),
    saveVariant: async (v) => write(v.plan, [...read(v.plan).filter((x) => !(x.id === v.id && x.author === v.author)), v]),
    deleteVariant: async (v) => write(v.plan, read(v.plan).filter((x) => !(x.id === v.id && x.author === v.author))),
    gitStatus: async () => undefined,
    sync: async () => {
      throw new Error("Synchronisieren geht nur mit dem lokalen Server (npm run dev).");
    },
  };
}

export async function connectStorage(): Promise<Storage> {
  try {
    const h = await call<{ ok: boolean; git: boolean; branch?: string }>("GET", "/api/health");
    if (h.ok) return repoStorage(h);
  } catch {
    /* kein Server */
  }
  return browserStorage();
}
