import { type LucideIcon, Plus, ScrollText, SlidersHorizontal } from "lucide-react";

export type NavItem = {
  to: "/" | "/add" | "/manage";
  /** Where the item leads inside the mock harness, so a design review stays among the mock screens. */
  mockTo?: "/mock/list" | "/mock/add";
  /** Another mock address that belongs to this destination: a recipe is part of Recipes. */
  mockAlso?: string;
  label: string;
  icon: LucideIcon;
  /** The Add action is the one thing in the shell drawn in rule red. */
  emphasis?: boolean;
};

/**
 * The app's destinations. Phase 4 adds the planner and the shopping list; the
 * bar and the rail are built to take five.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", mockTo: "/mock/list", label: "Recipes", icon: ScrollText, mockAlso: "/mock/recipe" },
  { to: "/add", mockTo: "/mock/add", label: "Add", icon: Plus, emphasis: true },
  { to: "/manage", label: "Manage", icon: SlidersHorizontal },
];
