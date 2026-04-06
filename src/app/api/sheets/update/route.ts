import { NextRequest, NextResponse } from "next/server";
import { updateCalendarEntry, updateGenerationLog, markScrapedPostUsed } from "@/lib/sheets";

export async function PATCH(req: NextRequest) {
  try {
    const { type, id, updates } = await req.json();

    if (type === "calendar") {
      await updateCalendarEntry(id, updates);
    } else if (type === "generation") {
      await updateGenerationLog(id, updates);
    } else if (type === "scraped") {
      await markScrapedPostUsed(id);
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
