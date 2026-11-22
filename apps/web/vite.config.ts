import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Worker runs under `wrangler dev` on port 8787 and Vite
// proxies the API to it, so the app and the API share one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
