import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The only row this application owns: which contract the running instance is pointed at.
 *
 * Everything else shown by the console is read from the chain. Nothing here is seeded - a
 * deployment row exists only after somebody records a real address.
 */
export const deployments = pgTable("deployments", {
  id: serial("id").primaryKey(),
  network: text("network").notNull().unique(),
  address: text("address").notNull(),
  rpcUrl: text("rpc_url"),
  explorerUrl: text("explorer_url"),
  codeSha256: text("code_sha256"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
