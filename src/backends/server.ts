/**
 * Backend: the local file API served by the htmlove dev/preview server.
 * Works in every browser that can reach the app itself.
 */
import type { RawSnapshot } from "../core/types";
import type { BrowseResult, FileBackend } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const serverBackend: FileBackend & {
  home(): Promise<string>;
  browse(path: string): Promise<BrowseResult>;
} = {
  kind: "server",

  async home() {
    const data = await request<{ home: string }>("/api/fs/home");
    return data.home;
  },

  async browse(path: string) {
    return request<BrowseResult>(`/api/fs/browse?path=${encodeURIComponent(path)}`);
  },

  async scan(root: string) {
    return request<RawSnapshot>("/api/fs/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: root }),
    });
  },

  async writeFile(root: string, relPath: string, content: string) {
    await request("/api/fs/file", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, path: relPath, content }),
    });
  },

  assetUrl(root: string, relPath: string) {
    return `/api/fs/asset?root=${encodeURIComponent(root)}&path=${encodeURIComponent(relPath)}`;
  },
};
