"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocNavItem } from "@/lib/docs";

export function DocsSidebar({ nav }: { nav: DocNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const href = item.slug === "" ? "/docs" : `/docs/${item.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-white/[0.06] text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
            }`}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
