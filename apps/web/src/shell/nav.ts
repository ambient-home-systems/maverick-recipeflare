import { type LucideIcon, Plus, ScrollText, SlidersHorizontal } from "lucide-react";

export type NavItem = {
  to: "/" | "/add" | "/manage";
  /** Where the item leads inside the mock harness, so a design review stays among the mock screens. */
  mockTo?: "/mock/list" | "/mock/add";
  /** Other addresses that belong to this destination: a recipe is part of Recipes, a new one of Add. */
  also?: readonly string[];
  label: string;
  icon: LucideIcon;
  /** The Add action is the one thing in the shell drawn in rule red. */
  emphasis?: boolean;
};

/**
 * Cook mode fills the screen: it has no header and no navigation, only its own
 * "Done". Its address ends in "/cook", or is under "/mock/cook".
 */
export function isFullScreen(pathname: string): boolean {
  return /(^|\/)cook(\/|$)/.test(pathname);
}

/**
 * The app's destinations. Phase 4 adds the planner and the shopping list; the
 * bar and the rail are built to take five.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/",
    mockTo: "/mock/list",
    label: "Recipes",
    icon: ScrollText,
    also: ["/recipes", "/imports", "/mock/recipe", "/mock/edit", "/mock/review"],
  },
  {
    to: "/add",
    mockTo: "/mock/add",
    label: "Add",
    icon: Plus,
    emphasis: true,
    also: ["/recipes/new", "/mock/new", "/mock/capture"],
  },
  { to: "/manage", label: "Manage", icon: SlidersHorizontal },
];
