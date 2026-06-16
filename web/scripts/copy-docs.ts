import fs from "fs";
import path from "path";

const dest = path.join(__dirname, "../content/docs");
const srcCandidates = [
  path.join(__dirname, "../../docs"),
  path.join(process.cwd(), "../docs"),
];

const skip = new Set(["LOOP_DOCUMENTATION.md"]);

fs.mkdirSync(dest, { recursive: true });

const src = srcCandidates.find((dir) => fs.existsSync(dir));
if (!src) {
  console.warn("copy-docs: repo docs/ not found; using committed web/content/docs");
  process.exit(0);
}

for (const name of fs.readdirSync(src)) {
  if (!name.endsWith(".md") || skip.has(name)) continue;
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}

console.log(`Copied docs from ${src} to ${dest}`);
