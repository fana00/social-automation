import { NextRequest, NextResponse } from "next/server";
import { sendNotification } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { content, embeds } = await req.json();
    await sendNotification(content, embeds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
