import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devicePersister } from "./api/persist";
import { createQueryClient } from "./api/queries";
import { startWithServiceWorker } from "./registerServiceWorker";
import { createAppRouter } from "./router";
import { startTheme } from "./theme/theme";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

startTheme();

// If a new version of the app is waiting, it takes over before anything is shown.
startWithServiceWorker(() => {
  createRoot(root).render(
    <StrictMode>
      <App
        router={createAppRouter()}
        queryClient={createQueryClient()}
        persister={devicePersister()}
      />
    </StrictMode>,
  );
});
