/**
 * Tests for the Resolve action's plumbing: walking an import graph
 * across raw repos and registry items, and the /api/fs/resolve endpoint
 * that writes the fetched files into the scanned folder.
 *
 * A tiny fixture HTTP server plays the part of the internet, so the
 * rules can point at localhost instead of real registries.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fsApiMiddleware } from "../server/fsApi";
import { resolveImports } from "../server/resolveImports";

/* ------------------------------------------------------------------ */
/* the fixture internet                                                */
/* ------------------------------------------------------------------ */

const FIXTURES: Record<string, string> = {
  "/repo/components/base/buttons/button.tsx": [
    'import { inner } from "./inner";',
    'import { group } from "./group";',
    'import { cx } from "@/utils/cx";',
    'import { cn } from "@/lib/utils";',
    'import { ChevronLeft } from "lucide-react";',
    "export const Button = [inner, group, cx, cn, ChevronLeft].length;",
    "",
  ].join("\n"),
  "/repo/components/base/buttons/inner.ts": "export const inner = 1;\n",
  "/repo/components/base/buttons/group/index.tsx": "export const group = 2;\n",
  "/repo/utils/cx.ts": "export const cx = 1;\n",
  "/registry/card.json": JSON.stringify({
    name: "card",
    type: "registry:ui",
    files: [
      {
        path: "ui/card.tsx",
        target: "",
        content: 'import { cn } from "@/lib/utils";\nimport "./card-body";\nexport const Card = cn;\n',
      },
      { path: "ui/card-body.tsx", target: "", content: "export const body = 3;\n" },
    ],
  }),
};

let web: http.Server;
let origin: string;

beforeAll(async () => {
  web = http.createServer((req, res) => {
    const body = FIXTURES[req.url ?? ""];
    if (body === undefined) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.statusCode = 200;
    res.end(body);
  });
  await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => web.close(resolve));
});

/** Rules that map the fixture's paths. */
const rules = () => ({
  "@/components/base/*": `rawbase:${origin}/repo/components/base/*`,
  "@/utils/cx": `url:${origin}/repo/utils/cx.ts`,
  "./card": `registry:${origin}/registry/card.json`,
});

/* ------------------------------------------------------------------ */
/* resolveImports                                                      */
/* ------------------------------------------------------------------ */

