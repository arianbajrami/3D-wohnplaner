import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import type { Connect, Plugin } from "vite";

const run = promisify(execFile);

/**
 * Lokaler Speicher für den Wohnplaner, eingebaut in den Vite-Server (`npm run dev`).
 *
 *   plans/<plan>.json                      Grundriss (gemeinsam)
 *   designs/<plan>/<person>/<variante>.json Gestaltung, eine Datei pro Variante und Person
 *
 * Weil jede Person nur ihre eigenen Dateien schreibt, entstehen beim Synchronisieren über Git
 * praktisch keine Konflikte. „Synchronisieren“ = add → commit → pull --rebase → push.
 */
export function storagePlugin(repoRoot: string): Plugin {
  const middleware = createMiddleware(repoRoot);
  return {
    name: "wohnplaner-storage",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function createMiddleware(root: string): Connect.NextHandleFunction {
  const plansDir = path.join(root, "plans");
  const designsDir = path.join(root, "designs");

  const git = async (...args: string[]) => {
    const { stdout, stderr } = await run("git", args, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return (stdout + stderr).trim();
  };

  const routes: [string, RegExp, (m: RegExpMatchArray, req: IncomingMessage) => Promise<unknown>][] = [
    ["GET", /^\/api\/health$/, async () => {
      let branch: string | undefined;
      try { branch = await git("rev-parse", "--abbrev-ref", "HEAD"); } catch { /* kein Git */ }
      return { ok: true, git: branch !== undefined, branch };
    }],

    ["GET", /^\/api\/plans\/([^/]+)$/, async (m) => JSON.parse(await readFile(path.join(plansDir, `${slug(m[1])}.json`), "utf8"))],
    ["PUT", /^\/api\/plans\/([^/]+)$/, async (m, req) => {
      const body = await readJson(req);
      if (typeof body?.schemaVersion !== "number" || !Array.isArray(body.walls)) throw new HttpError(400, "Kein gültiger Grundriss");
      await writeJsonAtomic(path.join(plansDir, `${slug(m[1])}.json`), body);
      return { ok: true };
    }],

    ["GET", /^\/api\/designs\/([^/]+)$/, async (m) => {
      const dir = path.join(designsDir, slug(m[1]));
      const out: unknown[] = [];
      for (const person of await listDirs(dir))
        for (const file of (await readdir(path.join(dir, person))).filter((f) => f.endsWith(".json"))) {
          try { out.push(JSON.parse(await readFile(path.join(dir, person, file), "utf8"))); } catch { /* kaputte Datei überspringen */ }
        }
      return out;
    }],
    ["PUT", /^\/api\/designs\/([^/]+)\/([^/]+)\/([^/]+)$/, async (m, req) => {
      const [plan, person, id] = [slug(m[1]), slug(m[2]), slug(m[3])];
      const body = await readJson(req);
      if (body?.plan !== plan || body?.author !== person || body?.id !== id) throw new HttpError(400, "plan/author/id passen nicht zum Pfad");
      await writeJsonAtomic(path.join(designsDir, plan, person, `${id}.json`), body);
      return { ok: true };
    }],
    ["DELETE", /^\/api\/designs\/([^/]+)\/([^/]+)\/([^/]+)$/, async (m) => {
      const personDir = path.join(designsDir, slug(m[1]), slug(m[2]));
      await rm(path.join(personDir, `${slug(m[3])}.json`), { force: true });
      // leere Ordner aufräumen (rmdir scheitert absichtlich, wenn noch etwas drin ist)
      for (const dir of [personDir, path.dirname(personDir), designsDir]) await rmdir(dir).catch(() => undefined);
      return { ok: true };
    }],

    ["GET", /^\/api\/git\/status$/, async () => {
      const status = await git("status", "--porcelain", "--", "plans", "designs");
      const head = await git("status", "-sb");
      const ahead = /ahead (\d+)/.exec(head)?.[1], behind = /behind (\d+)/.exec(head)?.[1];
      return { changes: status ? status.split("\n").length : 0, ahead: Number(ahead ?? 0), behind: Number(behind ?? 0) };
    }],
    ["POST", /^\/api\/git\/sync$/, async (_m, req) => {
      const body = await readJson(req).catch(() => ({}));
      const who = typeof body?.author === "string" ? body.author.slice(0, 40) : "Wohnplaner";
      const log: string[] = [];
      const step = async (label: string, ...args: string[]) => {
        try {
          const out = await git(...args);
          log.push(`$ git ${args.join(" ")}${out ? `\n${out}` : ""}`);
          return out;
        } catch (e) {
          const err = e as { stderr?: string; message: string };
          throw new HttpError(500, `${label} fehlgeschlagen:\n${(err.stderr || err.message).trim()}\n\n${log.join("\n")}`);
        }
      };
      await step("Vormerken", "add", "--", "plans", "designs");
      const staged = await git("diff", "--cached", "--name-only");
      if (staged) await step("Commit", "commit", "-m", `Wohnplaner: Stand von ${who}`, "--", "plans", "designs");
      try {
        // Konflikte entstehen praktisch nur, wenn dieselbe Person dieselbe Datei auf zwei Geräten
        // geändert hat. Dann gewinnt der Stand, den man gerade hochlädt (beim Rebase heißt die
        // eigene Seite „theirs“). Nicht überlappende Änderungen werden normal zusammengeführt.
        await step("Holen", "pull", "--rebase", "--autostash", "-X", "theirs");
      } catch (e) {
        // nie mitten in einem Rebase stehen bleiben
        await git("rebase", "--abort").catch(() => undefined);
        throw e;
      }
      await step("Hochladen", "push");
      return { ok: true, committed: staged ? staged.split("\n").length : 0, log: log.join("\n") };
    }],
  ];

  return async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0]!;
    if (!url.startsWith("/api/")) return next();
    for (const [method, re, handler] of routes) {
      const m = url.match(re);
      if (!m || req.method !== method) continue;
      try {
        send(res, 200, await handler(m, req));
      } catch (e) {
        const status = e instanceof HttpError ? e.status : (e as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
        send(res, status, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    send(res, 404, { error: "unbekannter Endpunkt" });
  };
}

/** Nur einfache Kürzel zulassen – verhindert Pfade wie "../" */
function slug(s: string | undefined): string {
  const v = decodeURIComponent(s ?? "");
  if (!SLUG.test(v)) throw new HttpError(400, `ungültiger Name: ${v}`);
  return v;
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && SLUG.test(d.name)).map((d) => d.name);
  } catch {
    return [];
  }
}

async function writeJsonAtomic(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 1) + "\n", "utf8");
  await rename(tmp, file);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) reject(new HttpError(413, "zu groß"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch {
        reject(new HttpError(400, "ungültiges JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
