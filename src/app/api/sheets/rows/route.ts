import { NextRequest, NextResponse } from "next/server";
import { getGenerationLog } from "@/lib/sheets";

export async function GET(_req: NextRequest) {
  try {
    const log = await getGenerationLog();
    return NextResponse.json({ log });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
