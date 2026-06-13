import { NextResponse } from "next/server";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { DEMO_STOCKS } from "@/lib/sosovalue";

export async function GET() {
  try {
    const { stocks, stale } = await getCachedCryptoStocks();
    return NextResponse.json({ stocks, source: "sosovalue", stale });
  } catch {
    return NextResponse.json({ stocks: DEMO_STOCKS, source: "demo" });
  }
}
