// Image generation: fal.ai (Seedream 4.5 edit)
// Video generation: kie.ai (Kling 3.0 Motion Control)
//
// Task IDs are prefixed with "fal:" or "kie:" so getTaskStatus can route correctly.

const KIE_API_BASE = "https://api.kie.ai/api/v1";
const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_SEEDREAM_MODEL = "fal-ai/bytedance/seedream/v4.5/edit";
// fal.ai's status/result endpoints live under the parent path, not the full model id
const FAL_QUEUE_PARENT = "fal-ai/bytedance";

function getKieHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.KIE_API_KEY}`,
  };
}

function getFalHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Key ${process.env.FAL_API_KEY}`,
  };
}

export interface KieImageOptions {
  prompt: string;
  faceRefUrls?: string[];
  bodyRefUrls?: string[];
  sceneRefUrl?: string; // scraped/reference image for pose, scene, composition
  aspectRatio?: string;
  callbackUrl?: string;
}

export interface KieVideoOptions {
  imageUrl: string;
  prompt?: string;
  callbackUrl?: string;
}

export interface KieTaskResult {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

// Map our aspect ratio shorthand to fal.ai's image_size enum values
const FAL_IMAGE_SIZE_MAP: Record<string, string> = {
  "1:1": "square_hd",
  "3:4": "portrait_4_3",
  "4:3": "landscape_4_3",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
};

// ============================================================
// IMAGE GENERATION — fal.ai Seedream 4.5 edit
// ============================================================
export async function createImageTask(
  options: KieImageOptions
): Promise<string> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY not set in environment");
  }

  // Build image_urls array. Order: face → body → scene reference (last)
  const imageUrls: string[] = [];
  if (options.faceRefUrls) imageUrls.push(...options.faceRefUrls);
  if (options.bodyRefUrls) imageUrls.push(...options.bodyRefUrls);
  if (options.sceneRefUrl) imageUrls.push(options.sceneRefUrl);

  // Truncate prompt for safety (fal.ai also has limits)
  const prompt =
    options.prompt.length > 2900
      ? options.prompt.substring(0, 2900)
      : options.prompt;

  const imageSize = FAL_IMAGE_SIZE_MAP[options.aspectRatio || "3:4"] || "portrait_4_3";

  const body: Record<string, unknown> = {
    prompt,
    image_size: imageSize,
    enable_safety_checker: false,
    num_images: 1,
  };

  if (imageUrls.length > 0) {
    body.image_urls = imageUrls;
  }

  const res = await fetch(`${FAL_QUEUE_BASE}/${FAL_SEEDREAM_MODEL}`, {
    method: "POST",
    headers: getFalHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.request_id) {
    throw new Error(
      `fal.ai createImageTask failed: ${res.status} - ${JSON.stringify(data)}`
    );
  }

  // Prefix with "fal:" so getTaskStatus knows to poll fal.ai
  return `fal:${data.request_id}`;
}

// ============================================================
// VIDEO GENERATION — kie.ai Kling 3.0 Motion Control
// ============================================================
export interface MotionControlOptions {
  imageUrl: string;
  videoUrl: string;
  prompt?: string;
  callbackUrl?: string;
}

export async function createMotionControlTask(
  options: MotionControlOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "kling-3.0/motion-control",
    input: {
      input_urls: [options.imageUrl],
      video_urls: [options.videoUrl],
      prompt: options.prompt || "",
      mode: "720p",
      character_orientation: "image",
      background_source: "input_video",
    },
  };

  if (options.callbackUrl) {
    body.callBackUrl = options.callbackUrl;
  }

  const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: getKieHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(
      `kie.ai motion control failed: ${data.code} - ${data.msg || JSON.stringify(data)}`
    );
  }

  // Prefix with "kie:" so getTaskStatus knows to poll kie.ai
  return `kie:${data.data.taskId}`;
}

