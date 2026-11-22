import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createAppRouter } from "./router";

/** Renders the whole app at an address, as a visitor arriving there would see it. */
export async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return { router, ...render(<RouterProvider router={router} />) };
}
