/**
 * board — pure helpers behind the dashboard: which components are
 * mounted, in which order, where a dragged one lands, and how the props
 * JSON people type into a panel is kept valid.
 */

/**
 * Keep only known, unique component ids, in order. Anything the folder
 * no longer contains (or anything malformed) is dropped.
 */
export function normalizeBoard(ids: unknown, valid: ReadonlySet<string>): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id) || !valid.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Same, for the per-component props map. */
export function normalizeProps(
  value: unknown,
  valid: ReadonlySet<string>,
): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, props] of Object.entries(value)) {
    if (!valid.has(id)) continue;
    if (!props || typeof props !== "object" || Array.isArray(props)) continue;
    out[id] = props as Record<string, unknown>;
  }
  return out;
}

export function addToBoard(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

export function removeFromBoard(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Move `id` so it ends up before `beforeIndex` of the *original* list
 * (0…length). Indices past the end append; a no-op move returns the
 * same array so callers can skip persisting.
 */
export function moveOnBoard(ids: string[], id: string, beforeIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  let target = Math.max(0, Math.min(beforeIndex, ids.length));
  if (from < target) target -= 1;
  if (target === from) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(target, next.length)), 0, id);
  return next;
}

/** Where a drop on `targetId` should insert the dragged panel. */
export function insertionIndex(
  ids: string[],
  targetId: string,
  side: "before" | "after",
): number {
  const index = ids.indexOf(targetId);
  if (index === -1) return ids.length;
  return side === "before" ? index : index + 1;
}

/* ------------------------------------------------------------------ */
/* props JSON                                                          */
/* ------------------------------------------------------------------ */

export type PropsParse =
  | { ok: true; props: Record<string, unknown> }
  | { ok: false; error: string };

/** Parse the props popover's textarea; empty means "no props". */
export function parsePropsJson(text: string): PropsParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, props: {} };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: 'Props must be a JSON object — e.g. { "slides": [ … ] }' };
  }
  return { ok: true, props: value as Record<string, unknown> };
}

export function formatPropsJson(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return "";
  return JSON.stringify(props, null, 2);
}

/**
 * In-flight drag, shared between the sidebar (new components) and the
 * board (reordering). dataTransfer cannot be read during dragover in
 * every browser, so the payload lives here instead.
 */
export const dragSession: { kind: "new" | "move" | null; id: string | null } = {
  kind: null,
  id: null,
};
