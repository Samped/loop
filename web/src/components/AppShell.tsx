"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WalletButton } from "@/components/WalletButton";

const NAV = [
  {
    href: "/",
    label: "Markets",
    desc: "Browse & trade",
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 6-8" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    desc: "Holdings & P&L",
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6" />
      </svg>
    ),
  },
  {
    href: "/news",
    label: "News",
    desc: "Market updates",
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 0a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2V6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h6M7 12h8M7 16h5" />
      </svg>
    ),
  },
  {
    href: "/agent",
    label: "Agent",
    desc: "Trading assistant",
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c.251.023.501.05.75.082m-.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.186c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5" />
      </svg>
    ),
  },
] as const;

function NavItem({
  href,
  label,
  desc,
  icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
        active
          ? "bg-white/[0.06] text-zinc-100"
          : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
      }`}
    >
      {active && (
        <span className="absolute right-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
      )}
      <span className={`ml-1 ${active ? "text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="mt-1 text-[11px] text-zinc-600">{desc}</p>
      </div>
    </Link>
  );
}

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/stock/");
    if (href === "/news") return pathname === "/news" || pathname.startsWith("/news/");
    return pathname.startsWith(href);
  };

  return (
    <div className="app-bg min-h-screen text-zinc-100">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden={!open}
      />

      {/* Toggle sidebar drawer — slides from right */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[272px] flex-col border-l border-white/[0.06] bg-[#08080c]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <Link href="/" onClick={close} className="relative block h-10 w-32 overflow-hidden sm:h-11 sm:w-36">
                <Image
                  src="/loop.png"
                  alt="Loop"
                  width={794}
                  height={1123}
                  priority
                  className="absolute left-1/2 top-[92%] w-[210%] max-w-none -translate-x-1/2 -translate-y-1/2"
                />
              </Link>
              <p className="mt-1.5 text-[11px] text-zinc-500">USDC-reserved stocks on Arc</p>
            </div>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} onNavigate={close} />
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Network</p>
          <p className="mt-1 text-xs text-zinc-400">Arc Testnet · USDC vault</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#050508]/70 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
            <div className="shrink-0">
              <Link href="/" className="relative block h-10 w-32 overflow-hidden transition-opacity hover:opacity-80 sm:h-11 sm:w-36">
                <Image
                  src="/loop.png"
                  alt="Loop"
                  width={794}
                  height={1123}
                  priority
                  className="absolute left-1/2 top-[92%] w-[210%] max-w-none -translate-x-1/2 -translate-y-1/2"
                />
              </Link>
              <p className="mt-1 text-center text-[10px] leading-tight text-zinc-500 sm:text-[11px]">
                USDC-reserved stocks on Arc
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <WalletButton />
              <button
                onClick={() => setOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 transition-all hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-200"
                aria-label="Open menu"
              >
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}