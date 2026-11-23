import { type QueryClient, QueryClientProvider, useIsRestoring } from "@tanstack/react-query";
import { type Persister, PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { isKept, KEPT_SHAPE } from "./api/persist";
import { useDeviceCopy } from "./api/sync";
import type { createAppRouter } from "./router";

/** Copies the household's recipes to the device in the background, once the last copy has been read back. */
function DeviceCopy({ queryClient }: { queryClient: QueryClient }) {
  const restoring = useIsRestoring();
  useDeviceCopy(queryClient, !restoring);
  return null;
}

/**
 * The whole app: the router, inside the cache of what the API has said. Given
 * a persister, the cache's recipes and lists are kept on the device and are
 * there again the next time the app opens, with or without a connection.
 */
export function App({
  router,
  queryClient,
  persister,
}: {
  router: ReturnType<typeof createAppRouter>;
  queryClient: QueryClient;
  persister?: Persister;
}) {
  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // A copy is good until the recipe changes, however long the device was away.
        maxAge: Number.POSITIVE_INFINITY,
        buster: KEPT_SHAPE,
        dehydrateOptions: { shouldDehydrateQuery: isKept },
      }}
    >
      <DeviceCopy queryClient={queryClient} />
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  );
}
