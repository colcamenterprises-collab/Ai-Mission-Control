import { ensureOperationalSchema, pool } from "./index";

await ensureOperationalSchema();
await pool.end();

console.log("Operational database schema ensured.");
