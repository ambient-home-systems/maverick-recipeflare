import { useEffect, useState } from "react";
import { fetchHealth } from "../api";

type ApiState = "checking" | "ok" | "unreachable";

const LABELS: Record<ApiState, string> = {
  checking: "Checking the API…",
  ok: "The API is reachable.",
  unreachable: "The API is not reachable.",
};

/** A line that says whether this copy of the app can reach its API. */
export function ApiStatus() {
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
    <p role="status" data-api-state={api} className="text-sm font-semibold">
      {LABELS[api]}
    </p>
  );
}
