import { NextRequest, NextResponse } from "next/server";
import { createImageTask } from "@/lib/kie";
import {
  appendGenerationLog,
  updateGenerationLog,
  getGenerationLog,
  getPersonaById,
} from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const { genId, prompt, persona, aspectRatio = "3:4" } = await req.json();

    if (!prompt || !persona) {
      return NextResponse.json(
        { error: "prompt and persona required" },
        { status: 400 }
      );
    }

    // Get the original generation entry to reuse its expanded prompt
    let basePrompt = prompt;
    if (genId) {
      const log = await getGenerationLog();
      const original = log.find((e) => e.genId === genId);
      if (original?.expandedPrompt) {
        // Append the user's edit instruction to the original detailed prompt
        basePrompt = `${original.expandedPrompt}\n\nADDITIONAL INSTRUCTIONS: ${prompt}`;
      }
    }

    // Get persona refs
    const personaData = await getPersonaById(persona);
    if (!personaData) {
      return NextResponse.json(
        { error: `Persona '${persona}' not found` },
        { status: 404 }
      );
    }

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;

    // Send directly to kie.ai with the modified prompt + persona refs
    const taskId = await createImageTask({
      prompt: basePrompt,
      faceRefUrls: personaData.faceRefUrls,
      bodyRefUrls: personaData.bodyRefUrls,
      aspectRatio,
      callbackUrl,
    });

    const newGenId = await appendGenerationLog({
      timestamp: new Date().toISOString(),
      mode: "ig-replicator",
      persona,
      sourceIgUrl: "",
      basicPrompt: prompt,
      expandedPrompt: basePrompt,
      model: "fal:seedream-v4.5-edit",
      taskId,
      qcStatus: "pending",
      qcAttempts: 0,
      finalResultUrls: [],
      caption: "",
      carouselGroupId: "",
      calendarRowId: "",
    });

    // Mark the old one as rejected
    if (genId) {
      await updateGenerationLog(genId, { qcStatus: "rejected" });
    }

    return NextResponse.json({ taskId, genId: newGenId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
