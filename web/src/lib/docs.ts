import fs from "fs";
import path from "path";

export type DocNavItem = {
  title: string;
  slug: string;
};

const DOCS_DIR = path.join(process.cwd(), "content/docs");

function summaryPath() {
  return path.join(DOCS_DIR, "SUMMARY.md");
}

export function getDocNav(): DocNavItem[] {
  const raw = fs.readFileSync(summaryPath(), "utf8");
  const items: DocNavItem[] = [];

  for (const line of raw.split("\n")) {
    const match = line.match(/^\*\s+\[([^\]]+)\]\(([^)]+)\)/);
    if (!match) continue;
    const title = match[1];
    const file = match[2];
    const slug = file === "README.md" ? "" : file.replace(/\.md$/, "");
    items.push({ title, slug });
  }

  return items;
}

export function getDocSlugs(): string[] {
  return getDocNav()
    .map((item) => item.slug)
    .filter((slug) => slug.length > 0);
}

export function getDocBySlug(slug: string): { title: string; body: string } | null {
  const file = slug === "" ? "README.md" : `${slug}.md`;
  const filePath = path.join(DOCS_DIR, file);
  if (!fs.existsSync(filePath)) return null;

  const body = fs.readFileSync(filePath, "utf8");
  const title =
    getDocNav().find((item) => item.slug === slug)?.title ??
    body.match(/^#\s+(.+)$/m)?.[1] ??
    "Documentation";

  return { title, body };
}
