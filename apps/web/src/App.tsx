import { useEffect, useState } from "react";
import { fetchHealth } from "./api";

type ApiState = "checking" | "ok" | "unreachable";

const LABELS: Record<ApiState, string> = {
  checking: "Checking the API…",
  ok: "The API is reachable.",
  unreachable: "The API is not reachable.",
};

export function App() {
  const [api, setApi] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setApi("ok"))
      .catch(() => {
        if (!controller.signal.aborted) {
          setApi("unreachable");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Recipeflare</h1>
      <p>Nothing to cook from yet. This page confirms that the app and its API are running.</p>
      <p role="status" data-api-state={api}>
        {LABELS[api]}
      </p>
    </main>
  );
}
