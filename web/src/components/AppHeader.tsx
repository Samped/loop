import Image from "next/image";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";

type AppHeaderProps = {
  backHref?: string;
  backLabel?: string;
  title?: string;
  subtitle?: string;
};

export function AppHeader({ backHref, backLabel = "Markets", title = "Loop", subtitle }: AppHeaderProps) {
  const showTitle = title !== "Loop";

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050508]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-4">
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {backLabel}
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="relative block h-10 w-32 shrink-0 overflow-hidden transition-opacity hover:opacity-80 sm:h-11 sm:w-36"
            >
              <Image
                src="/loop.png"
                alt="Loop"
                width={794}
                height={1123}
                priority
                className="absolute left-1/2 top-[92%] w-[210%] max-w-none -translate-x-1/2 -translate-y-1/2"
              />
            </Link>
            {(showTitle || subtitle) && (
              <div>
                {showTitle && (
                  <h1 className="text-lg font-semibold tracking-tight text-zinc-100 sm:text-xl">{title}</h1>
                )}
                {subtitle && (
                  <p className={`text-xs text-zinc-500 ${showTitle ? "" : "mt-0.5"}`}>{subtitle}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
