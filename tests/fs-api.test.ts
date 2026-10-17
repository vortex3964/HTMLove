/**
 * Tests for the local file API: path safety, folder walking and the
 * HTTP surface the browser talks to.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import {
  fsApiMiddleware,
  HttpError,
  resolveWithin,
  walkFolder,
} from "../server/fsApi";

/* ------------------------------------------------------------------ */
/* resolveWithin — the safety net                                      */
/* ------------------------------------------------------------------ */

describe("resolveWithin", () => {
  const root = "/home/example/components";

  it("resolves normal relative paths", () => {
    expect(resolveWithin(root, "a/b.css")).toBe(path.resolve(root, "a/b.css"));
  });

  it("allows the root itself", () => {
    expect(resolveWithin(root, "")).toBe(root);
    expect(resolveWithin(root, ".")).toBe(root);
  });

  it("refuses to climb out with ..", () => {
    expect(() => resolveWithin(root, "../secrets.txt")).toThrow(HttpError);
    expect(() => resolveWithin(root, "a/../../etc/passwd")).toThrow(HttpError);
  });

  it("refuses absolute paths outside the root", () => {
    expect(() => resolveWithin(root, "/etc/passwd")).toThrow(HttpError);
  });
});

/* ------------------------------------------------------------------ */
/* walkFolder                                                          */
/* ------------------------------------------------------------------ */

describe("walkFolder", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "htmlove-walk-"));
    await fs.mkdir(path.join(tmp, "a"), { recursive: true });
    await fs.mkdir(path.join(tmp, "a/node_modules"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(tmp, "c"), { recursive: true });

    await fs.writeFile(path.join(tmp, "a/hi.html"), "<div>hi</div>");
    await fs.writeFile(path.join(tmp, "a/hi.css"), ".x{color:red}");
    await fs.writeFile(path.join(tmp, "a/node_modules/junk.js"), "junk");
    await fs.writeFile(path.join(tmp, ".hidden/secret.js"), "secret");
    await fs.writeFile(path.join(tmp, "c/pic.png"), Buffer.alloc(64, 7));
    await fs.writeFile(path.join(tmp, "notes.md"), "# notes");
    await fs.writeFile(path.join(tmp, "big.txt"), "x".repeat(600 * 1024));
    await fs.writeFile(path.join(tmp, "archive.zip"), "not really a zip");
    await fs.symlink(tmp, path.join(tmp, "c/loop"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("collects editable files and assets, skips the noise", async () => {
    const result = await walkFolder(tmp);

    expect(Object.keys(result.files).sort()).toEqual([
      "a/hi.css",
      "a/hi.html",
      "notes.md",
    ]);
    expect(Object.keys(result.assets)).toEqual(["c/pic.png"]);
    expect(result.assets["c/pic.png"]).toBe(64);

    const reasons = new Map(result.skipped.map((s) => [s.path, s.reason]));
    expect(reasons.get("big.txt")).toContain("too large");
    expect(reasons.get("archive.zip")).toBe("unsupported file type");
    expect(reasons.get("c/loop")).toBe("symbolic link");
    expect(reasons.has("a/node_modules/junk.js")).toBe(false);
    expect(reasons.has(".hidden/secret.js")).toBe(false);
  });

  it("rejects missing folders", async () => {
    await expect(walkFolder(path.join(tmp, "nope"))).rejects.toThrow(HttpError);
  });
});

/* ------------------------------------------------------------------ */
/* the HTTP surface                                                    */
/* ------------------------------------------------------------------ */

describe("fs API over HTTP", () => {
  let tmp: string;
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "htmlove-api-"));
    await fs.mkdir(path.join(tmp, "sub"), { recursive: true });
    await fs.writeFile(path.join(tmp, "sub/thing.txt"), "hello");
    await fs.writeFile(path.join(tmp, "pic.png"), Buffer.alloc(16, 1));

    server = http.createServer((req, res) => {
      fsApiMiddleware(req, res, () => {
        res.statusCode = 404;
        res.end("fell through");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const json = async (res: Response) => {
    expect(res.headers.get("content-type")).toContain("application/json");
    return res.json();
  };

  it("serves the home folder", async () => {
    const res = await fetch(`${base}/api/fs/home`);
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(typeof data.home).toBe("string");
  });

  it("browses folders", async () => {
    const res = await fetch(`${base}/api/fs/browse?path=${encodeURIComponent(tmp)}`);
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.entries.map((e: { name: string }) => e.name)).toEqual(["sub"]);
    expect(data.parent).toBe(path.dirname(tmp));
  });

  it("scans a folder", async () => {
    const res = await fetch(`${base}/api/fs/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: tmp }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.files["sub/thing.txt"]).toBe("hello");
    expect(Object.keys(data.assets)).toEqual(["pic.png"]);
  });

  it("writes a file and reads it back", async () => {
    const res = await fetch(`${base}/api/fs/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: tmp, path: "sub/new.txt", content: "written by test" }),
    });
    expect(res.status).toBe(200);
    const onDisk = await fs.readFile(path.join(tmp, "sub/new.txt"), "utf8");
    expect(onDisk).toBe("written by test");
  });

  it("refuses writes that escape the root", async () => {
    const res = await fetch(`${base}/api/fs/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: tmp, path: "../escape.txt", content: "nope" }),
    });
    expect(res.status).toBe(400);
    await expect(fs.access(path.join(tmp, "..", "escape.txt"))).rejects.toThrow();
  });

  it("streams assets with the right content type", async () => {
    const res = await fetch(
      `${base}/api/fs/asset?root=${encodeURIComponent(tmp)}&path=pic.png`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await res.arrayBuffer()).byteLength).toBe(16);
  });

  it("refuses asset reads outside the root", async () => {
    const res = await fetch(
      `${base}/api/fs/asset?root=${encodeURIComponent(tmp)}&path=${encodeURIComponent("../../etc/passwd")}`,
    );
    expect(res.status).toBe(400);
  });

  it("falls through for non-api requests and 404s unknown api routes", async () => {
    const plain = await fetch(`${base}/something/else`);
    expect(plain.status).toBe(404);
    expect(await plain.text()).toBe("fell through");

    const unknown = await fetch(`${base}/api/fs/unknown`);
    expect(unknown.status).toBe(404);
    const data = await json(unknown);
    expect(data.error).toContain("Unknown fs route");
  });
});