// Legacy: kie.ai image-to-video (Kling 2.6) — kept for compatibility, not used by main flow
export async function createVideoTask(
  options: KieVideoOptions
): Promise<string> {
  const input: Record<string, unknown> = {
    image_url: options.imageUrl,
  };
  if (options.prompt) input.prompt = options.prompt;

  const body: Record<string, unknown> = {
    model: "kling/2.6-pro-image-to-video",
    input,
  };
  if (options.callbackUrl) body.callBackUrl = options.callbackUrl;

  const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: getKieHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(
      `kie.ai video createTask failed: ${data.code} - ${data.msg || JSON.stringify(data)}`
    );
  }

  return `kie:${data.data.taskId}`;
}

// ============================================================
// TASK STATUS — routes to fal.ai or kie.ai based on prefix
// ============================================================

// Map kie.ai state values to our status values
const KIE_STATE_MAP: Record<string, KieTaskResult["status"]> = {
  waiting: "pending",
  queuing: "pending",
  generating: "processing",
  success: "completed",
  fail: "failed",
};

// Map fal.ai status values to ours
const FAL_STATE_MAP: Record<string, KieTaskResult["status"]> = {
  IN_QUEUE: "pending",
  IN_PROGRESS: "processing",
  COMPLETED: "completed",
};

export async function getTaskStatus(taskId: string): Promise<KieTaskResult> {
  // Strip prefix and route to the right provider
  if (taskId.startsWith("fal:")) {
    return getFalTaskStatus(taskId.substring(4), taskId);
  }
  if (taskId.startsWith("kie:")) {
    return getKieTaskStatus(taskId.substring(4), taskId);
  }
  // Backward compat: no prefix → assume kie.ai (legacy task IDs)
  return getKieTaskStatus(taskId, taskId);
}

async function getFalTaskStatus(
  requestId: string,
  fullTaskId: string
): Promise<KieTaskResult> {
  // fal.ai's status/result endpoints live under the parent path, not the full model id.
  // For seedream/v4.5/edit, the actual queue path is /fal-ai/bytedance/requests/{id}
  const statusUrl = `${FAL_QUEUE_BASE}/${FAL_QUEUE_PARENT}/requests/${encodeURIComponent(requestId)}/status`;

  const statusRes = await fetch(statusUrl, { headers: getFalHeaders() });

  if (!statusRes.ok) {
    return {
      taskId: fullTaskId,
      status: "failed",
      error: `fal.ai status check failed: ${statusRes.status}`,
    };
  }

  const statusData = await statusRes.json();
  const status = FAL_STATE_MAP[statusData.status] || "pending";

  if (status === "completed") {
    const resultUrlEndpoint = `${FAL_QUEUE_BASE}/${FAL_QUEUE_PARENT}/requests/${encodeURIComponent(requestId)}`;
    const resultRes = await fetch(resultUrlEndpoint, { headers: getFalHeaders() });
    if (!resultRes.ok) {
      return {
        taskId: fullTaskId,
        status: "failed",
        error: `fal.ai result fetch failed: ${resultRes.status}`,
      };
    }
    const resultData = await resultRes.json();
    const resultUrl = resultData.images?.[0]?.url;
    return {
      taskId: fullTaskId,
      status: resultUrl ? "completed" : "failed",
      resultUrl,
      error: resultUrl ? undefined : "fal.ai returned no image",
    };
  }

  return {
    taskId: fullTaskId,
    status,
  };
}

async function getKieTaskStatus(
  rawTaskId: string,
  fullTaskId: string
): Promise<KieTaskResult> {
  const res = await fetch(
    `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(rawTaskId)}`,
    { headers: getKieHeaders() }
  );

  const data = await res.json();

  if (data.code !== 200 || !data.data) {
    throw new Error(
      `kie.ai getTaskStatus failed: ${data.code} - ${data.msg || "Unknown error"}`
    );
  }

  const record = data.data;
  const status = KIE_STATE_MAP[record.state] || "pending";

  let resultUrl: string | undefined;
  if (record.resultJson) {
    try {
      const result = JSON.parse(record.resultJson);
      resultUrl = result.resultUrls?.[0] || result.resultUrl;
    } catch {
      // resultJson might not be valid JSON
    }
  }

  return {
    taskId: fullTaskId,
    status,
    resultUrl,
    error: record.failMsg || undefined,
  };
}
