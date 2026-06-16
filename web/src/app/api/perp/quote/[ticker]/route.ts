import { NextResponse } from "next/server";
import { getPerpMarkPrice } from "@/lib/perp-price-feed";
import { isPerpMarketTicker } from "@/lib/perp-markets";
import { rateLimit } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

/** Legacy quote endpoint — returns mark engine price (read-only). */
export async function GET(req: Request, { params }: Params) {
  const limited = rateLimit(req, "api:perp-quote-get", 120, 60_000);
  if (limited) return limited;

  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  if (!isPerpMarketTicker(upper)) {
    return NextResponse.json({ error: "Unknown perp market" }, { status: 404 });
  }

  const quote = getPerpMarkPrice(upper);
  if (!quote) {
    return NextResponse.json({ error: "Price unavailable" }, { status: 404 });
  }
  return NextResponse.json(
    {
      ...quote,
      basePrice: quote.basePrice,
      simulated: quote.simulated,
    },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}
