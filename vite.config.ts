/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Electron loads the production build over file://, so asset URLs must be relative.
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 3277,
    strictPort: true,
  },
  build: { target: "es2022" },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
