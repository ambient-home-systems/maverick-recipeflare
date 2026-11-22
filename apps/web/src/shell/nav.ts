import { type LucideIcon, Plus, ScrollText, SlidersHorizontal } from "lucide-react";

export type NavItem = {
  to: "/" | "/add" | "/manage";
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
  { to: "/", label: "Recipes", icon: ScrollText },
  { to: "/add", label: "Add", icon: Plus, emphasis: true },
  { to: "/manage", label: "Manage", icon: SlidersHorizontal },
];
