import { NextResponse } from "next/server";
import { getCachedStock } from "@/lib/market-data";

type Params = { params: Promise<{ ticker: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  try {
    const stock = await getCachedStock(upper);
    if (!stock) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }
    return NextResponse.json({ stock, source: "sosovalue" });
  } catch {
    return NextResponse.json({ error: "Market data unavailable" }, { status: 503 });
  }
}
