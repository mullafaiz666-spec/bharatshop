import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, inArray } from "drizzle-orm";

/** Compatibility lookup for legacy company routes. Never seeds business records. */
export async function ensureDemoDataSeeded() {
  const [operator] = await db.select().from(users)
    .where(inArray(users.role, ["Owner", "Admin", "Operator"]))
    .orderBy(asc(users.id)).limit(1);
  if (!operator) throw new Error("Company operator is not configured. Complete administrator setup before using company operations.");
  return operator;
}
