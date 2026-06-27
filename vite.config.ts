import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:8787";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": API,
      "/artifacts": API,
    },
  },
  build: {
    outDir: "../web-dist",
    emptyOutDir: true,
  },
});
