/**
 * fsApi — the tiny local file service behind htmlove.
 *
 * Exposes a deliberately small HTTP surface (scan / browse / read-write /
 * assets). Only folders that were scanned through this server can be read
 * from or written to, only editable text files can be saved, only known
 * assets can be streamed, and every path is resolved through symlinks and
 * checked against the folder before a single byte is touched.
 *
 * The surface is unauthenticated by design (this is a local playground,
 * not a server), so it relies on the dev/preview server staying bound to
 * localhost. Never expose it to a network with `--host`.
 */
import { createReadStream, promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

/** Text-ish files we read into memory and let the user edit. */
export const EDITABLE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "tsx",
  "jsx",
  "ts",
  "js",
  "mjs",
  "cjs",
  "txt",
  "json",
  "md",
]);

/** Binary/static assets we only record (size), never load into memory. */
export const ASSET_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "ico",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
]);

/** Directory names that are never part of a snippet collection. */
const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".turbo",
  ".parcel-cache",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".svelte-kit",
  ".angular",
]);

export const MAX_TEXT_FILE_BYTES = 512 * 1024; // 512 KB
export const MAX_ENTRIES = 5000; // total files+assets per scan
const MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MB request cap (paste-size texts)

/* ------------------------------------------------------------------ */
/* errors + small helpers                                              */
/* ------------------------------------------------------------------ */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function shouldSkipDir(name: string): boolean {
  return name.startsWith(".") || SKIPPED_DIRS.has(name);
}

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i + 1).toLowerCase();
}

export function isEditableFile(fileName: string): boolean {
  return EDITABLE_EXTENSIONS.has(extOf(fileName));
}

export function isAssetFile(fileName: string): boolean {
  return ASSET_EXTENSIONS.has(extOf(fileName));
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function mimeFor(fileName: string): string {
  return MIME[extOf(fileName)] ?? "application/octet-stream";
}

/** True when `target` lives inside `root` (both paths already resolved). */
export function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep))
  );
}

/**
 * Resolve `rel` inside `root`, refusing anything that climbs out. Purely
 * lexical (and therefore cheap); symlinks are caught by `assertRealWithin`
 * before any file is touched. Pure and side-effect free so it is trivial
 * to test. `path.relative` keeps the filesystem root ("/") usable, which a
 * `root + path.sep` prefix check cannot.
 */
export function resolveWithin(root: string, rel: string): string {
  const absRoot = path.resolve(root);
  const target = path.resolve(absRoot, rel);
  if (!isWithin(absRoot, target)) {
    throw new HttpError(400, `Path escapes the selected folder: ${rel}`);
  }
  return target;
}

/* ------------------------------------------------------------------ */
/* scan registry — folders opened through this server                  */
/* ------------------------------------------------------------------ */

/**
 * Rel paths seen during the last scan of each canonical root. Only files
 * in here (plus a root-level manifest) can be read or written afterwards,
 * so a request cannot invent paths in a folder the user never opened.
 */
const scannedRoots = new Map<string, Set<string>>();
const MAX_SCANNED_ROOTS = 50;

/** Realpath of `root`, or null when it does not exist. */
async function canonicalRoot(root: string): Promise<string | null> {
  try {
    return await fs.realpath(path.resolve(root));
  } catch {
    return null;
  }
}

/** Remember everything a successful scan found in `root`. */
async function registerScan(root: string, walk: WalkResult): Promise<void> {
  const real = await canonicalRoot(root);
  if (!real) return;
  scannedRoots.set(
    real,
    new Set([...Object.keys(walk.files), ...Object.keys(walk.assets)]),
  );
  /* keep memory bounded on long-running dev servers (oldest scan first) */
  while (scannedRoots.size > MAX_SCANNED_ROOTS) {
    const oldest = scannedRoots.keys().next().value;
    if (oldest === undefined) break;
    scannedRoots.delete(oldest);
  }
}

/** Refuse files that were not part of a scan of this exact folder. */
async function assertScannedFile(
  root: string,
  rel: string,
  opts: { allowManifest: boolean },
): Promise<void> {
  const real = await canonicalRoot(root);
  const known = real ? scannedRoots.get(real) : undefined;
  if (!known) {
    throw new HttpError(403, "This folder was not scanned by htmlove — open it first");
  }
  if (!known.has(rel) && !(opts.allowManifest && rel === MANIFEST_FILE_NAME)) {
    throw new HttpError(404, `Not part of the scanned folder: ${rel}`);
  }
}

