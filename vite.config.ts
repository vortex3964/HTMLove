import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fsApiPlugin } from "./server/plugin.ts";

export default defineConfig({
  plugins: [react(), fsApiPlugin()],
  server: {
    /* The local file API is deliberately unauthenticated — keep it on
       loopback. Pass --host explicitly if you really want it on a LAN. */
    host: "127.0.0.1",
    port: 5199,
    strictPort: false,
    watch: {
      /* The app rewrites `.env` when the user picks a folder; without
         this Vite would restart itself and reload the page for it.
         Restart by hand to pick up .env edits made in an editor. */
      ignored: ["**/.env"],
    },
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
  },
});
