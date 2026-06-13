import { NextResponse } from "next/server";
import { getCachedSectors } from "@/lib/market-data";
import { DEMO_SECTORS } from "@/lib/sosovalue";

export async function GET() {
  try {
    const { sectors, stale } = await getCachedSectors();
    return NextResponse.json({ sectors, source: "sosovalue", stale });
  } catch {
    return NextResponse.json({ sectors: DEMO_SECTORS, source: "demo" });
  }
}
