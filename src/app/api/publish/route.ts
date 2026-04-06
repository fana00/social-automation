import { NextRequest, NextResponse } from "next/server";
import { schedulePost } from "@/lib/blotato";
import { updateCalendarEntry } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const {
      calendarRowId,
      accountId,
      caption,
      hashtags,
      mediaUrls,
      platform,
      scheduledTime,
      useNextFreeSlot,
    } = await req.json();

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }

    const text = `${caption}\n\n${hashtags}`.trim();

    const postId = await schedulePost({
      accountId,
      text,
      mediaUrls: mediaUrls || [],
      platform: platform || "instagram",
      scheduledTime,
      useNextFreeSlot: useNextFreeSlot ?? !scheduledTime,
    });

    if (calendarRowId) {
      await updateCalendarEntry(calendarRowId, {
        status: "scheduled",
        blotatoPostId: postId,
      });
    }

    return NextResponse.json({ postId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
