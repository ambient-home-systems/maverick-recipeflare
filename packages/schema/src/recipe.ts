import { z } from "zod";
import { Asset, FoodRef, OrganizerRef, UnitRef } from "./lists";
import { DurationSeconds, Id, LIMITS, PositiveNumber, Slug, Timestamp } from "./primitives";

// --- Parts shared by every recipe shape ---

const nutritionValue = z.string().max(LIMITS.nutritionValueLength).nullable().optional();

/** schema.org nutrition keys. Values are text as printed, such as "12 g". */
export const Nutrition = z.object({
  calories: nutritionValue,
  carbohydrateContent: nutritionValue,
  cholesterolContent: nutritionValue,
  fatContent: nutritionValue,
  fiberContent: nutritionValue,
  proteinContent: nutritionValue,
  saturatedFatContent: nutritionValue,
  sodiumContent: nutritionValue,
  sugarContent: nutritionValue,
  transFatContent: nutritionValue,
  unsaturatedFatContent: nutritionValue,
});
export type Nutrition = z.infer<typeof Nutrition>;

const SectionTitle = z.string().trim().min(1).max(LIMITS.sectionTitleLength).nullable();

/** The scalar fields of a recipe, the same in a request and a response. */
const recipeScalars = {
  title: z.string().trim().min(1).max(LIMITS.titleLength),
  description: z.string().max(LIMITS.descriptionLength).default(""),
  servings: PositiveNumber.nullable().default(null),
  yieldQuantity: PositiveNumber.nullable().default(null),
  yieldUnit: z.string().trim().min(1).max(LIMITS.yieldUnitLength).nullable().default(null),
  prepTimeSeconds: DurationSeconds.nullable().default(null),
  cookTimeSeconds: DurationSeconds.nullable().default(null),
  totalTimeSeconds: DurationSeconds.nullable().default(null),
  nutrition: Nutrition.nullable().default(null),
  /** Who or where the recipe is from: a relative, a cookbook, a social-media account. */
  sourceName: z.string().trim().min(1).max(LIMITS.sourceNameLength).nullable().default(null),
  sourceUrl: z
    .url({ protocol: /^https?$/ })
    .max(LIMITS.urlLength)
    .nullable()
    .default(null),
};

// --- RecipeInput: what the editor holds and the API accepts ---

export const IngredientInput = z
  .object({
    id: Id,
    /** The line exactly as typed or imported. Parsing never changes it. */
    originalText: z.string().trim().min(1).max(LIMITS.ingredientTextLength).nullable(),
    quantity: PositiveNumber.nullable().default(null),
    unitId: Id.nullable().default(null),
    foodId: Id.nullable().default(null),
    note: z.string().trim().max(LIMITS.ingredientTextLength).default(""),
  })
  .refine((line) => line.originalText !== null || line.foodId !== null || line.note !== "", {
    message: "An ingredient needs its text, a food or a note",
  });
export type IngredientInput = z.infer<typeof IngredientInput>;

export const StepInput = z.object({
  id: Id,
  text: z.string().trim().min(1).max(LIMITS.stepTextLength),
  durationSeconds: DurationSeconds.nullable().default(null),
  /** Ingredients this step uses, by ID. They must be in the same recipe. */
  ingredientIds: z.array(Id).max(LIMITS.ingredientLines).default([]),
});
export type StepInput = z.infer<typeof StepInput>;

export const NoteInput = z.object({
  id: Id,
  title: z.string().trim().max(LIMITS.noteTitleLength).default(""),
  text: z.string().trim().min(1).max(LIMITS.noteTextLength),
});
export type NoteInput = z.infer<typeof NoteInput>;

export const IngredientSectionInput = z.object({
  title: SectionTitle,
  items: z.array(IngredientInput).min(1),
});
export type IngredientSectionInput = z.infer<typeof IngredientSectionInput>;

export const StepSectionInput = z.object({
  title: SectionTitle,
  steps: z.array(StepInput).min(1),
});
export type StepSectionInput = z.infer<typeof StepSectionInput>;

type Issue = { path: (string | number)[]; message: string };

