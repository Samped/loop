/** Map wallet / contract errors to user-friendly trade messages. */
export function formatTradeError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "shortMessage" in err
        ? String((err as { shortMessage: string }).shortMessage)
        : "Trade failed";

  const lower = msg.toLowerCase();

  if (
    lower.includes("user denied") ||
    lower.includes("user rejected") ||
    lower.includes("rejected the request")
  ) {
    return "Transaction cancelled in wallet. Approve both prompts for buys (USDC approve, then buy).";
  }

  if (lower.includes("insufficient funds") || lower.includes("insufficient balance")) {
    return "Insufficient USDC for this trade or gas on Arc Testnet.";
  }

  if (
    lower.includes("exceedsbacking") ||
    lower.includes("0xea9affd8")
  ) {
    return "Wrong vault contract — set NEXT_PUBLIC_STOCK_VAULT_ADDRESS to the USDC vault (0x86aE…).";
  }

  if (lower.includes("notsolvent") || lower.includes("0xe081c8f3")) {
    return "Vault undercollateralized — price update may require a reserve top-up.";
  }

  if (lower.includes("insufficientreserve") || lower.includes("0x28b35f21")) {
    return "Insufficient USDC in vault for this sell.";
  }

  if (lower.includes("pricenotset") || lower.includes("0x27515afa")) {
    return "On-chain price not set yet — auto-sync should update it shortly.";
  }

  if (lower.includes("insufficientshares") || lower.includes("0x39996567")) {
    return "You do not hold enough shares to sell on this vault.";
  }

  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
}
