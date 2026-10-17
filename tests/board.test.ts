/**
 * board — the pure helpers behind the dashboard: mounting, panel
 * placement and the props JSON people type into a panel.
 */
import { describe, expect, it } from "vitest";
import {
  addToBoard,
  clampBox,
  DEFAULT_PANEL_SIZE,
  fillLayout,
  formatPropsJson,
  freeSpot,
  MIN_PANEL_SIZE,
  normalizeBoard,
  normalizeLayout,
  normalizeProps,
  overlaps,
  PANEL_GAP,
  parsePropsJson,
  removeFromBoard,
} from "../src/core/board";

const VALID = new Set(["a", "b", "c", "d"]);

describe("normalizeBoard", () => {
  it("keeps known ids in order and drops everything else", () => {
    expect(normalizeBoard(["b", "gone", "a", "b", 42], VALID)).toEqual(["b", "a"]);
    expect(normalizeBoard(undefined, VALID)).toEqual([]);
    expect(normalizeBoard("a", VALID)).toEqual([]);
  });
});

describe("normalizeProps", () => {
  it("keeps object props for known components only", () => {
    const stored = { a: { x: 1 }, gone: { y: 2 }, b: [1, 2], c: null };
    expect(normalizeProps(stored, VALID)).toEqual({ a: { x: 1 } });
    expect(normalizeProps(null, VALID)).toEqual({});
  });
});

describe("mounting", () => {
  it("adds once and removes cleanly", () => {
    expect(addToBoard(["a"], "b")).toEqual(["a", "b"]);
    expect(addToBoard(["a"], "a")).toEqual(["a"]);
    expect(removeFromBoard(["a", "b", "a"], "a")).toEqual(["b"]);
  });
});

describe("panel layout", () => {
  it("normalizes stored boxes: known ids only, rounded and clamped", () => {
    const stored = {
      a: { x: -10.4, y: 5.6, w: 100, h: 80 },
      b: { x: 10, y: 20, w: 400, h: 350 },
      gone: { x: 0, y: 0, w: 300, h: 300 },
      c: { x: 1, y: 2, w: "wide", h: 300 },
      d: null,
    };
    expect(normalizeLayout(stored, VALID)).toEqual({
      a: { x: 0, y: 6, w: MIN_PANEL_SIZE.w, h: MIN_PANEL_SIZE.h },
      b: { x: 10, y: 20, w: 400, h: 350 },
    });
    expect(normalizeLayout("nope", VALID)).toEqual({});
    expect(normalizeLayout([{ x: 0 }], VALID)).toEqual({});
  });

  it("clamps a box to the canvas and to the minimum sizes", () => {
    expect(clampBox({ x: 700, y: -20, w: 380, h: 350 }, 800)).toEqual({
      x: 420,
      y: 0,
      w: 380,
      h: 350,
    });
    expect(clampBox({ x: -5, y: 4, w: 10, h: 10 }, 800)).toEqual({
      x: 0,
      y: 4,
      w: MIN_PANEL_SIZE.w,
      h: MIN_PANEL_SIZE.h,
    });
    /* width not measured yet: only the minimums apply */
    expect(clampBox({ x: 700, y: 10, w: 380, h: 350 }, 0)).toEqual({
      x: 700,
      y: 10,
      w: 380,
      h: 350,
    });
  });

  it("places a new panel in the first free slot of a row-major grid", () => {
    const size = { w: 380, h: 350 };
    expect(freeSpot([], 800, size)).toEqual({ x: 0, y: 0 });
    const first = { x: 0, y: 0, ...size };
    expect(freeSpot([first], 800, size)).toEqual({ x: size.w + PANEL_GAP, y: 0 });
    const second = { x: size.w + PANEL_GAP, y: 0, ...size };
    expect(freeSpot([first, second], 800, size)).toEqual({ x: 0, y: size.h + PANEL_GAP });
  });

  it("skips the rows a tall panel already blocks", () => {
    const blocked = [{ x: 0, y: 0, w: 800, h: 400 }];
    const spot = freeSpot(blocked, 800);
    expect(spot).toEqual({ x: 0, y: 2 * (DEFAULT_PANEL_SIZE.h + PANEL_GAP) });
    expect(overlaps({ ...spot, ...DEFAULT_PANEL_SIZE }, blocked[0])).toBe(false);
  });

  it("fills a layout so every mounted id has a box", () => {
    const stored = { a: { x: 10, y: 10, w: 300, h: 250 } };
    const filled = fillLayout(["a", "b", "c"], stored, 800);
    expect(filled.a).toEqual(stored.a);
    expect(overlaps(filled.a, filled.b)).toBe(false);
    expect(overlaps(filled.b, filled.c)).toBe(false);
    expect(filled.b.w).toBe(DEFAULT_PANEL_SIZE.w);
    expect(filled.b.h).toBe(DEFAULT_PANEL_SIZE.h);
  });
});

describe("props json", () => {
  it("treats empty text as no props", () => {
    expect(parsePropsJson("  ")).toEqual({ ok: true, props: {} });
    expect(formatPropsJson({})).toBe("");
  });

  it("accepts a JSON object and formats it back", () => {
    const parsed = parsePropsJson('{"slides":[{"id":1}]}');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.props).toEqual({ slides: [{ id: 1 }] });
      expect(formatPropsJson(parsed.props)).toBe('{\n  "slides": [\n    {\n      "id": 1\n    }\n  ]\n}');
    }
  });

  it("rejects invalid JSON and non-objects with a readable error", () => {
    const bad = parsePropsJson("{nope");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("Not valid JSON");

    const array = parsePropsJson("[1,2]");
    expect(array.ok).toBe(false);
    if (!array.ok) expect(array.error).toContain("JSON object");

    expect(parsePropsJson("null").ok).toBe(false);
  });
});
