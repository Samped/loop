import { NextResponse } from "next/server";
import { getNewsSyncStatus } from "@/lib/news-syncer";

export async function GET() {
  return NextResponse.json(getNewsSyncStatus());
}
