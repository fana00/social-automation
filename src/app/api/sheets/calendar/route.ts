import { NextResponse } from "next/server";
import { getCalendar } from "@/lib/sheets";

export async function GET() {
  try {
    const entries = await getCalendar();
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
