import { desc, eq } from "drizzle-orm";
import { pool } from "@/db";
import { db } from "@/db";
import { deployments, type Deployment, type NewDeployment } from "@/db/schema";

/**
 * The table is created on first use so a fresh instance works without a migration step.
 * The statement mirrors `src/db/schema.ts` exactly.
 */
let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS deployments (
          id serial PRIMARY KEY,
          network text NOT NULL,
          address text NOT NULL,
          rpc_url text,
          explorer_url text,
          code_sha256 text,
          updated_by text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
      )
        .then(() =>
          pool.query(
            "CREATE UNIQUE INDEX IF NOT EXISTS deployments_network_idx ON deployments (network)",
          ),
        )
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

/** The address recorded for a network, or null when nothing has been recorded. */
export async function readDeployment(network: string): Promise<Deployment | null> {
  await ensureTable();
  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.network, network))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Records (or replaces) the address for a network. Returns the stored row. */
export async function writeDeployment(record: NewDeployment): Promise<Deployment> {
  await ensureTable();
  const rows = await db
    .insert(deployments)
    .values(record)
    .onConflictDoUpdate({
      target: deployments.network,
      set: {
        address: record.address,
        rpcUrl: record.rpcUrl ?? null,
        explorerUrl: record.explorerUrl ?? null,
        codeSha256: record.codeSha256 ?? null,
        updatedBy: record.updatedBy ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0];
}

export type { Deployment };
