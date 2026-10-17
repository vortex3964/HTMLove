/**
 * Tests for the pure edit helpers: what the preview reads, what counts
 * as dirty and how saves fold into the baseline.
 */
import { describe, expect, it } from "vitest";
import {
  applySavedFiles,
  componentPaths,
  dirtyPaths,
  effectiveFile,
  languageFor,
} from "../src/core/edits";
import type { Component, Session } from "../src/core/types";

function makeSession(overrides?: Partial<Session>): Session {
  return {
    backendKind: "server",
    root: "/fake",
    label: "fake",
    files: new Map([
      ["a/hi.html", "<div>v1</div>"],
      ["a/hi.css", ".x{color:red}"],
    ]),
    edits: new Map(),
    assets: new Map(),
    skipped: [],
    manifestText: null,
    catalog: [],
    ...overrides,
  };
}

describe("effectiveFile", () => {
  it("returns the on-disk content when there is no edit", () => {
    expect(effectiveFile(makeSession(), "a/hi.html")).toBe("<div>v1</div>");
  });

  it("prefers the live edit over the disk version", () => {
    const session = makeSession({ edits: new Map([["a/hi.html", "<div>v2</div>"]]) });
    expect(effectiveFile(session, "a/hi.html")).toBe("<div>v2</div>");
  });

  it("returns empty string for missing paths", () => {
    expect(effectiveFile(makeSession(), undefined)).toBe("");
    expect(effectiveFile(makeSession(), "nope.txt")).toBe("");
  });
});

describe("dirtyPaths", () => {
  it("lists only edits that differ from the baseline", () => {
    const session = makeSession({
      edits: new Map([
        ["a/hi.html", "<div>changed</div>"],
        ["a/hi.css", ".x{color:red}"], // identical to disk
      ]),
    });
    expect(dirtyPaths(session)).toEqual(["a/hi.html"]);
  });

  it("is empty without edits", () => {
    expect(dirtyPaths(makeSession())).toEqual([]);
  });
});

describe("applySavedFiles", () => {
  it("moves saved content into the baseline and clears those edits", () => {
    const session = makeSession({ edits: new Map([["a/hi.html", "<div>v2</div>"]]) });
    const next = applySavedFiles(session, new Map([["a/hi.html", "<div>v2</div>"]]));

    expect(next.files.get("a/hi.html")).toBe("<div>v2</div>");
    expect(next.edits.has("a/hi.html")).toBe(false);
    expect(dirtyPaths(next)).toEqual([]);
    /* original session is untouched */
    expect(session.files.get("a/hi.html")).toBe("<div>v1</div>");
  });
});

describe("componentPaths / languageFor", () => {
  const component: Component = {
    id: "a/hi.html",
    name: "a",
    dir: "a",
    kind: "html",
    htmlPath: "a/hi.html",
    cssPath: "a/hi.css",
    usesTailwind: false,
    cssOnly: false,
    screenshots: [],
  };

  it("collects every file of a component in tab order", () => {
    expect(componentPaths(component)).toEqual(["a/hi.html", "a/hi.css"]);
    expect(componentPaths({ ...component, cssPath: undefined })).toEqual(["a/hi.html"]);
  });

  it("maps extensions to editor languages", () => {
    expect(languageFor("x.html")).toBe("html");
    expect(languageFor("x.css")).toBe("css");
    expect(languageFor("x.tsx")).toBe("javascript");
    expect(languageFor("x.jsx")).toBe("javascript");
    expect(languageFor("snippet.txt")).toBe("html");
  });
});
