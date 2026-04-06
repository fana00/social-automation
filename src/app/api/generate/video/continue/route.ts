import { NextRequest, NextResponse } from "next/server";
import { createMotionControlTask } from "@/lib/kie";
import { appendGenerationLog } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const { startImageUrl, referenceVideoUrl, persona, caption } =
      await req.json();

    if (!startImageUrl || !referenceVideoUrl) {
      return NextResponse.json(
        { error: "startImageUrl and referenceVideoUrl required" },
        { status: 400 }
      );
    }

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;

    const klingTaskId = await createMotionControlTask({
      imageUrl: startImageUrl,
      videoUrl: referenceVideoUrl,
      prompt: caption || "",
      callbackUrl,
    });

    const genId = await appendGenerationLog({
      timestamp: new Date().toISOString(),
      mode: "video",
      persona: persona || "",
      sourceIgUrl: "",
      basicPrompt: caption || "Video recreation - motion control (retry)",
      expandedPrompt: `Start image: ${startImageUrl}\nReference video: ${referenceVideoUrl}`,
      model: "kling-3.0/motion-control",
      taskId: klingTaskId,
      qcStatus: "pending",
      qcAttempts: 0,
      finalResultUrls: [],
      caption: "",
      carouselGroupId: "",
      calendarRowId: "",
    });

    return NextResponse.json({ taskId: klingTaskId, genId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
