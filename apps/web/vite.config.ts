import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { storagePlugin } from "./storage-plugin";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), storagePlugin(repoRoot)],
  server: {
    port: 5173,
    // Gespeicherte Pläne/Varianten lösen kein Neuladen der Seite aus – die App lädt sie selbst
    watch: { ignored: ["**/designs/**", "**/plans/**"] },
  },
});
