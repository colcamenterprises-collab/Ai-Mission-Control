import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const docsDir = path.join(root, "docs", "mission-control");
const routesDocPath = path.join(docsDir, "ROUTES.md");
const legacyDocPath = path.join(docsDir, "LEGACY_AND_DEPRECATION.md");

const requiredDocs = [
  "README.md",
  "SYSTEM_ARCHITECTURE.md",
  "ROUTES.md",
  "LEGACY_AND_DEPRECATION.md",
  "AGENT_SYSTEM_OVERVIEW.md",
  "SWOT_AND_RISK.md",
  "CHANGE_CONTROL.md",
];

const failures = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

for (const file of requiredDocs) {
  try {
    const content = await readFile(path.join(docsDir, file), "utf8");
    if (!content.trim()) failures.push(`Canonical document is empty: docs/mission-control/${file}`);
  } catch {
    failures.push(`Canonical document is missing: docs/mission-control/${file}`);
  }
}

let routesDoc = "";
let legacyDoc = "";
try { routesDoc = await readFile(routesDocPath, "utf8"); } catch {}
try { legacyDoc = await readFile(legacyDocPath, "utf8"); } catch {}

function containsRouteToken(doc, token) {
  return doc.includes(`\`${token}\``) || doc.includes(token);
}

// Frontend: App.tsx is the live route authority. Page files by themselves are not routes.
const app = await read("artifacts/mission-control/src/App.tsx");
const frontendRoutes = new Set();
for (const match of app.matchAll(/<Route\s+path=["']([^"']+)["']/g)) {
  frontendRoutes.add(match[1]);
}
for (const route of [...frontendRoutes].sort()) {
  if (!containsRouteToken(routesDoc, route)) {
    failures.push(`Undocumented frontend route from App.tsx: ${route}`);
  }
}

// API: cover literal Express route declarations. Mount order/semantics still require human review.
const routeDir = path.join(root, "artifacts", "api-server", "src", "routes");
const routeFiles = (await readdir(routeDir)).filter((file) => file.endsWith(".ts")).sort();
const apiRoutes = new Map();
const routePattern = /\brouter\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`](\/[^"'`]+)["'`]/g;
for (const file of routeFiles) {
  const source = await readFile(path.join(routeDir, file), "utf8");
  for (const match of source.matchAll(routePattern)) {
    const method = match[1].toUpperCase();
    const route = match[2];
    const token = `${method} /api${route}`;
    const owners = apiRoutes.get(token) ?? [];
    owners.push(file);
    apiRoutes.set(token, owners);
  }
}
for (const [token, owners] of [...apiRoutes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (!containsRouteToken(routesDoc, token)) {
    failures.push(`Undocumented API route ${token} (${owners.join(", ")})`);
  }
}

// app.ts also owns static public routes outside the Express route modules.
for (const token of ["/api/employee-avatars", "/employee-avatars"]) {
  if (!routesDoc.includes(token)) failures.push(`Undocumented app/static route: ${token}`);
}

// Known compatibility layers must never become invisible cleanup hazards.
for (const token of [
  "task-list-compat.ts",
  "kanban-status-compat.ts",
  "agent-bridge.ts",
  "/calendar",
  "/team/manage",
  "/agent-creation",
]) {
  if (!legacyDoc.includes(token)) failures.push(`Legacy/deprecation register is missing: ${token}`);
}

if (failures.length) {
  console.error("Mission Control documentation coverage check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nUpdate docs/mission-control in the same change as the architecture/route change.");
  process.exit(1);
}

console.log(`Mission Control documentation coverage OK: ${frontendRoutes.size} frontend routes, ${apiRoutes.size} API method/path patterns, ${requiredDocs.length} canonical documents.`);
