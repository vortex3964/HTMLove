/**
 * resolveImports — the server half of the doctor's Resolve action.
 *
 * Walks the import graph of every unresolved specifier, fetches each
 * module from the source a `resolve` rule (or a built-in preset) points
 * at, and follows the imports of every fetched file the same way — so a
 * single rule can vendor a whole component tree. Nothing is written to
 * disk here; fsApi.ts owns the filesystem and the containment checks.
 *
 * Extension probing mirrors the client's resolver: `X` is tried as
 * `X.tsx`, `X.ts`, … and then as `X/index.tsx`, … so rule paths never
 * have to guess extensions. Files already present in the folder are
 * reported as skipped and never overwritten.
 */
import { dirnameOf, joinPaths, localBasesFor, parseImports } from "../src/core/imports.ts";
import { sourceForSpecifier } from "../src/core/resolve.ts";

export interface ResolveRequest {
  specifier: string;
  fromDir: string;
}

export interface UnresolvedImport {
  specifier: string;
  reason: string;
}

export interface SkippedResolve {
  path: string;
  reason: string;
}

export interface ResolveOutcome {
  /** New files to write: rel path inside the folder -> text content. */
  files: Map<string, string>;
  unresolved: UnresolvedImport[];
  skipped: SkippedResolve[];
  notes: string[];
}

/** Probing order for extension-less rule paths (mirrors imports.ts). */
const PROBE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".json"];
const KNOWN_EXT = /\.(tsx?|jsx?|mjs|cjs|css|json)$/i;

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

interface ProbeHit {
  text: string;
  /** Extension or `/index.ext` that made the probe succeed. */
  suffix: string;
}

/** Where a fetched file lives remotely, so nested `./x` stay in the repo. */
interface Via {
  probeBase: string;
  remoteDir: string;
}

interface QueueItem {
  specifier: string;
  fromDir: string;
  via?: Via;
}

interface RegistryFile {
  path?: string;
  target?: string;
  content?: string;
}

function basenameOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function extOfPath(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i);
}

function stemOf(fileName: string): string {
  const base = basenameOf(fileName);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? base : base.slice(0, dot);
}

/** Append an extension unless the path already carries one. */
function appendExt(localBase: string, ext: string): string {
  return KNOWN_EXT.test(localBase) ? localBase : localBase + ext;
}

/** Append a probe suffix (`.tsx` or `/index.tsx`) unless an ext is present. */
function appendSuffix(localBase: string, suffix: string): string {
  return KNOWN_EXT.test(localBase) ? localBase : localBase + suffix;
}

