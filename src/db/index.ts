import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The connection is created on first use, never at import time.
 *
 * A build without DATABASE_URL (Vercel, a preview, a bare checkout) must still be able to
 * collect route modules and prerender pages: nothing here throws until something actually asks
 * for the database, and the only thing that needs it at runtime is POST /api/deployment —
 * every read the console performs comes from the chain or from deployments/registry.json.
 */

type Database = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  ritualPotPool?: Pool;
  ritualPotDb?: Database;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({ connectionString: databaseUrl });
}

function getPool(): Pool {
  if (!globalForDb.ritualPotPool) {
    globalForDb.ritualPotPool = createPool();
  }
  return globalForDb.ritualPotPool;
}

function getDb(): Database {
  if (!globalForDb.ritualPotDb) {
    globalForDb.ritualPotDb = drizzle(getPool());
  }
  return globalForDb.ritualPotDb;
}

/** A transparent stand-in that materialises the real object on first property access. */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve();
      const value = Reflect.get(instance as object, property, instance);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve() as object, property, value);
    },
    has(_target, property) {
      return Reflect.has(resolve() as object, property);
    },
  });
}

/** Lazy PostgreSQL pool. Accessing it without DATABASE_URL throws; importing it never does. */
export const pool = lazy<Pool>(getPool);

/** Lazy Drizzle client, same rule. */
export const db = lazy<Database>(getDb);

/** True when this instance has a database configured at all. */
export const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL);
