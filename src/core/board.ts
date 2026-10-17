/**
 * board — pure helpers behind the dashboard: which components are
 * mounted, in which order (that is also the stacking order), where
 * their panels sit and how big they are, and how the props JSON people
 * type into a panel is kept valid.
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

/* ------------------------------------------------------------------ */
/* panels: a free canvas of little windows                             */
/* ------------------------------------------------------------------ */

/** A panel's rectangle on the board canvas, in canvas pixels. */
export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Size a freshly added panel gets (and what Add all uses). */
export const DEFAULT_PANEL_SIZE = { w: 380, h: 350 };
/** Below this a panel preview stops being useful. */
export const MIN_PANEL_SIZE = { w: 240, h: 200 };
/** Sanity cap for hand-edited storage; nothing user-facing. */
const MAX_PANEL_DIM = 3000;
/** Breathing room between panels placed automatically. */
export const PANEL_GAP = 16;

export function defaultPanelBox(): PanelBox {
  return { x: 0, y: 0, ...DEFAULT_PANEL_SIZE };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function toBox(raw: unknown): PanelBox | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, y, w, h } = raw as Partial<PanelBox>;
  for (const n of [x, y, w, h]) {
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
  }
  return {
    x: Math.max(0, Math.round(x as number)),
    y: Math.max(0, Math.round(y as number)),
    w: clamp(Math.round(w as number), MIN_PANEL_SIZE.w, MAX_PANEL_DIM),
    h: clamp(Math.round(h as number), MIN_PANEL_SIZE.h, MAX_PANEL_DIM),
  };
}

/** Keep only boxes of known components, clamped to sane numbers. */
export function normalizeLayout(
  value: unknown,
  valid: ReadonlySet<string>,
): Record<string, PanelBox> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, PanelBox> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!valid.has(id)) continue;
    const box = toBox(raw);
    if (box) out[id] = box;
  }
  return out;
}

/**
 * Fit a box to the canvas while moving or resizing: never smaller than
 * the minimum, never off the left/top edge, and — when the canvas width
 * is known — never off the right edge either. A width of 0 (layout not
 * measured yet) only clamps the minimums.
 */
export function clampBox(box: PanelBox, width: number): PanelBox {
  const maxW = width > 0 ? Math.max(MIN_PANEL_SIZE.w, width) : Number.POSITIVE_INFINITY;
  const w = Math.round(clamp(box.w, MIN_PANEL_SIZE.w, maxW));
  const h = Math.round(clamp(box.h, MIN_PANEL_SIZE.h, MAX_PANEL_DIM));
  const x = Math.round(width > 0 ? clamp(box.x, 0, Math.max(0, width - w)) : Math.max(0, box.x));
  const y = Math.round(Math.max(0, box.y));
  return { x, y, w, h };
}

export function overlaps(a: PanelBox, b: PanelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The boxes of the given ids, in order (ids without a box are skipped). */
export function boardBoxes(ids: string[], layout: Record<string, PanelBox>): PanelBox[] {
  const out: PanelBox[] = [];
  for (const id of ids) {
    const box = layout[id];
    if (box) out.push(box);
  }
  return out;
}

/**
 * First free slot in a row-major grid of default-sized panels, so a
 * component added by click or by "Add all" never lands on top of a
 * panel that is already there. Falls below everything when the rows
 * are full (or the canvas width is unknown).
 */
export function freeSpot(
  existing: readonly PanelBox[],
  width: number,
  size: { w: number; h: number } = DEFAULT_PANEL_SIZE,
): { x: number; y: number } {
  const usable = width > 0 ? width : 1200;
  const cols = Math.max(1, Math.floor((usable + PANEL_GAP) / (size.w + PANEL_GAP)));
  for (let row = 0; row < 300; row++) {
    for (let col = 0; col < cols; col++) {
      const spot = {
        x: col * (size.w + PANEL_GAP),
        y: row * (size.h + PANEL_GAP),
        ...size,
      };
      if (!existing.some((box) => overlaps(spot, box))) return { x: spot.x, y: spot.y };
    }
  }
  const bottom = existing.reduce((max, box) => Math.max(max, box.y + box.h), 0);
  return { x: 0, y: bottom + PANEL_GAP };
}

/**
 * Make sure every mounted id has a box: stored ones are kept as they
 * are, the rest are placed in the first free slot in board order.
 */
export function fillLayout(
  ids: string[],
  layout: Record<string, PanelBox>,
  width: number,
): Record<string, PanelBox> {
  const out: Record<string, PanelBox> = {};
  const placed: PanelBox[] = [];
  for (const id of ids) {
    const box = layout[id] ?? { ...freeSpot(placed, width), ...DEFAULT_PANEL_SIZE };
    out[id] = box;
    placed.push(box);
  }
  return out;
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
 * In-flight drag from the sidebar (new components). dataTransfer cannot
 * be read during dragover in every browser, so the payload lives here
 * instead. Panels on the board are moved with plain pointer gestures.
 */
export const dragSession: { kind: "new" | null; id: string | null } = {
  kind: null,
  id: null,
};
