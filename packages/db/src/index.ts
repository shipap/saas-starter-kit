import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { authSchema } from "./schema";
import { migration } from "./migration";

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  transaction<T>(work: (db: Database) => Promise<T>): Promise<T>;
  orm: ReturnType<typeof pgliteDrizzle> | ReturnType<typeof postgresDrizzle>;
  close(): Promise<void>;
}
export async function createDatabase(
  options: { driver?: string; path?: string; url?: string } = {},
): Promise<Database> {
  if (options.driver === "postgres") {
    if (!options.url)
      throw new Error("DATABASE_URL is required for PostgreSQL.");
    const pool = new Pool({ connectionString: options.url, max: 10 });
    const db: Database = {
      query: async <T extends Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) => ({ rows: (await pool.query(sql, params)).rows as T[] }),
      orm: postgresDrizzle(pool, { schema: authSchema }),
      transaction: async (work) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const tx: Database = {
            ...db,
            query: async <T extends Record<string, unknown>>(
              sql: string,
              params: unknown[] = [],
            ) => ({ rows: (await client.query(sql, params)).rows as T[] }),
          };
          const result = await work(tx);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
    await pool.query(migration);
    return db;
  }
  const engine = new PGlite(options.path ?? "memory://");
  await engine.exec(migration);
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) => ({ rows: (await engine.query<T>(sql, params)).rows }),
    orm: pgliteDrizzle(engine, { schema: authSchema }),
    transaction: (work) =>
      engine.transaction(async (tx) =>
        work({
          ...db,
          query: async <T extends Record<string, unknown>>(
            sql: string,
            params: unknown[] = [],
          ) => ({ rows: (await tx.query<T>(sql, params)).rows }),
        }),
      ),
    close: () => engine.close(),
  };
  return db;
}
