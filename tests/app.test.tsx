// @vitest-environment jsdom
/**
 * App-level integration test with a mocked file API: renders the real
 * App and walks the main journey — choose a folder, land in the live
 * gallery, open the dependency doctor and come back. This is about
 * state flowing between the API client, the store and the views; the
 * heavy pieces (editors, iframes, wasm) have their own tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import type { RawSnapshot } from "../src/core/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOT: RawSnapshot = {
  root: "/fake/home/components",
  label: "components",
  files: {
    "Alpha/alpha.html": '<div class="card">Alpha component</div>',
    "Alpha/alpha.css": ".card{padding:4px}",
    "beta/beta.html": "<div>Beta component</div>",
  },
  assets: {},
  skipped: [],
  manifestText: null,
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as unknown as Response;
}

let container: HTMLDivElement;
let root: Root;
let scanned: string[];

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/fs/home") return jsonResponse({ home: "/fake/home" });
    if (url.startsWith("/api/fs/browse")) {
      const path = new URL(url, "http://localhost").searchParams.get("path") ?? "";
      if (path === "/fake/home") {
        return jsonResponse({
          path,
          parent: null,
          entries: [{ name: "components", path: "/fake/home/components" }],
        });
      }
      if (path === "/fake/home/components") {
        return jsonResponse({ path, parent: "/fake/home", entries: [] });
      }
      return jsonResponse({ error: `no folder at ${path}` }, 404);
    }
    if (url === "/api/fs/scan") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
      scanned.push(body.path);
      return jsonResponse(SNAPSHOT);
    }
    if (url === "/api/fs/file") return jsonResponse({ ok: true });
    return jsonResponse({ error: `unmocked ${url}` }, 404);
  });
}

/** Let every pending promise/timer flush inside act. */
async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  );
  if (!found) throw new Error(`no button containing "${text}"`);
  return found as HTMLButtonElement;
}

async function click(target: HTMLButtonElement) {
  await act(async () => {
    target.click();
  });
  await settle();
}

async function loadFixtureFolder() {
  await click(button("Choose folder"));
  await click(button("components"));
  await click(button("Use this folder"));
}

beforeEach(async () => {
  localStorage.clear();
  scanned = [];
  vi.stubGlobal("fetch", mockFetch());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(App));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("the htmlove app", () => {
  it("starts on the empty state and offers a folder picker", () => {
    expect(container.textContent).toContain("Point htmlove at a folder");
    expect(container.textContent).toContain("Choose folder");
  });

  it("walks from picking a folder to the live gallery", async () => {
    await click(button("Choose folder"));

    /* the picker opened, fetched home and listed its contents */
    expect(document.body.textContent).toContain("Choose a folder");
    expect(document.body.textContent).toContain("/fake/home");
    expect(document.body.textContent).toContain("components");

    /* browse one level down, then use that folder */
    await click(button("components"));
    await click(button("Use this folder"));

    expect(scanned).toEqual(["/fake/home/components"]);
    expect(container.textContent).toContain("2 components");
    expect(container.textContent).toContain("Alpha");
    expect(container.textContent).toContain("beta");
    expect(container.textContent).toContain("/fake/home/components");
  });

  it("opens the dependency doctor and comes back to the gallery", async () => {
    await loadFixtureFolder();

    await click(button("Doctor"));

    expect(container.textContent).toContain("Dependency doctor");
    expect(container.textContent).toContain("2 components");
    expect(container.textContent).toContain("Probe all");
    expect(container.textContent).toContain("playground.deps.json");
    /* no tsx in this folder: imports column is honest about it */
    expect(container.textContent).toContain("only problems");

    await click(button("Gallery"));
    expect(container.querySelector(".gallery-grid")).toBeTruthy();
    expect(container.textContent).not.toContain("Dependency doctor");
  });
});
