import { readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);

function findGoModules(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const modules = [];

  if (existsSync(join(dir, "go.mod"))) {
    modules.push(dir);
    return modules;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirs.has(entry.name)) continue;
    modules.push(...findGoModules(join(dir, entry.name)));
  }

  return modules;
}

const modules = findGoModules(join(root, "services")).sort();

if (modules.length === 0) {
  console.error("No Go modules found under services/.");
  process.exit(1);
}

let failed = false;

for (const moduleDir of modules) {
  const label = relative(root, moduleDir).replaceAll("\\", "/");
  console.log(`\n=== ${label} ===`);

  const result = spawnSync("go", ["test", "./..."], {
    cwd: moduleDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
