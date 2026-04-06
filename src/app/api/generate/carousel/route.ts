import { NextRequest, NextResponse } from "next/server";
import { runDraftGenerator } from "@/lib/agents/draft-generator";
import { generateCarouselPrompt } from "@/lib/openrouter";
import { appendGenerationLog } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const { prompt, persona, count = 4, aspectRatio } = await req.json();

    const carouselGroupId = uuidv4();
    const tasks: { taskId: string; genId: string }[] = [];

    // First, generate the base image
    const baseResult = await runDraftGenerator({
      persona,
      mode: "free-form",
      basicPrompt: prompt,
      aspectRatio: aspectRatio || "3:4",
    });

    const baseGenId = await appendGenerationLog({
      timestamp: new Date().toISOString(),
      mode: "carousel",
      persona,
      sourceIgUrl: "",
      basicPrompt: prompt,
      expandedPrompt: baseResult.expandedPrompt,
      model: baseResult.model,
      taskId: baseResult.taskId,
      qcStatus: "pending",
      qcAttempts: 0,
      finalResultUrls: [],
      caption: "",
      carouselGroupId,
      calendarRowId: "",
    });

    tasks.push({ taskId: baseResult.taskId, genId: baseGenId });

    // Generate carousel variations using specific angle/framing prompts
    const variationCount = Math.min(count - 1, 4);
    for (let i = 0; i < variationCount; i++) {
      // Generate merged prompt with carousel variation
      const variationPrompt = await generateCarouselPrompt(
        baseResult.expandedPrompt,
        i
      );

      const result = await runDraftGenerator({
        persona,
        mode: "free-form",
        basicPrompt: variationPrompt,
        aspectRatio: aspectRatio || "3:4",
      });

      const genId = await appendGenerationLog({
        timestamp: new Date().toISOString(),
        mode: "carousel",
        persona,
        sourceIgUrl: "",
        basicPrompt: `Carousel variation ${i + 2}`,
        expandedPrompt: variationPrompt,
        model: result.model,
        taskId: result.taskId,
        qcStatus: "pending",
        qcAttempts: 0,
        finalResultUrls: [],
        caption: "",
        carouselGroupId,
        calendarRowId: "",
      });

      tasks.push({ taskId: result.taskId, genId });

      // Small delay between tasks
      if (i < variationCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({ carouselGroupId, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
