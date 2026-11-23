import {
  ConflictBody,
  DuplicateBody,
  FoodEntry,
  OrganizerEntry,
  type OrganizerKind,
  Recipe,
  type RecipeInput,
  UnitEntry,
} from "@recipeflare/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiError, api } from "./client";

/** A unit or an organizer made in a picker. It exists only in the editor until the recipe is saved. */
export type PendingUnit = { id: string; name: string };
export type PendingOrganizer = { id: string; kind: OrganizerKind; name: string };

export type SaveRequest = {
  /** A new recipe, or the recipe being changed and the version the editor's copy was made from. */
  target: { create: true } | { create: false; id: string; version: number };
  input: RecipeInput;
  /** Ingredient lines waiting for a food that does not exist yet: line ID to food name. */
  newFoodByLine: Record<string, string>;
  pendingUnits: readonly PendingUnit[];
  pendingOrganizers: readonly PendingOrganizer[];
};

/**
 * Creates an entry of one of the household's lists, or finds the one that
 * already has the name. Either way the answer is the ID to use, which is what
 * makes a save that is tried a second time land in the same place.
 */
async function createOrFind<T extends z.ZodType<{ id: string }>>(
  path: string,
  body: unknown,
  schema: T,
): Promise<string> {
  try {
    return (await api(path, { method: "POST", body, schema })).id;
  } catch (error) {
    if (error instanceof ApiError && error.code === "duplicate") {
      return DuplicateBody.parse(error.body).existingId;
    }
    throw error;
  }
}

/**
 * Saves a recipe from the editor. Whatever the cook made along the way is
 * created first, and only if the recipe still uses it: units and organizers
 * from the pickers, and the foods confirmed at save. Then the recipe is saved
 * with those in place.
 */
export async function saveRecipe(request: SaveRequest): Promise<Recipe> {
  const { input } = request;
  const lines = input.ingredientSections.flatMap((section) => section.items);
  const organizerIds = new Set([...input.categoryIds, ...input.tagIds, ...input.toolIds]);
  const replaced = new Map<string, string>();

  for (const unit of request.pendingUnits) {
    if (lines.some((line) => line.unitId === unit.id)) {
      replaced.set(unit.id, await createOrFind("/units", { name: unit.name }, UnitEntry));
    }
  }
  for (const organizer of request.pendingOrganizers) {
    if (organizerIds.has(organizer.id)) {
      replaced.set(
        organizer.id,
        await createOrFind(
          "/organizers",
          { kind: organizer.kind, name: organizer.name },
          OrganizerEntry,
        ),
      );
    }
  }
  const foodIds = new Map<string, string>();
  for (const name of new Set(Object.values(request.newFoodByLine))) {
    foodIds.set(name, await createOrFind("/foods", { name }, FoodEntry));
  }

  const swap = (id: string) => replaced.get(id) ?? id;
  const body: RecipeInput = {
    ...input,
    ingredientSections: input.ingredientSections.map((section) => ({
      ...section,
      items: section.items.map((line) => {
        const newFood = request.newFoodByLine[line.id];
        return {
          ...line,
          unitId: line.unitId === null ? null : swap(line.unitId),
          foodId: newFood === undefined ? line.foodId : (foodIds.get(newFood) ?? line.foodId),
        };
      }),
    })),
    categoryIds: input.categoryIds.map(swap),
    tagIds: input.tagIds.map(swap),
    toolIds: input.toolIds.map(swap),
  };

  return request.target.create
    ? api("/recipes", { method: "POST", body, schema: Recipe })
    : api(`/recipes/${request.target.id}`, {
        method: "PUT",
        body: { ...body, version: request.target.version },
        schema: Recipe,
      });
}

/** The recipe as it is now, when a save was refused because someone else saved first. Otherwise null. */
export function conflictOf(error: unknown): Recipe | null {
  if (error instanceof ApiError && error.code === "version_conflict") {
    return ConflictBody.safeParse(error.body).data?.current ?? null;
  }
  return null;
}

/**
 * Saves a recipe. Afterwards the lists, the use counts and the recipe itself
 * may all have changed, so everything the cache holds is fetched again.
 */
export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveRecipe,
    onSuccess: (recipe) => {
      queryClient.setQueryData(["recipes", "one", recipe.slug], recipe);
      return queryClient.invalidateQueries();
    },
    // Units, organizers or foods may have been created before the save failed.
    onError: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}