/** Checks that span several fields: totals, uniqueness and references. */
function crossFieldIssues(recipe: {
  ingredientSections: IngredientSectionInput[];
  stepSections: StepSectionInput[];
  notes: NoteInput[];
  categoryIds: string[];
  tagIds: string[];
  toolIds: string[];
}): Issue[] {
  const issues: Issue[] = [];

  const ingredientIds = recipe.ingredientSections.flatMap((s) => s.items.map((i) => i.id));
  const stepIds = recipe.stepSections.flatMap((s) => s.steps.map((step) => step.id));
  const noteIds = recipe.notes.map((n) => n.id);

  if (ingredientIds.length > LIMITS.ingredientLines) {
    issues.push({
      path: ["ingredientSections"],
      message: `A recipe can have at most ${LIMITS.ingredientLines} ingredient lines`,
    });
  }
  if (stepIds.length > LIMITS.steps) {
    issues.push({
      path: ["stepSections"],
      message: `A recipe can have at most ${LIMITS.steps} steps`,
    });
  }

  const allIds = [...ingredientIds, ...stepIds, ...noteIds];
  if (new Set(allIds).size !== allIds.length) {
    issues.push({ path: [], message: "Ingredient, step and note IDs must be unique" });
  }

  // Two neighbouring sections with the same title would merge when stored.
  for (const key of ["ingredientSections", "stepSections"] as const) {
    const sections = recipe[key];
    for (let i = 1; i < sections.length; i++) {
      if (sections[i]?.title === sections[i - 1]?.title) {
        issues.push({
          path: [key, i, "title"],
          message: "Neighbouring sections need different titles",
        });
      }
    }
  }

  const known = new Set(ingredientIds);
  recipe.stepSections.forEach((section, sectionIndex) => {
    section.steps.forEach((step, stepIndex) => {
      if (step.ingredientIds.some((id) => !known.has(id))) {
        issues.push({
          path: ["stepSections", sectionIndex, "steps", stepIndex, "ingredientIds"],
          message: "A step can only refer to ingredients of the same recipe",
        });
      }
    });
  });

  const organizerIds = [...recipe.categoryIds, ...recipe.tagIds, ...recipe.toolIds];
  if (organizerIds.length > LIMITS.organizers) {
    issues.push({
      path: ["tagIds"],
      message: `A recipe can have at most ${LIMITS.organizers} categories, tags and tools`,
    });
  }
  if (new Set(organizerIds).size !== organizerIds.length) {
    issues.push({ path: ["tagIds"], message: "A category, tag or tool can be added only once" });
  }

  return issues;
}

const recipeInputShape = {
  ...recipeScalars,
  ingredientSections: z.array(IngredientSectionInput).max(LIMITS.ingredientLines).default([]),
  stepSections: z.array(StepSectionInput).max(LIMITS.steps).default([]),
  notes: z.array(NoteInput).max(LIMITS.notes).default([]),
  categoryIds: z.array(Id).max(LIMITS.organizers).default([]),
  tagIds: z.array(Id).max(LIMITS.organizers).default([]),
  toolIds: z.array(Id).max(LIMITS.organizers).default([]),
};

