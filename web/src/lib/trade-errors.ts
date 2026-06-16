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

  if (lower.includes("insufficientmargin") || lower.includes("0x41c092a9")) {
    return "Insufficient margin for this size at the on-chain mark — lower leverage or add margin.";
  }

  if (lower.includes("excessiveleverage") || lower.includes("0xa025ec2f")) {
    return "Position size exceeds max leverage for this market at the on-chain mark.";
  }

  if (lower.includes("positionexists") || lower.includes("0x709cb07e")) {
    return "You already have an open position in this market — close it first.";
  }

  if (lower.includes("staleoracle") || lower.includes("0x88cce429")) {
    return "Oracle mark is stale (>5 min) — wait for price sync, then retry.";
  }

  if (lower.includes("marketnotactive") || lower.includes("0xb521771a")) {
    return "This perp market is not active on-chain.";
  }

  if (lower.includes("openinterestexceeded") || lower.includes("0x377c8e4c")) {
    return "Market open interest limit reached — try a smaller size.";
  }

  if (lower.includes("insufficientshares") || lower.includes("0x39996567")) {
    return "You do not hold enough shares to sell on this vault.";
  }

  if (
    lower.includes("nonce too low") ||
    lower.includes("nonce has already been used") ||
    lower.includes("nonce_expired")
  ) {
    return "Wallet nonce out of sync — wait a few seconds, then try once (do not double-click).";
  }

  if (
    lower.includes("replacement fee too low") ||
    lower.includes("replacement transaction underpriced") ||
    lower.includes("replacement_underpriced")
  ) {
    return "A previous transaction is still pending — wait ~30s for it to confirm, then try again once.";
  }

  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
}
