import { NextRequest, NextResponse } from "next/server";
import { runDraftGenerator } from "@/lib/agents/draft-generator";
import { appendGenerationLog } from "@/lib/sheets";
import type { GenerateImageRequest } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body: GenerateImageRequest & { carouselGroupId?: string } = await req.json();

    const result = await runDraftGenerator({
      persona: body.persona,
      mode: body.mode === "ig-replicator" ? "ig-replicator" : "free-form",
      basicPrompt: body.prompt,
      promptImageUrl: body.promptImageUrl,
      aspectRatio: body.aspectRatio,
      scrapedImageUrl:
        body.mode === "ig-replicator" ? body.promptImageUrl : undefined,
      scrapedCaption: body.prompt,
    });

    const genId = await appendGenerationLog({
      timestamp: new Date().toISOString(),
      mode: body.mode,
      persona: body.persona,
      sourceIgUrl: body.sourceIgUrl || "",
      basicPrompt: body.prompt,
      expandedPrompt: result.expandedPrompt,
      model: result.model,
      taskId: result.taskId,
      qcStatus: "pending",
      qcAttempts: 0,
      finalResultUrls: [],
      caption: "",
      carouselGroupId: body.carouselGroupId || "",
      calendarRowId: "",
    });

    return NextResponse.json({
      taskId: result.taskId,
      genId,
      expandedPrompt: result.expandedPrompt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
