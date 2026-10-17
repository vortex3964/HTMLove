/**
 * Vite plugin that serves the local file API used by htmlove
 * (folder browsing, folder scanning, file saves and asset streaming).
 */
import type { Plugin } from "vite";
import { fsApiMiddleware } from "./fsApi.ts";

export function fsApiPlugin(): Plugin {
  return {
    name: "htmlove:fs-api",
    configureServer(server) {
      server.middlewares.use(fsApiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(fsApiMiddleware);
    },
  };
}
