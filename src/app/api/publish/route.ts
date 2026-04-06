import { NextRequest, NextResponse } from "next/server";
import { schedulePost, getAccounts } from "@/lib/blotato";
import { updateCalendarEntry } from "@/lib/sheets";
import { notifyScheduled } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const {
      calendarRowId,
      accountId,
      persona,
      caption,
      hashtags,
      mediaUrls,
      platform,
      contentType,
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

    // Send Discord notification (don't block publish if it fails)
    try {
      // Look up the account username so the notification shows @handle
      let accountName = accountId;
      try {
        const accounts = await getAccounts();
        const match = accounts.find((a) => a.id === accountId);
        if (match) accountName = match.username;
      } catch {
        // ignore — fall back to accountId
      }

      await notifyScheduled({
        persona: persona || "unknown",
        account: accountName,
        platform: platform || "instagram",
        caption: caption || "",
        hashtags: hashtags || "",
        mediaUrls: mediaUrls || [],
        contentType:
          (contentType as "image" | "carousel" | "video") ||
          (mediaUrls?.length > 1 ? "carousel" : "image"),
        scheduledFor: scheduledTime || (useNextFreeSlot ? "next free slot" : "now"),
      });
    } catch (notifyErr) {
      console.error("[publish] Discord notification failed:", notifyErr);
    }

    return NextResponse.json({ postId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
