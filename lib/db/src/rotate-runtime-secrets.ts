import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const envPath = process.env.MISSION_CONTROL_ENV_FILE ?? "/opt/apps/ai-mission-control/.env";
const dryRun = process.argv.includes("--dry-run");

function readEnv(filePath: string): { text: string; values: Record<string, string> } {
  const text = fs.readFileSync(filePath, "utf8");
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = rawLine.indexOf("=");
    const key = rawLine.slice(0, index).trim();
    const value = rawLine.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return { text, values };
}

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const b64 = Buffer.from(trimmed, "base64");
  if (b64.length === 32) return b64;
  const hex = Buffer.from(trimmed, "hex");
  if (hex.length === 32) return hex;
  const utf8 = Buffer.from(trimmed, "utf8");
  if (utf8.length === 32) return utf8;
  throw new Error("MISSION_CONTROL_ENCRYPTION_KEY must decode to 32 bytes");
}

function decrypt(value: string | null, key: Buffer): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:v1:")) return value;
  const parts = value.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted credential envelope");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[2], "base64"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[4], "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function encrypt(value: string | null, key: Buffer): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function replaceEnvValue(text: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, `${key}=${value}`);
  return `${text.replace(/\s*$/, "")}\n${key}=${value}\n`;
}

async function main(): Promise<void> {
  const { text, values } = readEnv(envPath);
  const databaseUrl = values.DATABASE_URL;
  const oldKeyRaw = values.MISSION_CONTROL_ENCRYPTION_KEY;
  if (!databaseUrl || !oldKeyRaw) throw new Error("Required runtime configuration is missing");

  const oldKey = parseKey(oldKeyRaw);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query(`
    select id, api_key, username, password, custom_credential
    from integrations
    order by id
  `);

  const rows = result.rows.map((row) => ({
    id: Number(row.id),
    apiKey: decrypt(row.api_key, oldKey),
    username: decrypt(row.username, oldKey),
    password: decrypt(row.password, oldKey),
    customCredential: decrypt(row.custom_credential, oldKey),
  }));
  const credentialCount = rows.reduce((count, row) => count + [row.apiKey, row.username, row.password, row.customCredential].filter(Boolean).length, 0);

  console.log(JSON.stringify({ dryRun, integrations: rows.length, credentialsVerified: credentialCount }));
  if (dryRun) {
    await client.end();
    return;
  }

  const newKey = crypto.randomBytes(32);
  const newKeyText = newKey.toString("base64");
  const newAdminToken = crypto.randomBytes(32).toString("hex");
  const backupDir = "/root/mission-control-secret-backups";
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = path.join(backupDir, `.env.${Date.now()}.bak`);
  fs.writeFileSync(backupPath, text, { mode: 0o600 });

  let nextText = replaceEnvValue(text, "MISSION_CONTROL_ENCRYPTION_KEY", newKeyText);
  nextText = replaceEnvValue(nextText, "MISSION_CONTROL_ADMIN_TOKEN", newAdminToken);
  const tempPath = `${envPath}.rotate.tmp`;
  fs.writeFileSync(tempPath, nextText, { mode: 0o600 });

  await client.query("begin");
  try {
    for (const row of rows) {
      await client.query(
        `update integrations set api_key=$1, username=$2, password=$3, custom_credential=$4 where id=$5`,
        [encrypt(row.apiKey, newKey), encrypt(row.username, newKey), encrypt(row.password, newKey), encrypt(row.customCredential, newKey), row.id],
      );
    }
    fs.renameSync(tempPath, envPath);
    fs.chmodSync(envPath, 0o600);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    fs.writeFileSync(envPath, text, { mode: 0o600 });
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({ rotated: true, integrations: rows.length, credentialsReencrypted: credentialCount, backupCreated: true }));
}

await main();
