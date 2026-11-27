import { db, hasDatabase } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Liveness of this instance.
 *
 * `database` reports the three states honestly: "up" when a query answered, "not-configured"
 * when no DATABASE_URL was supplied (the console works without one — it reads the chain and
 * deployments/registry.json), "error" when a configured database did not answer.
 */
export async function GET() {
  if (!hasDatabase()) {
    return Response.json({ ok: true, database: "not-configured" });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "error" }, { status: 500 });
  }
}