async function fetchWithTimeout(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Vendor every `request` (plus its transitive local imports) using
 * `resolve` rules from the folder's manifest. `exists` decides whether a
 * target path is already occupied — such files are left untouched.
 */
export async function resolveImports(options: {
  requests: ResolveRequest[];
  resolve: Record<string, string>;
  exists(localRelPath: string): Promise<boolean>;
}): Promise<ResolveOutcome> {
  const { requests, resolve, exists } = options;
  const files = new Map<string, string>();
  const unresolved = new Map<string, string>();
  const skipped: SkippedResolve[] = [];
  const skippedPaths = new Set<string>();
  const notes: string[] = [];
  const seen = new Set<string>();
  const fetchCache = new Map<string, string | null>();
  const queue: QueueItem[] = requests.map((r) => ({ specifier: r.specifier, fromDir: r.fromDir }));

  let totalBytes = 0;
  let fileLimitHit = false;
  let byteLimitHit = false;
  let bigFileCount = 0;

  const fetchText = async (url: string): Promise<string | null> => {
    if (fetchCache.has(url)) return fetchCache.get(url)!;
    const text = await fetchWithTimeout(url);
    fetchCache.set(url, text);
    return text;
  };

  const probe = async (base: string): Promise<ProbeHit | null> => {
    for (const ext of PROBE_EXTENSIONS) {
      const text = await fetchText(base + ext);
      if (text !== null) return { text, suffix: ext };
    }
    for (const ext of PROBE_EXTENSIONS) {
      const text = await fetchText(`${base}/index${ext}`);
      if (text !== null) return { text, suffix: `/index${ext}` };
    }
    return null;
  };

  /** Is `localBase` already satisfied — by this run or by the folder? */
  const localCandidate = async (localBase: string): Promise<string | null> => {
    const candidates = [localBase, ...PROBE_EXTENSIONS.map((ext) => localBase + ext)];
    for (const ext of PROBE_EXTENSIONS) candidates.push(`${localBase}/index${ext}`);
    for (const candidate of candidates) {
      if (files.has(candidate)) return candidate;
    }
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate;
    }
    return null;
  };

  /** Record a fetched module and queue its local imports. */
  const add = async (localPath: string, text: string, via?: Via): Promise<void> => {
    if (!localPath || files.has(localPath)) return;
    const skip = (reason: string) => {
      if (skippedPaths.has(localPath)) return;
      skippedPaths.add(localPath);
      skipped.push({ path: localPath, reason });
    };
    if (await exists(localPath)) {
      skip("already in the folder — left untouched");
      return;
    }
    if (text.length > MAX_FILE_BYTES) {
      bigFileCount++;
      skip("larger than 512 KB — not vendored");
      return;
    }
    if (files.size >= MAX_FILES) {
      fileLimitHit = true;
      return;
    }
    if (totalBytes + text.length > MAX_TOTAL_BYTES) {
      byteLimitHit = true;
      return;
    }
    totalBytes += text.length;
    files.set(localPath, text);

    for (const ref of parseImports(text)) {
      const spec = ref.specifier;
      if (spec.startsWith("@/") || spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/")) {
        queue.push({ specifier: spec, fromDir: dirnameOf(localPath), via });
      }
    }
  };

  const noteUnresolved = (specifier: string, reason: string): void => {
    if (!unresolved.has(specifier)) unresolved.set(specifier, reason);
  };

  while (queue.length > 0) {
    if (files.size >= MAX_FILES) break;
    const item = queue.shift()!;
    const key = `${item.fromDir}\u0000${item.specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bases = localBasesFor(item.specifier, item.fromDir);
    if (bases === null || bases.length === 0) {
      noteUnresolved(item.specifier, "only relative and @/ imports can be vendored");
      continue;
    }

    /* Already satisfied — by a sibling fetched earlier in this run (registry
       items ship their own files) or by something already on disk. An `@/`
       spec also counts as satisfied by a file at the scan root, because
       compilation falls back to it. */
    let already: string | null = null;
    for (const base of bases) {
      already = await localCandidate(base);
      if (already) break;
    }
    if (already) {
      if (!files.has(already) && !skippedPaths.has(already)) {
        skippedPaths.add(already);
        skipped.push({ path: already, reason: "already in the folder — left untouched" });
      }
      continue;
    }
    /* New files land at the first candidate: the snippet folder for `@/`. */
    const localBase = bases[0];

    /* A relative import inside an already-fetched file: stay in the same
       repo first, so nested files keep their original neighbourhood. */
    if (item.via && (item.specifier.startsWith("./") || item.specifier.startsWith("../"))) {
      const remotePath = joinPaths(item.via.remoteDir, item.specifier);
      const hit = await probe(item.via.probeBase + remotePath);
      if (hit) {
        await add(appendSuffix(localBase, hit.suffix), hit.text, {
          probeBase: item.via.probeBase,
          remoteDir: dirnameOf(remotePath + hit.suffix),
        });
        continue;
      }
    }

    const source = sourceForSpecifier(item.specifier, item.fromDir, resolve);
    if (!source) {
      noteUnresolved(item.specifier, "no resolve rule or preset matches this import");
      continue;
    }
    if (source.kind === "invalid") {
      noteUnresolved(item.specifier, source.reason);
      continue;
    }

    if (source.kind === "builtin") {
      await add(appendExt(localBase, ".ts"), source.text ?? "");
      continue;
    }

    if (source.kind === "probe") {
      const remotePath = source.remotePath ?? "";
      const hit = await probe((source.probeBase ?? "") + remotePath);
      if (!hit) {
        noteUnresolved(item.specifier, `not found on ${source.note}`);
        continue;
      }
      await add(appendSuffix(localBase, hit.suffix), hit.text, {
        probeBase: source.probeBase ?? "",
        remoteDir: dirnameOf(remotePath + hit.suffix),
      });
      continue;
    }

    if (source.kind === "url") {
      const text = await fetchText(source.url ?? "");
      if (text === null) {
        noteUnresolved(item.specifier, `could not fetch ${source.url}`);
        continue;
      }
      await add(appendExt(localBase, extOfPath(source.url ?? "") || ".tsx"), text);
      continue;
    }

    /* registry item */
    const json = await fetchText(source.url ?? "");
    if (json === null) {
      noteUnresolved(item.specifier, `registry item not found (${source.note})`);
      continue;
    }
    let itemFiles: RegistryFile[];
    try {
      const parsed = JSON.parse(json) as { files?: RegistryFile[] };
      itemFiles = (parsed.files ?? []).filter(
        (f) => typeof f.content === "string" && typeof (f.target || f.path) === "string",
      );
    } catch {
      noteUnresolved(item.specifier, "registry item is not valid JSON");
      continue;
    }
    if (itemFiles.length === 0) {
      noteUnresolved(item.specifier, "registry item has no files");
      continue;
    }
    const primary =
      itemFiles.find((f) => stemOf(f.path ?? f.target ?? "") === source.itemName) ?? itemFiles[0];
    const primaryLocal = appendExt(localBase, extOfPath(primary.path || primary.target || "") || ".tsx");
    await add(primaryLocal, primary.content ?? "");
    for (const extra of itemFiles) {
      if (extra === primary) continue;
      const extraName = basenameOf((extra.target || extra.path) ?? "");
      if (!extraName) continue;
      const extraLocal = appendExt(joinPaths(dirnameOf(primaryLocal), extraName), extOfPath(extraName) || ".tsx");
      await add(extraLocal, extra.content ?? "");
    }
  }

  if (fileLimitHit) notes.push(`stopped after ${MAX_FILES} files — resolve again to fetch more`);
  if (byteLimitHit) notes.push("stopped: fetched content size limit reached");
  if (bigFileCount > 0) notes.push(`${bigFileCount} file(s) skipped for being larger than 512 KB`);

  return {
    files,
    unresolved: [...unresolved.entries()].map(([specifier, reason]) => ({ specifier, reason })),
    skipped,
    notes,
  };
}
