import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "rzr", "package.json"), "utf8"));
const htmlPath = join(ROOT, "apps", "web", "index.html");

let html = readFileSync(htmlPath, "utf8");
const match = html.match(/v\d+\.\d+\.\d+/);

if (!match) {
  console.log(`⚠ No version string found in index.html`);
  process.exit(1);
}

const updated = html.replace(/v\d+\.\d+\.\d+/, `v${pkg.version}`);
writeFileSync(htmlPath, updated);
console.log(`✓ Website version: ${match[0]} → v${pkg.version}`);
