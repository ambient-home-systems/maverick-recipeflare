import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// In development the Worker runs under `wrangler dev` on port 8787 and Vite
// proxies the API to it, so the app and the API share one origin.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Builds the hand-written service worker in src/sw.ts and writes into it
    // the list of the app's files to keep on the device. The manifest and the
    // registration are our own (public/manifest.webmanifest, registerServiceWorker.ts).
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        // The mock screens and their sample recipes are for design review, not for the kitchen.
        globIgnores: ["**/Mock*.js", "**/mock*.js", "**/fixtures-*.js"],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
