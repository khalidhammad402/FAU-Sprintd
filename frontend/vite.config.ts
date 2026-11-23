
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const BACKEND = process.env.DH_BACKEND ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // /api (REST and WebSocket) is forwarded to the backend, so devices on the local network only need this address
  server: { port: 5173, host: true, proxy: { "/api": { target: BACKEND, ws: true, changeOrigin: true } } },
  preview: { port: 4173, host: true, proxy: { "/api": { target: BACKEND, ws: true, changeOrigin: true } } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          map: ["maplibre-gl", "@deck.gl/core", "@deck.gl/layers", "@deck.gl/geo-layers", "@deck.gl/mapbox"],
          charts: ["recharts"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    css: false,
  },
});
