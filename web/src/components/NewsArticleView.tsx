"use client";

import Link from "next/link";
import type { NewsItem } from "@/lib/news";
import { formatNewsDate } from "@/lib/news";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function toParagraphs(text: string): string[] {
  if (!text) return [];

  const trimmed = text.trim();
  const byBreaks = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBreaks.length > 1) return byBreaks;

  const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!sentences?.length) return [trimmed];

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join("").trim());
  }
  return paragraphs.filter((p) => p.length > 0);
}

export function NewsArticleView({ article }: { article: NewsItem }) {
  const fullText = (article.content || article.summary || article.title || "").trim();
  const headline = article.title.trim();
  const body = toParagraphs(fullText);
  const validTickers = article.tickers?.filter((t) => /^[A-Z]{1,5}$/.test(t));

  const headlineNorm = normalizeText(headline);
  const bodyNorm = normalizeText(fullText);
  const showHeadline =
    headline.length > 0 &&
    headlineNorm !== bodyNorm &&
    !bodyNorm.startsWith(headlineNorm.slice(0, Math.min(headlineNorm.length, 60)));

  const isShort = fullText.length < 280;

  return (
    <article className="mx-auto max-w-2xl">
      <Link
        href="/news"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to news
      </Link>

      <header className="mb-6 border-b border-white/[0.06] pb-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span>{formatNewsDate(article.timestamp)}</span>
          {article.author && (
            <>
              <span className="text-zinc-700">·</span>
              <span>{article.author}</span>
            </>
          )}
        </div>

        {showHeadline && (
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-3xl">
            {headline}
          </h1>
        )}

        {validTickers && validTickers.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${showHeadline ? "mt-5" : ""}`}>
            {validTickers.map((ticker) => (
              <Link
                key={ticker}
                href={`/stock/${ticker}`}
                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                {ticker}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 sm:px-7 sm:py-8">
        {body.length > 0 ? (
          <div className="space-y-5">
            {body.map((paragraph, i) => (
              <p
                key={i}
                className={`leading-[1.8] text-zinc-200 ${
                  isShort && !showHeadline && i === 0
                    ? "text-lg font-medium sm:text-xl"
                    : "text-[15px] sm:text-base"
                }`}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Full article text is unavailable for this item.</p>
        )}
      </div>

      <footer className="mt-8">
        <p className="text-[11px] text-zinc-600">Source: SoSoValue</p>
      </footer>
    </article>
  );
}