describe("resolveImports", () => {
  it("walks nested imports, index files, registries and builtin presets", async () => {
    const outcome = await resolveImports({
      requests: [
        { specifier: "@/components/base/buttons/button", fromDir: "" },
        { specifier: "./card", fromDir: "" },
      ],
      resolve: rules(),
      exists: async () => false,
    });

    expect([...outcome.files.keys()].sort()).toEqual([
      "card-body.tsx",
      "card.tsx",
      "components/base/buttons/button.tsx",
      "components/base/buttons/group/index.tsx",
      "components/base/buttons/inner.ts",
      "components/lib/utils.ts",
      "components/utils/cx.ts",
      "lib/utils.ts",
    ]);
    expect(outcome.unresolved).toEqual([]);
    expect(outcome.files.get("lib/utils.ts")).toContain("twMerge");
    /* npm imports are left to the preview's import map */
    expect(outcome.files.get("components/base/buttons/button.tsx")).toContain("lucide-react");
  });

  it("never overwrites files that already exist", async () => {
    const outcome = await resolveImports({
      requests: [{ specifier: "./card", fromDir: "" }],
      resolve: rules(),
      exists: async (rel) => rel === "card.tsx",
    });
    expect(outcome.files.has("card.tsx")).toBe(false);
    expect(outcome.files.size).toBe(0);
    expect(outcome.skipped.some((s) => s.path === "card.tsx")).toBe(true);
    expect(outcome.unresolved).toEqual([]);
  });

  it("reports unmatched imports and bad rules", async () => {
    const outcome = await resolveImports({
      requests: [
        { specifier: "@/nothing/here", fromDir: "" },
        { specifier: "./bad", fromDir: "" },
      ],
      resolve: { "./bad": "ftp://nope" },
      exists: async () => false,
    });
    expect(outcome.files.size).toBe(0);
    const reasons = new Map(outcome.unresolved.map((u) => [u.specifier, u.reason]));
    expect(reasons.get("@/nothing/here")).toContain("no resolve rule");
    expect(reasons.get("./bad")).toContain("unknown source");
  });

  it("keeps a nested relative import inside its remote neighbourhood", async () => {
    const outcome = await resolveImports({
      requests: [{ specifier: "@/components/base/buttons/button", fromDir: "" }],
      resolve: rules(),
      exists: async () => false,
    });
    /* ./group only exists as group/index.tsx next to the remote file */
    expect(outcome.files.has("components/base/buttons/group/index.tsx")).toBe(true);
  });

  it("writes `@/` files into the snippet folder, not the scan root", async () => {
    const outcome = await resolveImports({
      requests: [{ specifier: "@/lib/utils", fromDir: "carousel" }],
      resolve: {},
      exists: async () => false,
    });
    expect([...outcome.files.keys()]).toEqual(["carousel/lib/utils.ts"]);
  });

  it("accepts a scan-root copy as already satisfied", async () => {
    const outcome = await resolveImports({
      requests: [{ specifier: "@/lib/utils", fromDir: "carousel" }],
      resolve: {},
      exists: async (rel) => rel === "lib/utils.ts",
    });
    expect(outcome.files.size).toBe(0);
    expect(outcome.skipped.some((s) => s.path === "lib/utils.ts")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/fs/resolve                                                */
/* ------------------------------------------------------------------ */

describe("resolve over HTTP", () => {
  let tmp: string;
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "htmlove-resolve-"));
    server = http.createServer((req, res) => {
      fsApiMiddleware(req, res, () => {
        res.statusCode = 404;
        res.end("fell through");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const scan = await fetch(`${base}/api/fs/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: tmp }),
    });
    expect(scan.status).toBe(200);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const resolveCall = (body: unknown) =>
    fetch(`${base}/api/fs/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("fetches the files and writes them into the folder", async () => {
    const res = await resolveCall({
      root: tmp,
      resolve: rules(),
      requests: [
        { specifier: "@/components/base/buttons/button", fromDir: "" },
        { specifier: "./card", fromDir: "" },
      ],
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.unresolved).toEqual([]);
    expect([...data.written].sort()).toEqual([
      "card-body.tsx",
      "card.tsx",
      "components/base/buttons/button.tsx",
      "components/base/buttons/group/index.tsx",
      "components/base/buttons/inner.ts",
      "components/lib/utils.ts",
      "components/utils/cx.ts",
      "lib/utils.ts",
    ]);
    const onDisk = await fs.readFile(
      path.join(tmp, "components/base/buttons/button.tsx"),
      "utf8",
    );
    expect(onDisk).toContain("./inner");
    expect(await fs.readFile(path.join(tmp, "lib/utils.ts"), "utf8")).toContain("twMerge");
  });

  it("leaves existing files alone on a second run", async () => {
    const res = await resolveCall({
      root: tmp,
      resolve: rules(),
      requests: [{ specifier: "./card", fromDir: "" }],
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.written).toEqual([]);
    expect(data.skipped.some((s: { path: string }) => s.path === "card.tsx")).toBe(true);
  });

  it("refuses roots that were never scanned", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "htmlove-resolve-unscanned-"));
    try {
      const res = await resolveCall({
        root: other,
        resolve: {},
        requests: [{ specifier: "@/lib/utils", fromDir: "" }],
      });
      expect(res.status).toBe(403);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it("rejects requests without targets", async () => {
    const res = await resolveCall({ root: tmp, resolve: {}, requests: [] });
    expect(res.status).toBe(400);
  });
});
