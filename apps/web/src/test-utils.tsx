import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App } from "./App";
import { createQueryClient } from "./api/queries";
import { markSignedIn } from "./api/session";
import { createAppRouter } from "./router";

/**
 * Renders the whole app at an address, as a visitor arriving there would see
 * it. Each call has its own cache and starts signed in, so one test's answers
 * never reach another.
 */
export async function renderAt(path: string) {
  markSignedIn();
  const queryClient = createQueryClient();
  // A request that never arrived is tried once more; tests should not wait a second for that.
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 1 },
  });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return { router, queryClient, ...render(<App router={router} queryClient={queryClient} />) };
}