/**
 * Realpath of `abs` when it may not exist yet: the deepest existing
 * ancestor is canonicalised and the remaining segments are appended.
 */
async function realpathNearest(abs: string): Promise<string> {
  let dir = path.dirname(abs);
  const tail = [path.basename(abs)];
  for (;;) {
    try {
      const realDir = await fs.realpath(dir);
      return path.join(realDir, ...tail.reverse());
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      tail.push(path.basename(dir));
      dir = parent;
    }
  }
}

/**
 * Canonicalise `abs` through any symlinks and make sure it stays inside
 * `root`. A symlink planted in the folder can therefore never be used to
 * read or write a file elsewhere on the machine.
 */
async function assertRealWithin(
  root: string,
  abs: string,
  opts: { mustExist: boolean },
): Promise<void> {
  const realRoot = await canonicalRoot(root);
  if (!realRoot) throw new HttpError(404, `Folder not found: ${root}`);
  let realTarget: string;
  try {
    realTarget = await fs.realpath(abs);
  } catch {
    if (opts.mustExist) throw new HttpError(404, `Not found: ${path.basename(abs)}`);
    realTarget = await realpathNearest(abs);
  }
  if (!isWithin(realRoot, realTarget)) {
    throw new HttpError(400, `Path escapes the selected folder: ${path.basename(abs)}`);
  }
}

async function isDirectory(abs: string): Promise<boolean> {
  const st = await fs.stat(abs).catch(() => null);
  return st?.isDirectory() ?? false;
}

/* ------------------------------------------------------------------ */
/* folder walking                                                      */
/* ------------------------------------------------------------------ */

export interface SkippedEntry {
  path: string;
  reason: string;
}

export interface WalkResult {
  files: Record<string, string>; // rel path -> text content
  assets: Record<string, number>; // rel path -> size in bytes
  skipped: SkippedEntry[];
}

const toRel = (root: string, abs: string) =>
  path.relative(root, abs).split(path.sep).join("/");

/** Recursively collect the interesting files under `root`. */
export async function walkFolder(root: string): Promise<WalkResult> {
  const absRoot = path.resolve(root);
  const st = await fs.stat(absRoot).catch(() => null);
  if (!st) throw new HttpError(404, `Folder not found: ${absRoot}`);
  if (!st.isDirectory()) throw new HttpError(400, `Not a folder: ${absRoot}`);

  const files: Record<string, string> = {};
  const assets: Record<string, number> = {};
  const skipped: SkippedEntry[] = [];
  const queue: string[] = [absRoot];
  let entryCount = 0;

  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      skipped.push({ path: toRel(absRoot, dir), reason: "unreadable folder" });
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toRel(absRoot, abs);

      if (entry.isSymbolicLink()) {
        skipped.push({ path: rel, reason: "symbolic link" });
        continue;
      }
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) queue.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      if (entryCount >= MAX_ENTRIES) {
        skipped.push({ path: rel, reason: "scan limit reached" });
        continue;
      }

      const isEditable = isEditableFile(entry.name);
      const isAsset = isAssetFile(entry.name);
      if (!isEditable && !isAsset) {
        if (!entry.name.startsWith(".")) {
          skipped.push({ path: rel, reason: "unsupported file type" });
        }
        continue;
      }

      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) {
        skipped.push({ path: rel, reason: "unreadable" });
        continue;
      }

      if (isAsset) {
        assets[rel] = stat.size;
        entryCount++;
        continue;
      }

      if (stat.size > MAX_TEXT_FILE_BYTES) {
        skipped.push({ path: rel, reason: "too large to load (> 512 KB)" });
        continue;
      }

      try {
        files[rel] = await fs.readFile(abs, "utf8");
        entryCount++;
      } catch {
        skipped.push({ path: rel, reason: "unreadable" });
      }
    }
  }

  return { files, assets, skipped };
}

/* ------------------------------------------------------------------ */
/* HTTP middleware                                                     */
/* ------------------------------------------------------------------ */

type NextFn = (err?: unknown) => void;

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export const MANIFEST_FILE_NAME = "playground.deps.json";

/**
 * Connect-style middleware for everything under /api/fs/.
 * Requests outside that prefix fall through to `next`.
 */
export function fsApiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: NextFn,
): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/fs/")) {
    next();
    return;
  }
  handleFsRequest(req, res, url).catch((err: unknown) => {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  });
}

