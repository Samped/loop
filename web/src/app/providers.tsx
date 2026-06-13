"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/arc-chain";
import { useState, type ReactNode } from "react";

const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
  },
  multiInjectedProviderDiscovery: false,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
