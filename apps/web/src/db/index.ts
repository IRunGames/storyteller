import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { MissingEnvError, serverEnv } from "@/lib/env";
import * as schema from "./schema";

const connectionString = serverEnv().DATABASE_URL;

type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

// DATABASE_URL is the one variable the app cannot run without, but a missing
// one must not stop this module from loading: `next build` loads it while it
// collects page data, and a build that never queries has no need of the
// database. So it is checked as a connection is asked for. Every query asks
// for one through connect(), pool.query() included, and so do Drizzle's
// transactions. Without the check, pg would fall back to its own defaults
// (a server on localhost) and fail later with a less useful message.
class CheckedPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    if (!connectionString) {
      const error = new MissingEnvError("DATABASE_URL");
      if (callback) return callback(error, undefined, () => {});
      return Promise.reject(error);
    }
    return callback ? super.connect(callback) : super.connect();
  }
}

const pool = new CheckedPool({ connectionString });

export const db = drizzle(pool, { schema });
export { schema };
