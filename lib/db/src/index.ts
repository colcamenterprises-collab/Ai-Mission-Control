import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { ensureOperationalSchema as ensureOperationalSchemaWithDb } from "./ensure-operational-schema";
import { ensureAgentProvisioningSchema as ensureAgentProvisioningSchemaWithDb } from "./ensure-agent-provisioning-schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

export async function ensureOperationalSchema(): Promise<void> {
  await ensureOperationalSchemaWithDb(db);
  await ensureAgentProvisioningSchemaWithDb(db);
}
