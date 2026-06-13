"use client";

import { useEffect, useState } from "react";

/** Avoid SSR/client mismatch for wallet-dependent UI (wagmi connects only in the browser). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
