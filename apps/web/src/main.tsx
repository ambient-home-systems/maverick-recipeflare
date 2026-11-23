import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devicePersister } from "./api/persist";
import { createQueryClient } from "./api/queries";
import { registerServiceWorker } from "./registerServiceWorker";
import { createAppRouter } from "./router";
import { startTheme } from "./theme/theme";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

startTheme();
registerServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App
      router={createAppRouter()}
      queryClient={createQueryClient()}
      persister={devicePersister()}
    />
  </StrictMode>,
);