async function handleFsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const route = url.pathname;

  /* ---- GET /api/fs/home : where should the picker start? ---- */
  if (route === "/api/fs/home") {
    if (req.method !== "GET") throw new HttpError(405, "GET only");
    sendJson(res, 200, { home: os.homedir() });
    return;
  }

  /* ---- GET /api/fs/browse?path= : list subfolders for the picker ---- */
  if (route === "/api/fs/browse") {
    if (req.method !== "GET") throw new HttpError(405, "GET only");
    const target = path.resolve(url.searchParams.get("path") ?? os.homedir());
    const st = await fs.stat(target).catch(() => null);
    if (!st) throw new HttpError(404, `Folder not found: ${target}`);
    if (!st.isDirectory()) throw new HttpError(400, `Not a folder: ${target}`);
    const dirents = await fs.readdir(target, { withFileTypes: true });
    const entries = dirents
      .filter((d) => d.isDirectory() && !shouldSkipDir(d.name))
      .map((d) => {
        const abs = path.join(target, d.name);
        return { name: d.name, path: abs };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = path.dirname(target);
    sendJson(res, 200, {
      path: target,
      parent: parent === target ? null : parent,
      entries,
    });
    return;
  }

  /* ---- POST /api/fs/scan { path } : read a whole folder ---- */
  if (route === "/api/fs/scan") {
    if (req.method !== "POST") throw new HttpError(405, "POST only");
    const body = await readJsonBody<{ path?: string }>(req);
    if (!body.path) throw new HttpError(400, "Missing folder path");
    const root = path.resolve(body.path);
    const walk = await walkFolder(root);
    /* a successful scan is what unlocks read/write for this folder */
    await registerScan(root, walk);
    const manifestRel = Object.keys(walk.files).find(
      (rel) => rel === MANIFEST_FILE_NAME || rel.endsWith("/" + MANIFEST_FILE_NAME),
    );
    sendJson(res, 200, {
      root,
      label: path.basename(root),
      files: walk.files,
      assets: walk.assets,
      skipped: walk.skipped,
      manifestText: manifestRel ? walk.files[manifestRel] : null,
    });
    return;
  }

  /* ---- PUT /api/fs/file { root, path, content } : save a file ---- */
  if (route === "/api/fs/file") {
    if (req.method !== "PUT") throw new HttpError(405, "PUT only");
    const body = await readJsonBody<{ root?: string; path?: string; content?: string }>(req);
    if (!body.root || !body.path) throw new HttpError(400, "Missing root or path");
    if (typeof body.content !== "string") throw new HttpError(400, "Missing content");
    const isManifest = body.path === MANIFEST_FILE_NAME;
    if (!isManifest && !isEditableFile(body.path)) {
      throw new HttpError(400, `Not an editable text file: ${body.path}`);
    }
    /* lexical containment first, then "was this file scanned?", then symlinks */
    const abs = resolveWithin(body.root, body.path);
    await assertScannedFile(body.root, body.path, { allowManifest: true });
    await assertRealWithin(body.root, abs, { mustExist: false });
    if (await isDirectory(abs)) throw new HttpError(400, `Not a file: ${body.path}`);
    await fs.writeFile(abs, body.content, "utf8");
    sendJson(res, 200, { ok: true, path: abs, bytes: Buffer.byteLength(body.content) });
    return;
  }

  /* ---- GET /api/fs/asset?root=&path= : stream a static asset ---- */
  if (route === "/api/fs/asset") {
    if (req.method !== "GET") throw new HttpError(405, "GET only");
    const root = url.searchParams.get("root");
    const rel = url.searchParams.get("path");
    if (!root || !rel) throw new HttpError(400, "Missing root or path");
    if (!isAssetFile(rel)) throw new HttpError(400, `Not a servable asset: ${rel}`);
    const abs = resolveWithin(root, rel);
    await assertScannedFile(root, rel, { allowManifest: false });
    await assertRealWithin(root, abs, { mustExist: true });
    const st = await fs.stat(abs).catch(() => null);
    if (!st || !st.isFile()) throw new HttpError(404, `Asset not found: ${rel}`);
    res.statusCode = 200;
    res.setHeader("content-type", mimeFor(abs));
    res.setHeader("content-length", st.size);
    res.setHeader("cache-control", "no-store");
    const stream = createReadStream(abs);
    stream.pipe(res);
    return;
  }

  throw new HttpError(404, `Unknown fs route: ${route}`);
}