function withCrossFieldChecks<T extends z.ZodType<Parameters<typeof crossFieldIssues>[0]>>(
  schema: T,
): T {
  return schema.superRefine((recipe, ctx) => {
    for (const issue of crossFieldIssues(recipe)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  }) as T;
}

/** A recipe as the editor holds it and as create and update accept it. */
export const RecipeInput = withCrossFieldChecks(z.object(recipeInputShape));
export type RecipeInput = z.infer<typeof RecipeInput>;
/** The editor's form value: `RecipeInput` before defaults are applied. */
export type RecipeFormValue = z.input<typeof RecipeInput>;

/** Body of `POST /recipes`. `importJobId` links the recipe to the import it came from. */
export const RecipeCreate = withCrossFieldChecks(
  z.object({ ...recipeInputShape, importJobId: Id.nullable().default(null) }),
);
export type RecipeCreate = z.infer<typeof RecipeCreate>;

/** Body of `PUT /recipes/{id}`. `version` is the version the editor loaded. */
export const RecipeUpdate = withCrossFieldChecks(
  z.object({ ...recipeInputShape, version: z.int().min(1) }),
);
export type RecipeUpdate = z.infer<typeof RecipeUpdate>;

// --- Recipe: what the API returns ---

export const Ingredient = z.object({
  id: Id,
  originalText: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: UnitRef.nullable(),
  food: FoodRef.nullable(),
  note: z.string(),
});
export type Ingredient = z.infer<typeof Ingredient>;

export const Step = z.object({
  id: Id,
  text: z.string(),
  durationSeconds: z.int().nullable(),
  ingredientIds: z.array(Id),
});
export type Step = z.infer<typeof Step>;

export const Note = z.object({ id: Id, title: z.string(), text: z.string() });
export type Note = z.infer<typeof Note>;

export const IngredientSection = z.object({
  title: z.string().nullable(),
  items: z.array(Ingredient),
});
export type IngredientSection = z.infer<typeof IngredientSection>;

export const StepSection = z.object({
  title: z.string().nullable(),
  steps: z.array(Step),
});
export type StepSection = z.infer<typeof StepSection>;

export const Recipe = z.object({
  id: Id,
  slug: Slug,
  version: z.int().min(1),
  title: z.string(),
  description: z.string(),
  servings: z.number().nullable(),
  yieldQuantity: z.number().nullable(),
  yieldUnit: z.string().nullable(),
  prepTimeSeconds: z.int().nullable(),
  cookTimeSeconds: z.int().nullable(),
  totalTimeSeconds: z.int().nullable(),
  nutrition: Nutrition.nullable(),
  sourceName: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  ingredientSections: z.array(IngredientSection),
  stepSections: z.array(StepSection),
  notes: z.array(Note),
  categories: z.array(OrganizerRef),
  tags: z.array(OrganizerRef),
  tools: z.array(OrganizerRef),
  assets: z.array(Asset),
  createdBy: Id,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Recipe = z.infer<typeof Recipe>;

/** A recipe as one row of the list. */
export const RecipeSummary = z.object({
  id: Id,
  slug: Slug,
  title: z.string(),
  description: z.string(),
  servings: z.number().nullable(),
  prepTimeSeconds: z.int().nullable(),
  cookTimeSeconds: z.int().nullable(),
  totalTimeSeconds: z.int().nullable(),
  cover: Asset.nullable(),
  categories: z.array(OrganizerRef),
  tags: z.array(OrganizerRef),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type RecipeSummary = z.infer<typeof RecipeSummary>;

/** The photo that represents a recipe: its cover, else its first photo. */
export function coverAsset(recipe: Pick<Recipe, "assets">): Asset | null {
  const byPosition = [...recipe.assets].sort((a, b) => a.position - b.position);
  return (
    byPosition.find((asset) => asset.role === "cover") ??
    byPosition.find((asset) => asset.role === "photo") ??
    null
  );
}

export function toRecipeSummary(recipe: Recipe): RecipeSummary {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepTimeSeconds: recipe.prepTimeSeconds,
    cookTimeSeconds: recipe.cookTimeSeconds,
    totalTimeSeconds: recipe.totalTimeSeconds,
    cover: coverAsset(recipe),
    categories: recipe.categories,
    tags: recipe.tags,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

/** Turns a loaded recipe into the editor's value, ready to change and save. */
export function recipeToUpdate(recipe: Recipe): RecipeUpdate {
  return {
    version: recipe.version,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    prepTimeSeconds: recipe.prepTimeSeconds,
    cookTimeSeconds: recipe.cookTimeSeconds,
    totalTimeSeconds: recipe.totalTimeSeconds,
    nutrition: recipe.nutrition,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    ingredientSections: recipe.ingredientSections.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({
        id: item.id,
        originalText: item.originalText,
        quantity: item.quantity,
        unitId: item.unit?.id ?? null,
        foodId: item.food?.id ?? null,
        note: item.note,
      })),
    })),
    stepSections: recipe.stepSections.map((section) => ({
      title: section.title,
      steps: section.steps.map((step) => ({ ...step })),
    })),
    notes: recipe.notes.map((note) => ({ ...note })),
    categoryIds: recipe.categories.map((o) => o.id),
    tagIds: recipe.tags.map((o) => o.id),
    toolIds: recipe.tools.map((o) => o.id),
  };
}
