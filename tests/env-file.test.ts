/**
 * Tests for the `.env` memory: reading a key out of dotenv-style text,
 * updating one line without touching the rest, and the missing-file
 * fallbacks (value absent → process environment → nothing).
 */
import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { envFilePath, envValue, readEnvFolder, upsertEnvValue, writeEnvFolder } from "../server/envFile";

const KEY = "HTMLOVE_FOLDER";

describe("envValue", () => {
  it("reads plain, quoted and export-prefixed values", () => {
    expect(envValue(`${KEY}=/a/b\n`, KEY)).toBe("/a/b");
    expect(envValue(`${KEY}="/a b/c"\n`, KEY)).toBe("/a b/c");
    expect(envValue(`export ${KEY}='/a/b'\n`, KEY)).toBe("/a/b");
    expect(envValue(`${KEY} = /spaced \n`, KEY)).toBe("/spaced");
  });

  it("ignores comments, other keys and lines without a value", () => {
    expect(envValue(`# ${KEY}=/nope\n`, KEY)).toBeNull();
    expect(envValue("OTHER=1\nJUST_A_FLAG\n", KEY)).toBeNull();
    expect(envValue("", KEY)).toBeNull();
  });
});

describe("upsertEnvValue", () => {
  it("replaces the key's line and keeps every other line", () => {
    const text = "# hi\nOTHER=1\n" + `${KEY}=/old\n` + "NEXT=2\n";
    expect(upsertEnvValue(text, KEY, "/new")).toBe(
      "# hi\nOTHER=1\n" + `${KEY}=/new\n` + "NEXT=2\n",
    );
  });

  it("appends a missing key and quotes paths with spaces", () => {
    expect(upsertEnvValue("OTHER=1", KEY, "/a b")).toBe(`OTHER=1\n${KEY}="/a b"\n`);
    expect(upsertEnvValue("", KEY, "/a")).toBe(`${KEY}=/a\n`);
  });

  it("leaves commented-out settings alone", () => {
    const text = `# ${KEY}=/old\nOTHER=1\n`;
    expect(upsertEnvValue(text, KEY, "/new")).toBe(`# ${KEY}=/old\nOTHER=1\n${KEY}=/new\n`);
  });
});

describe("readEnvFolder / writeEnvFolder", () => {
  let dir: string;
  const saved = process.env[KEY];

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  async function makeDir() {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "htmlove-env-"));
    return dir;
  }

  it("falls back to the process environment when the file is missing", async () => {
    await makeDir();
    process.env[KEY] = "/from/process";
    expect(await readEnvFolder(path.join(dir, ".env"))).toBe("/from/process");
  });

  it("writes, reads and updates without clobbering other lines", async () => {
    await makeDir();
    delete process.env[KEY];
    const file = path.join(dir, ".env");

    await writeEnvFolder("/first", file);
    expect(await readEnvFolder(file)).toBe("/first");

    await fs.appendFile(file, "KEEP=me\n");
    await writeEnvFolder("/second/with space", file);
    expect(await fs.readFile(file, "utf8")).toContain("KEEP=me");
    expect(await readEnvFolder(file)).toBe("/second/with space");
  });

  it("points the default env file at the app root", () => {
    expect(path.isAbsolute(envFilePath())).toBe(true);
    expect(path.basename(envFilePath())).toBe(".env");
  });
});
