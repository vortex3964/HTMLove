import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fsApiPlugin } from "./server/plugin.ts";

export default defineConfig({
  plugins: [react(), fsApiPlugin()],
  server: {
    port: 5199,
    strictPort: false,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4096,
  },
});
