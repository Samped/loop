import fs from "fs";
import path from "path";

const src = path.join(__dirname, "../../docs");
const dest = path.join(__dirname, "../content/docs");

const skip = new Set(["LOOP_DOCUMENTATION.md"]);

fs.mkdirSync(dest, { recursive: true });

for (const name of fs.readdirSync(src)) {
  if (!name.endsWith(".md") || skip.has(name)) continue;
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}

console.log(`Copied docs to ${dest}`);
