import Image from "next/image";
import Link from "next/link";

export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg min-h-screen text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#050508]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/docs" className="relative block h-10 w-32 shrink-0 overflow-hidden sm:h-11 sm:w-36">
            <Image
              src="/loop.png"
              alt="Loop"
              width={794}
              height={1123}
              priority
              className="absolute left-1/2 top-[92%] w-[210%] max-w-none -translate-x-1/2 -translate-y-1/2"
            />
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-200"
          >
            Open app
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
