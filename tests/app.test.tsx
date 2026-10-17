// @vitest-environment jsdom
/**
 * App-level integration test with a mocked file API: renders the real
 * App and walks the dashboard journey — pick a folder, land on the
 * board, pull a component in, open its code drawer and come back; plus
 * the folder-memory fallbacks. The heavy pieces (editors, iframes,
 * wasm) have their own tests.
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
      if (body.path === SNAPSHOT.root) return jsonResponse(SNAPSHOT);
      return jsonResponse({ error: `no folder at ${body.path}` }, 404);
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

/** Sidebar rows are li[role=button], not real buttons. */
function row(text: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>("li[role='button']")].find((el) =>
    (el.textContent ?? "").includes(text),
  );
  if (!found) throw new Error(`no sidebar row containing "${text}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await settle();
}

async function mountApp() {
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(App));
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

  it("walks from picking a folder to the dashboard", async () => {
    await click(button("Choose folder"));

    /* the picker opened, fetched home and listed its contents */
    expect(document.body.textContent).toContain("Choose a folder");
    expect(document.body.textContent).toContain("/fake/home");
    expect(document.body.textContent).toContain("components");

    /* browse one level down, then use that folder */
    await click(button("components"));
    await click(button("Use this folder"));

    expect(scanned).toEqual(["/fake/home/components"]);
    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.textContent).toContain("Alpha");
    expect(container.textContent).toContain("beta");
    expect(container.textContent).toContain("/fake/home/components");
    expect(container.textContent).toContain("Your board is empty");
  });

  it("pulls a component onto the board and opens its code drawer", async () => {
    await loadFixtureFolder();

    await click(row("Alpha"));
    expect(container.querySelectorAll(".panel")).toHaveLength(1);
    /* the preview iframe is mounted inside the panel */
    expect(container.querySelector(".panel iframe")).toBeTruthy();

    await click(button("Edit code"));
    const drawer = container.querySelector(".drawer");
    expect(drawer).toBeTruthy();
    expect(drawer?.textContent).toContain("alpha.html");
    /* the drawer is the rightmost column; the sidebar stays visible */
    const workspace = container.querySelector(".workspace");
    expect(workspace?.lastElementChild?.classList.contains("drawer")).toBe(true);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    await click(container.querySelector<HTMLElement>('[aria-label="Close the editor"]')!);
    expect(container.querySelector(".drawer")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeTruthy();
    /* the panel stayed put while the drawer was open */
    expect(container.querySelectorAll(".panel")).toHaveLength(1);
  });

  it("opens the dependency doctor and comes back to the board", async () => {
    await loadFixtureFolder();

    await click(button("Doctor"));

    expect(container.textContent).toContain("Dependency doctor");
    expect(container.textContent).toContain("2 components");
    expect(container.textContent).toContain("Probe all");
    expect(container.textContent).toContain("playground.deps.json");
    /* no tsx in this folder: imports column is honest about it */
    expect(container.textContent).toContain("only problems");

    await click(button("Board"));
    expect(container.querySelector(".board")).toBeTruthy();
    expect(container.textContent).not.toContain("Dependency doctor");
  });

  it("reopens the folder from last time — and falls back when it is gone", async () => {
    /* relaunch with a remembered folder: no picker, straight in */
    await act(async () => root.unmount());
    localStorage.setItem(
      "htmlove:last-folder",
      JSON.stringify({ root: "/fake/home/components", label: "components" }),
    );
    await mountApp();
    expect(scanned).toEqual(["/fake/home/components"]);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    /* relaunch where the folder moved away: notice + picker + memory cleared */
    await act(async () => root.unmount());
    localStorage.setItem(
      "htmlove:last-folder",
      JSON.stringify({ root: "/moved/away", label: "away" }),
    );
    await mountApp();
    expect(scanned).toEqual(["/fake/home/components", "/moved/away"]);
    expect(container.textContent).toContain("Couldn't reopen your last folder");
    expect(document.querySelector(".modal")).toBeTruthy();
    expect(localStorage.getItem("htmlove:last-folder")).toBeNull();
  });
});
