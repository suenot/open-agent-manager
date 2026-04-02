import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

// Read version from the root version file
let appVersion = "0.0.0";
try {
  appVersion = readFileSync(resolve(__dirname, "..", "version"), "utf8").trim();
} catch {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
    appVersion = pkg.version || "0.0.0";
  } catch {
    // ignore
  }
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
