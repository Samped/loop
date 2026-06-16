import Link from "next/link";
import { DocsSidebar } from "@/components/DocsSidebar";
import { getDocBySlug, getDocNav } from "@/lib/docs";
import { markdownToHtml } from "@/lib/markdown";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

export function generateStaticParams() {
  const slugs = getDocNav().map((item) => item.slug).filter(Boolean);
  return [{ slug: [] }, ...slugs.map((slug) => ({ slug: [slug] }))];
}

export default async function DocsPage({ params }: Props) {
  const { slug: slugParts } = await params;
  const slug = slugParts?.join("/") ?? "";
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const nav = getDocNav();
  const html = markdownToHtml(doc.body);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 lg:flex-row lg:px-6">
      <aside className="lg:w-56 lg:shrink-0">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
          Documentation
        </p>
        <DocsSidebar nav={nav} />
      </aside>
      <article
        className="doc-content min-w-0 flex-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
