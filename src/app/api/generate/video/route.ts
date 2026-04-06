import { NextRequest, NextResponse } from "next/server";
import { runDraftGenerator } from "@/lib/agents/draft-generator";
import { appendGenerationLog, updateGenerationLog } from "@/lib/sheets";
import { v2 as cloudinary } from "cloudinary";

export async function POST(req: NextRequest) {
  try {
    const { scrapedVideoUrl, thumbnailUrl, persona, caption } =
      await req.json();

    console.log("[video] scrapedVideoUrl:", scrapedVideoUrl);
    console.log("[video] scrapedVideoUrl length:", scrapedVideoUrl?.length);

    if (!scrapedVideoUrl) {
      return NextResponse.json(
        { error: "scrapedVideoUrl is required" },
        { status: 400 }
      );
    }

    // === STEP 1: Get video on Cloudinary ===
    let cloudinaryVideoUrl: string;

    if (scrapedVideoUrl.includes("cloudinary.com")) {
      cloudinaryVideoUrl = scrapedVideoUrl;
    } else {
      try {
        const videoRes = await fetch(scrapedVideoUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        if (!videoRes.ok) {
          throw new Error(`Failed to fetch video: ${videoRes.status}`);
        }

        const buffer = Buffer.from(await videoRes.arrayBuffer());
        const uploadResult = await new Promise<{ secure_url: string }>(
          (resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `fana/reference-videos/${persona}`,
                resource_type: "video",
              },
              (err, result) => {
                if (err) reject(err);
                else resolve(result as { secure_url: string });
              }
            );
            stream.end(buffer);
          }
        );
        cloudinaryVideoUrl = uploadResult.secure_url;
      } catch (uploadErr) {
        return NextResponse.json(
          {
            error: `Video upload failed: ${uploadErr instanceof Error ? uploadErr.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    }

    // === STEP 1b: Use the scraped thumbnail as the scene reference ===
    // The thumbnail (Instagram's chosen cover frame) is more reliable than
    // extracting frame 0 from the video — kie.ai often rejects video frames.
    let screenshotUrl: string;
    if (thumbnailUrl && thumbnailUrl.includes("cloudinary.com")) {
      screenshotUrl = thumbnailUrl;
    } else {
      // Fallback: extract first frame and re-upload as clean jpg
      try {
        const transformedJpgUrl = cloudinaryVideoUrl.replace(
          "/video/upload/",
          "/video/upload/f_jpg,so_0/"
        );
        const jpgRes = await fetch(transformedJpgUrl);
        if (!jpgRes.ok) throw new Error(`Failed to fetch screenshot: ${jpgRes.status}`);
        const jpgBuffer = Buffer.from(await jpgRes.arrayBuffer());
        const ssUpload = await new Promise<{ secure_url: string }>(
          (resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `fana/reference-videos/${persona}/screenshots`,
                resource_type: "image",
                format: "jpg",
              },
              (err, result) => {
                if (err) reject(err);
                else resolve(result as { secure_url: string });
              }
            );
            stream.end(jpgBuffer);
          }
        );
        screenshotUrl = ssUpload.secure_url;
      } catch (ssErr) {
        return NextResponse.json(
          {
            error: `Screenshot extraction failed: ${ssErr instanceof Error ? ssErr.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    }

    console.log("[video] cloudinaryVideoUrl:", cloudinaryVideoUrl);
    console.log("[video] screenshotUrl:", screenshotUrl);

    // Verify screenshot is accessible
    const ssCheck = await fetch(screenshotUrl, { method: "HEAD" });
    console.log("[video] screenshot status:", ssCheck.status);

    // === STEP 2: Log generation entry ===
    const genId = await appendGenerationLog({
      timestamp: new Date().toISOString(),
      mode: "video",
      persona,
      sourceIgUrl: "",
      basicPrompt: caption || "Video recreation",
      expandedPrompt: "",
      model: "fal:seedream-v4.5-edit",
      taskId: "",
      qcStatus: "pending",
      qcAttempts: 0,
      finalResultUrls: [],
      caption: "",
      carouselGroupId: `video:${cloudinaryVideoUrl}`,
      calendarRowId: "",
    });

    // === STEP 3: Create start image with Seedream ===
    const draftResult = await runDraftGenerator({
      persona,
      mode: "ig-replicator",
      scrapedImageUrl: screenshotUrl,
      scrapedCaption: caption || "",
      aspectRatio: "9:16",
    });

    await updateGenerationLog(genId, {
      taskId: draftResult.taskId,
      expandedPrompt: draftResult.expandedPrompt,
    });

    return NextResponse.json({
      taskId: draftResult.taskId,
      genId,
      screenshotUrl,
      referenceVideoUrl: cloudinaryVideoUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Video generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
