import { type Member, MemberRole, newId } from "@recipeflare/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { members } from "../db/schema";
import { AuthError } from "./types";

/** What a new install's household is called until someone renames it. */
const HOUSEHOLD = { name: "Household", slug: "household" };

/** "ada.lovelace@example.com" becomes "Ada Lovelace". A member can change it later. */
export function displayNameFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split("+")[0]
    ?.split(/[._-]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words && words.length > 0 ? words.join(" ") : email;
}

async function findByEmail(db: D1Database, email: string) {
  return drizzle(db).select().from(members).where(eq(members.email, email)).get();
}

/**
 * The member with this email address.
 *
 * Someone the provider let through who is not a member yet is added: as the
 * owner, with the household row, when nobody is here yet; otherwise as a member
 * when `autoEnroll` is on. The identity provider's own policy is the allowlist.
 *
 * Usually one read. A first visit adds one batch and a second read.
 */
export async function memberForEmail(
  db: D1Database,
  rawEmail: string,
  options: { autoEnroll: boolean },
): Promise<Member> {
  const email = rawEmail.trim().toLowerCase();
  let row = await findByEmail(db, email);

  if (!row) {
    const now = new Date().toISOString();
    // Each statement decides for itself whether anyone is here yet, so two
    // first visits at the same moment still give one household and one owner.
    await db.batch([
      db
        .prepare(
          `INSERT INTO household (id, name, slug, created_at)
           SELECT ?1, ?2, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM household)`,
        )
        .bind(newId(), HOUSEHOLD.name, HOUSEHOLD.slug, now),
      db
        .prepare(
          `INSERT INTO members (id, email, display_name, role, created_at, updated_at)
           SELECT ?1, ?2, ?3,
                  CASE WHEN EXISTS (SELECT 1 FROM members) THEN 'member' ELSE 'owner' END,
                  ?4, ?4
           WHERE ?5 = 1 OR NOT EXISTS (SELECT 1 FROM members)
           ON CONFLICT (email) DO NOTHING`,
        )
        .bind(newId(), email, displayNameFor(email), now, options.autoEnroll ? 1 : 0),
    ]);
    row = await findByEmail(db, email);
  }

  if (!row) {
    throw new AuthError(403, "not_a_member", "This sign-in is not a member of the household");
  }
  if (row.disabledAt !== null) {
    throw new AuthError(403, "member_disabled", "This member can no longer sign in");
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: MemberRole.parse(row.role),
  };
}
