import { useEffect, useState } from "react";
import { fetchHealth, fetchMe } from "../api/client";

type ApiState = "checking" | "ok" | "unreachable";

const LABELS: Record<ApiState, string> = {
  checking: "Checking the API…",
  ok: "The API is reachable.",
  unreachable: "The API is not reachable.",
};

/** `undefined` while asking, a name once known, `null` when nobody is signed in, `false` when asking failed. */
type Who = string | null | false | undefined;

function whoLabel(who: Who): string | null {
  if (who === undefined) {
    return null;
  }
  if (who === false) {
    return "Sign-in could not be checked.";
  }
  return who === null ? "Not signed in." : `Signed in as ${who}.`;
}

/** Two lines that say whether this copy of the app can reach its API, and who the API says is signed in. */
export function ApiStatus() {
  const [api, setApi] = useState<ApiState>("checking");
  const [who, setWho] = useState<Who>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const unlessLeft = (run: () => void) => () => {
      if (!controller.signal.aborted) {
        run();
      }
    };
    fetchHealth(controller.signal)
      .then(() => setApi("ok"))
      .catch(unlessLeft(() => setApi("unreachable")));
    fetchMe(controller.signal)
      .then((member) => setWho(member ? member.displayName : null))
      .catch(unlessLeft(() => setWho(false)));
    return () => controller.abort();
  }, []);

  const signedIn = whoLabel(who);
  return (
    <div role="status" data-api-state={api} className="text-sm font-semibold">
      <p>{LABELS[api]}</p>
      {signedIn && <p>{signedIn}</p>}
    </div>
  );
}
