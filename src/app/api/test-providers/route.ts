import { NextRequest, NextResponse } from "next/server";

/**
 * Standalone test endpoint for comparing image generation providers.
 * Does NOT touch the production flow, sheets, or callbacks.
 *
 * Usage:
 *   POST /api/test-providers
 *   Body: {
 *     provider: "fal" | "wavespeed" | "replicate",
 *     model: string,                    // provider-specific model id
 *     prompt: string,
 *     imageUrls: string[],              // reference images (face, body, scene)
 *     aspectRatio?: string,             // "9:16", "3:4", "1:1"
 *   }
 *
 * Returns the raw provider response so you can inspect taskId/output.
 */
export async function POST(req: NextRequest) {
  try {
    const { provider, model, prompt, imageUrls, aspectRatio } = await req.json();

    if (!provider || !model || !prompt) {
      return NextResponse.json(
        { error: "provider, model, and prompt required" },
        { status: 400 }
      );
    }

    let result;
    switch (provider) {
      case "fal":
        result = await callFal(model, prompt, imageUrls, aspectRatio);
        break;
      case "wavespeed":
        result = await callWavespeed(model, prompt, imageUrls, aspectRatio);
        break;
      case "replicate":
        result = await callReplicate(model, prompt, imageUrls, aspectRatio);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown provider: ${provider}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// FAL.ai
// https://fal.ai/models
// Common models for character consistency:
//   - fal-ai/flux-pro/kontext (image editing with reference)
//   - fal-ai/flux-pro/kontext/multi (multiple reference images)
//   - fal-ai/bytedance/seedream/v4/edit
// ============================================================
async function callFal(
  model: string,
  prompt: string,
  imageUrls: string[] = [],
  aspectRatio?: string
) {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set in .env.local");

  const body: Record<string, unknown> = { prompt };

  // FAL conventions vary by model, but most accept these:
  if (imageUrls.length === 1) {
    body.image_url = imageUrls[0];
  } else if (imageUrls.length > 1) {
    body.image_urls = imageUrls;
  }

  if (aspectRatio) {
    body.aspect_ratio = aspectRatio;
  }

  // Use sync endpoint for testing
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { provider: "fal", model, status: res.status, data };
}

// ============================================================
// Wavespeed
// https://wavespeed.ai/
// Models:
//   - bytedance/seedream-v4-edit
//   - black-forest-labs/flux-kontext-pro
// ============================================================
async function callWavespeed(
  model: string,
  prompt: string,
  imageUrls: string[] = [],
  aspectRatio?: string
) {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) throw new Error("WAVESPEED_API_KEY not set in .env.local");

  const body: Record<string, unknown> = { prompt };
  if (imageUrls.length > 0) {
    body.images = imageUrls;
  }
  if (aspectRatio) {
    body.aspect_ratio = aspectRatio;
  }

  const res = await fetch(`https://api.wavespeed.ai/api/v3/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { provider: "wavespeed", model, status: res.status, data };
}

// ============================================================
// Replicate
// https://replicate.com/
// Models:
//   - black-forest-labs/flux-kontext-pro
//   - black-forest-labs/flux-kontext-max
//   - bytedance/seedream-4
// ============================================================
async function callReplicate(
  model: string,
  prompt: string,
  imageUrls: string[] = [],
  aspectRatio?: string
) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error("REPLICATE_API_KEY not set in .env.local");

  const input: Record<string, unknown> = { prompt };
  if (imageUrls.length === 1) {
    input.input_image = imageUrls[0];
  } else if (imageUrls.length > 1) {
    input.input_images = imageUrls;
  }
  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  // Use sync endpoint with Prefer: wait header
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  });

  const data = await res.json();
  return { provider: "replicate", model, status: res.status, data };
}

// GET — show usage example
export async function GET() {
  return NextResponse.json({
    usage: "POST /api/test-providers",
    examples: [
      {
        name: "FAL — Flux Kontext multi-reference",
        body: {
          provider: "fal",
          model: "fal-ai/flux-pro/kontext/multi",
          prompt: "Recreate this scene...",
          imageUrls: ["face_ref_url", "body_ref_url", "scene_ref_url"],
          aspectRatio: "9:16",
        },
      },
      {
        name: "Wavespeed — Seedream v4 edit",
        body: {
          provider: "wavespeed",
          model: "bytedance/seedream-v4-edit",
          prompt: "Recreate this scene...",
          imageUrls: ["face_ref_url", "body_ref_url", "scene_ref_url"],
          aspectRatio: "9:16",
        },
      },
      {
        name: "Replicate — Flux Kontext Pro",
        body: {
          provider: "replicate",
          model: "black-forest-labs/flux-kontext-pro",
          prompt: "Recreate this scene...",
          imageUrls: ["scene_ref_url"],
          aspectRatio: "9:16",
        },
      },
    ],
    setup: "Add FAL_API_KEY, WAVESPEED_API_KEY, REPLICATE_API_KEY to .env.local",
  });
}
