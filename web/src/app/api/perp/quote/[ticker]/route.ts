import { NextResponse } from "next/server";
import { getPerpMarkPrice } from "@/lib/perp-price-feed";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

/** Legacy quote endpoint — returns mark engine price. */
export async function GET(_req: Request, { params }: Params) {
  const { ticker } = await params;
  const quote = await getPerpMarkPrice(ticker);
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
