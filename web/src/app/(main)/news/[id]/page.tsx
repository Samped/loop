import Link from "next/link";
import { NewsArticleView } from "@/components/NewsArticleView";
import { resolveNewsArticle } from "@/lib/news-fetch";

export default async function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await resolveNewsArticle(id);

  if (!article) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-zinc-400">Article not found.</p>
        <Link href="/news" className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300">
          ← Back to news
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10">
      <NewsArticleView article={article} />
    </div>
  );
}
