import { NextRequest, NextResponse } from "next/server";
import { runQualityChecker } from "@/lib/agents/quality-checker";
import { runCaptionWriter } from "@/lib/agents/caption-writer";
import { uploadFromUrl, uploadVideoFromUrl } from "@/lib/cloudinary";
import {
  findGenerationByTaskId,
  updateGenerationLog,
  appendGenerationLog,
  appendCalendarEntry,
} from "@/lib/sheets";
import {
  notifyGenerationComplete,
  notifyGenerationFailed,
} from "@/lib/discord";
import { createImageTask, createMotionControlTask } from "@/lib/kie";
import { getPersonaById } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId = body.taskId || body.task_id;
    const resultUrl = body.resultUrl || body.output?.url || body.data?.resultUrl;
    const status = body.status;

    if (!taskId) {
      return NextResponse.json({ error: "No taskId" }, { status: 400 });
    }

    const genRecord = await findGenerationByTaskId(taskId);
    if (!genRecord) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }

    const { entry } = genRecord;

    // Handle failure
    if (status === "failed" || !resultUrl) {
      await updateGenerationLog(entry.genId, { qcStatus: "failed-flagged" });
      await notifyGenerationFailed(
        entry.persona,
        body.error || "No result URL returned",
        entry.mode
      );
      return NextResponse.json({ ok: true });
    }

    // ============================================================
    // VIDEO MODE (Kling result) — model is kling-3.0/motion-control
    // ============================================================
    if (entry.model === "kling-3.0/motion-control") {
      const { videoUrl: cloudinaryUrl } = await uploadVideoFromUrl(
        resultUrl,
        `fana/generated/${entry.persona}/videos`
      );

      const startImageMatch = entry.expandedPrompt.match(/Start image: (.+)/);
      const startImageUrl = startImageMatch?.[1] || cloudinaryUrl;

      const captionResult = await runCaptionWriter({
        genId: entry.genId,
        imageUrl: startImageUrl,
        persona: entry.persona,
        context: entry.basicPrompt,
      });

      await updateGenerationLog(entry.genId, {
        finalResultUrls: [cloudinaryUrl],
        qcStatus: "passed",
        caption: `${captionResult.caption}\n\n${captionResult.hashtags}`,
      });

      const calendarRowId = await appendCalendarEntry({
        date: new Date().toISOString().split("T")[0],
        platform: "instagram",
        contentType: "video",
        persona: entry.persona,
        caption: captionResult.caption,
        hashtags: captionResult.hashtags,
        mediaUrls: [cloudinaryUrl],
        status: "ready",
        blotatoPostId: "",
        notes: "Generated from video mode (Kling 3.0 Motion Control)",
      });

      await updateGenerationLog(entry.genId, { calendarRowId });
      await notifyGenerationComplete(
        entry.persona,
        startImageUrl,
        captionResult.caption,
        "video"
      );

      return NextResponse.json({ ok: true, cloudinaryUrl, calendarRowId });
    }

    // ============================================================
    // VIDEO MODE (Seedream step) — chain to Kling Motion Control
    // Detected by: mode="video" + carouselGroupId starts with "video:"
    // ============================================================
    if (
      entry.mode === "video" &&
      entry.carouselGroupId.startsWith("video:")
    ) {
      // QC the recreated start image
      const qcResult = await runQualityChecker({
        genId: entry.genId,
        imageUrl: resultUrl,
        persona: entry.persona,
        currentAttempt: entry.qcAttempts + 1,
        expandedPrompt: entry.expandedPrompt,
      });

      if (qcResult.needsRetry) {
        const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;
        const personaData = await getPersonaById(entry.persona);
        const newTaskId = await createImageTask({
          prompt: qcResult.adjustedPrompt,
          faceRefUrls: personaData?.faceRefUrls,
          bodyRefUrls: personaData?.bodyRefUrls,
          callbackUrl,
        });
        await updateGenerationLog(entry.genId, {
          taskId: newTaskId,
          qcAttempts: qcResult.totalAttempts,
        });
        return NextResponse.json({ ok: true, retrying: true, newTaskId });
      }

      // Upload approved start image to Cloudinary
      const startImageUrl = await uploadFromUrl(
        qcResult.approvedImageUrl || resultUrl,
        `fana/generated/${entry.persona}`
      );

      await updateGenerationLog(entry.genId, {
        finalResultUrls: [startImageUrl],
        qcStatus: qcResult.passed ? "passed" : "failed-flagged",
      });

      // Extract reference video URL from carouselGroupId
      const refVideoUrl = entry.carouselGroupId.replace("video:", "");

      // Create Kling Motion Control task
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;
      const klingTaskId = await createMotionControlTask({
        imageUrl: startImageUrl,
        videoUrl: refVideoUrl,
        prompt: entry.basicPrompt || "",
        callbackUrl,
      });

      // Log the Kling task as a new generation entry
      await appendGenerationLog({
        timestamp: new Date().toISOString(),
        mode: "video",
        persona: entry.persona,
        sourceIgUrl: "",
        basicPrompt: entry.basicPrompt || "Video recreation - motion control",
        expandedPrompt: `Start image: ${startImageUrl}\nReference video: ${refVideoUrl}`,
        model: "kling-3.0/motion-control",
        taskId: klingTaskId,
        qcStatus: "pending",
        qcAttempts: 0,
        finalResultUrls: [],
        caption: "",
        carouselGroupId: "",
        calendarRowId: "",
      });

      // Return the Kling task ID so the client can poll it
      return NextResponse.json({
        ok: true,
        chainedToVideo: true,
        klingTaskId,
        startImageUrl,
      });
    }

    // ============================================================
    // IMAGE MODE — standard QC → Caption → Upload
    // ============================================================
    const qcResult = await runQualityChecker({
      genId: entry.genId,
      imageUrl: resultUrl,
      persona: entry.persona,
      currentAttempt: entry.qcAttempts + 1,
      expandedPrompt: entry.expandedPrompt,
    });

    if (qcResult.needsRetry) {
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;
      const personaData = await getPersonaById(entry.persona);
      const newTaskId = await createImageTask({
        prompt: qcResult.adjustedPrompt,
        faceRefUrls: personaData?.faceRefUrls,
        bodyRefUrls: personaData?.bodyRefUrls,
        callbackUrl,
      });
      await updateGenerationLog(entry.genId, {
        taskId: newTaskId,
        qcAttempts: qcResult.totalAttempts,
      });
      return NextResponse.json({ ok: true, retrying: true, newTaskId });
    }

    const cloudinaryUrl = await uploadFromUrl(
      qcResult.approvedImageUrl,
      `fana/generated/${entry.persona}`
    );

    const captionResult = await runCaptionWriter({
      genId: entry.genId,
      imageUrl: cloudinaryUrl,
      persona: entry.persona,
      context: entry.basicPrompt,
    });

    await updateGenerationLog(entry.genId, {
      finalResultUrls: [cloudinaryUrl],
      caption: `${captionResult.caption}\n\n${captionResult.hashtags}`,
    });

    const contentType = entry.mode === "carousel" ? "carousel" : "image";
    const calendarRowId = await appendCalendarEntry({
      date: new Date().toISOString().split("T")[0],
      platform: "instagram",
      contentType,
      persona: entry.persona,
      caption: captionResult.caption,
      hashtags: captionResult.hashtags,
      mediaUrls: [cloudinaryUrl],
      status: "ready",
      blotatoPostId: "",
      notes: `Generated from ${entry.mode} mode`,
    });

    await updateGenerationLog(entry.genId, { calendarRowId });
    await notifyGenerationComplete(
      entry.persona,
      cloudinaryUrl,
      captionResult.caption,
      entry.mode
    );

    return NextResponse.json({ ok: true, cloudinaryUrl, calendarRowId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Callback error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
