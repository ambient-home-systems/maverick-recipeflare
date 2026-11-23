import { Recipe, RecipeListResponse, type RecipeSummary } from "@recipeflare/schema";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./client";
import { useSignedOut } from "./session";
import { useOnline } from "./useOnline";

/**
 * Copying every recipe to the device, so any of them opens offline. The copy
 * is the query cache itself, which `persist.ts` keeps between visits: a recipe
 * fetched here is the same one its page would have fetched.
 */

const PAGE = 100;
const AT_ONCE = 4;
/** While the app stays open, the copy is brought up to date this often. */
const AGAIN_AFTER_MS = 10 * 60 * 1000;

const keyOf = (slug: string) => ["recipes", "one", slug] as const;

/** Every recipe the household has, as the list rows the server gives. */
async function everySummary(signal?: AbortSignal): Promise<RecipeSummary[]> {
  const all: RecipeSummary[] = [];
  for (let page = 1; ; page++) {
    const answer = await api(`/recipes?sort=title&page=${page}&perPage=${PAGE}`, {
      schema: RecipeListResponse,
      signal,
    });
    all.push(...answer.items);
    if (answer.items.length === 0 || page * PAGE >= answer.total) {
      return all;
    }
  }
}

/**
 * Brings the device's copy of the recipes up to date: fetches each recipe that
 * is new or has changed since its copy was made, and forgets copies of recipes
 * that are gone or renamed. Answers with how many there are and how many it fetched.
 */
export async function copyRecipesToDevice(
  queryClient: QueryClient,
  signal?: AbortSignal,
): Promise<{ total: number; fetched: number }> {
  const summaries = await everySummary(signal);
  const stale = summaries.filter((summary) => {
    const copy = queryClient.getQueryData<Recipe>(keyOf(summary.slug));
    return copy?.id !== summary.id || copy.updatedAt !== summary.updatedAt;
  });

  let next = 0;
  const worker = async () => {
    for (let summary = stale[next++]; summary; summary = stale[next++]) {
      const recipe = await api(`/recipes/${summary.id}`, { schema: Recipe, signal });
      queryClient.setQueryData(keyOf(recipe.slug), recipe);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, stale.length) }, worker));

  // A copy under an address no recipe has any more is of a recipe deleted or renamed.
  const slugs = new Set(summaries.map((summary) => summary.slug));
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["recipes", "one"] })) {
    const slug = query.queryKey[2];
    if (typeof slug === "string" && !slugs.has(slug) && query.getObserversCount() === 0) {
      queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }
  return { total: summaries.length, fetched: stale.length };
}

/**
 * Keeps the device's copy up to date while the app is open: once when it
 * opens, again whenever the connection comes back, and every ten minutes. It
 * says nothing when it cannot: with no connection or no session there is
 * nothing to copy, and the pages say so themselves.
 */
export function useDeviceCopy(queryClient: QueryClient, ready = true): void {
  const online = useOnline();
  const signedOut = useSignedOut();
  const able = ready && online && !signedOut;

  useEffect(() => {
    if (!able) {
      return;
    }
    const stop = new AbortController();
    const run = () => {
      copyRecipesToDevice(queryClient, stop.signal).catch(() => {});
    };
    // After the page in front has asked for what it needs.
    const first = setTimeout(run, 1500);
    const again = setInterval(run, AGAIN_AFTER_MS);
    return () => {
      stop.abort();
      clearTimeout(first);
      clearInterval(again);
    };
  }, [able, queryClient]);
}
