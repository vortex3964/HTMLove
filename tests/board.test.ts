/**
 * board — the pure helpers behind the dashboard: mounting, ordering and
 * the props JSON people type into a panel.
 */
import { describe, expect, it } from "vitest";
import {
  addToBoard,
  formatPropsJson,
  insertionIndex,
  moveOnBoard,
  normalizeBoard,
  normalizeProps,
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

describe("mounting and ordering", () => {
  it("adds once and removes cleanly", () => {
    expect(addToBoard(["a"], "b")).toEqual(["a", "b"]);
    expect(addToBoard(["a"], "a")).toEqual(["a"]);
    expect(removeFromBoard(["a", "b", "a"], "a")).toEqual(["b"]);
  });

  it("moves a component before an index of the original list", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveOnBoard(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveOnBoard(ids, "a", 3)).toEqual(["b", "c", "a", "d"]);
    expect(moveOnBoard(ids, "b", 1)).toEqual(ids);
    expect(moveOnBoard(ids, "b", 4)).toEqual(["a", "c", "d", "b"]);
    expect(moveOnBoard(ids, "gone", 2)).toEqual(ids);
  });

  it("computes the drop index from the target panel and side", () => {
    const ids = ["a", "b", "c"];
    expect(insertionIndex(ids, "b", "before")).toBe(1);
    expect(insertionIndex(ids, "b", "after")).toBe(2);
    expect(insertionIndex(ids, "gone", "before")).toBe(3);
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
