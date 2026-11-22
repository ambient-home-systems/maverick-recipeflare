// `wrangler dev` refuses to start when the static assets directory is missing.
// In development Vite serves the web app, so an empty directory is enough.
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../apps/web/dist", import.meta.url), { recursive: true });
