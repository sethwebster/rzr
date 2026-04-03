import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
copyFileSync(join(ROOT, "README.md"), join(ROOT, "packages", "rzr", "README.md"));
copyFileSync(join(ROOT, "LICENSE"), join(ROOT, "packages", "rzr", "LICENSE"));
