import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { getPortfolioForAddress } from "@/lib/portfolio";
import { getStoredKlines, getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { filterListedSnapshots } from "@/lib/stock-ready";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").trim().toLowerCase();
  const address = body.address as string | undefined;

  if (!message) {
    return NextResponse.json({ reply: "Ask me about your portfolio, market movers, or how to trade on Loop." });
  }

  hydrateSnapshotStore();

  if (message.includes("portfolio") || message.includes("holding") || message.includes("invest")) {
    if (!address || !isAddress(address)) {
      return NextResponse.json({
        reply: "Connect your wallet first, then ask me about your portfolio. Your shares on Arc are USDC-reserved synthetics.",
      });
    }

    try {
      const stocks = getStoredStocks() ?? (await getCachedCryptoStocks()).stocks;
      const snapshots = filterListedSnapshots(getStoredSnapshots());
      const portfolio = await getPortfolioForAddress(
        address as `0x${string}`,
        stocks,
        snapshots,
        (ticker) => getStoredKlines(ticker) ?? undefined,
      );

      if (portfolio.positions.length === 0) {
        return NextResponse.json({
          reply: `Your wallet (${address.slice(0, 6)}…${address.slice(-4)}) has no stock positions yet. You have $${portfolio.usdcBalance.toFixed(2)} USDC on Arc. Head to Markets to buy synthetic shares.`,
        });
      }

      const top = portfolio.positions[0];
      const lines = portfolio.positions
        .slice(0, 5)
        .map((p) => `• ${p.ticker}: $${p.value.toFixed(2)} (${p.allocation.toFixed(0)}%)`)
        .join("\n");

      const reserve = portfolio.reserve.configured
        ? `\nVault reserve: $${portfolio.reserve.reserveUsdc.toFixed(2)} (${portfolio.reserve.reserveRatioPct.toFixed(0)}% collateralized)`
        : "";

      return NextResponse.json({
        reply: `Portfolio value: $${portfolio.totalValue.toFixed(2)}\nToday's P&L: ${portfolio.totalDayPnl >= 0 ? "+" : ""}$${portfolio.totalDayPnl.toFixed(2)} (${portfolio.totalDayPnlPct.toFixed(2)}%)\nPeriod P&L: ${portfolio.periodPnl >= 0 ? "+" : ""}$${portfolio.periodPnl.toFixed(2)}\nUSDC balance: $${portfolio.usdcBalance.toFixed(2)}${reserve}\n\nHoldings (Arc):\n${lines}\n\nLargest: ${top.ticker} at ${top.allocation.toFixed(0)}% of portfolio.`,
      });
    } catch {
      return NextResponse.json({ reply: "Couldn't fetch your portfolio right now. Try again in a moment." });
    }
  }

  if (message.includes("market") || message.includes("sector") || message.includes("mover") || message.includes("stock")) {
    try {
      const snapshots = filterListedSnapshots(getStoredSnapshots());
      const stocks = getStoredStocks() ?? (await getCachedCryptoStocks()).stocks;
      const listed = stocks.filter((s) => snapshots[s.ticker]);

      const movers: Array<{ ticker: string; change: number; price: number }> = [];
      for (const s of listed) {
        const kl = getStoredKlines(s.ticker);
        if (!kl || kl.length < 2) continue;
        const change = ((kl[kl.length - 1].close - kl[kl.length - 2].close) / kl[kl.length - 2].close) * 100;
        movers.push({ ticker: s.ticker, change, price: snapshots[s.ticker].mkt_price });
      }
      movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      const top = movers.slice(0, 5);
      const summary = top.length
        ? top.map((m) => `• ${m.ticker}: $${m.price.toFixed(2)} (${m.change >= 0 ? "+" : ""}${m.change.toFixed(2)}%)`).join("\n")
        : "Chart data still syncing — check back soon.";

      return NextResponse.json({
        reply: `${listed.length} stocks with live prices.\n\nTop movers today:\n${summary}\n\nGo to Markets to trade, or News for sector headlines.`,
      });
    } catch {
      return NextResponse.json({ reply: "Market data is still loading. Try again shortly." });
    }
  }

  if (message.includes("trade") || message.includes("buy") || message.includes("sell") || message.includes("how")) {
    return NextResponse.json({
      reply: "How to trade on Loop:\n1. Connect wallet & switch to Arc Testnet\n2. Go to Markets and select a stock\n3. Wait for live prices to sync to the vault (automatic)\n4. Buy with USDC or sell your shares\n\nAll trades happen on Arc. Shares are USDC-reserved synthetics.",
    });
  }

  if (message.includes("help") || message.includes("what can")) {
    return NextResponse.json({
      reply: "I can help with:\n• Portfolio — ask \"how is my portfolio doing?\"\n• Markets — ask \"what stocks are moving?\"\n• Trading — ask \"how do I buy stocks?\"\n\nConnect your wallet for personalized portfolio insights.",
    });
  }

  return NextResponse.json({
    reply: "I'm your Loop trading assistant. Try asking:\n• \"How is my portfolio doing?\"\n• \"What stocks are moving today?\"\n• \"How do I trade on Loop?\"",
  });
}
