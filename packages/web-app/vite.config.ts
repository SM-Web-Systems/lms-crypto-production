import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ["buffer", "stream", "crypto", "http", "https", "os", "url", "assert", "events"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Stellar SDK — largest dep
          if (id.includes("@stellar/stellar-sdk") || id.includes("stellar-base")) {
            return "vendor-stellar";
          }
          // React core
          if (id.includes("react-dom") || id.includes("react/") || id.includes("scheduler")) {
            return "vendor-react";
          }
          // Icons
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
          // TanStack / react-query
          if (id.includes("@tanstack")) {
            return "vendor-query";
          }
          // i18n
          if (id.includes("i18next") || id.includes("react-i18next")) {
            return "vendor-i18n";
          }
          // Node polyfills
          if (id.includes("vite-plugin-node-polyfills") || id.includes("rollup-plugin-node-polyfills") || id.includes("node-stdlib-browser")) {
            return "vendor-polyfills";
          }
        },
      },
    },
  },
  server: { port: 5173 },
  define: {
    "process.env": {},
  },
});
