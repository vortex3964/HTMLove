/**
 * envFile — the `.env` next to the app, where htmlove remembers the
 * folder the user last opened (`HTMLOVE_FOLDER`).
 *
 * Reading is forgiving: a missing file (or a missing value in it) falls
 * back to the process environment, then to nothing at all. Writing keeps
 * every other line intact, so the file stays hand-editable.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const FOLDER_KEY = "HTMLOVE_FOLDER";

/** The repo's own `.env` — relative to this file, so cwd does not matter. */
export function envFilePath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      const inner = value.slice(1, -1);
      return quote === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
    }
  }
  return value;
}

function quoteIfNeeded(value: string): string {
  if (/[\s#'"]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** The value for `key` in dotenv-style text, or null. */
export function envValue(text: string, key: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (name === key) return unquote(line.slice(eq + 1).trim());
  }
  return null;
}

/** Set `key` to `value` in env text, preserving every other line. */
export function upsertEnvValue(text: string, key: string, value: string): string {
  let done = false;
  const lines = text.split(/\r?\n/).map((line) => {
    if (done) return line;
    const eq = line.indexOf("=");
    if (eq === -1) return line;
    const name = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (name !== key) return line;
    done = true;
    return `${key}=${quoteIfNeeded(value)}`;
  });
  if (done) {
    const joined = lines.join("\n");
    return joined.endsWith("\n") ? joined : `${joined}\n`;
  }
  const kept = text.replace(/\s*$/, "");
  return `${kept ? `${kept}\n` : ""}${key}=${quoteIfNeeded(value)}\n`;
}

/** The remembered folder: the `.env` value first, then the process env. */
export async function readEnvFolder(file: string = envFilePath()): Promise<string | null> {
  let text: string | null = null;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    /* no .env yet — the process environment may still have the value */
  }
  const fromFile = text === null ? null : envValue(text, FOLDER_KEY);
  if (fromFile && fromFile.trim()) return fromFile.trim();
  const fromProcess = process.env[FOLDER_KEY];
  return fromProcess && fromProcess.trim() ? fromProcess.trim() : null;
}

/** Remember `folder` in the `.env`, keeping the rest of the file intact. */
export async function writeEnvFolder(
  folder: string,
  file: string = envFilePath(),
): Promise<void> {
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    /* the file gets created below */
  }
  await fs.writeFile(file, upsertEnvValue(text, FOLDER_KEY, folder), "utf8");
}
