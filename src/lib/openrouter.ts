const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

async function chat(
  messages: ChatMessage[],
  model = "x-ai/grok-4-fast"
): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Fana Studio",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  // Safety net: if Grok ignores our 1800 char limit, trim at sentence boundary
  if (content.length > 2700) {
    const trimmed = content.substring(0, 2700);
    const lastPeriod = trimmed.lastIndexOf(".");
    return lastPeriod > 1500 ? trimmed.substring(0, lastPeriod + 1) : trimmed;
  }
  return content;
}

// ==================== IG Replicator Prompt (from reference project) ====================

const IG_REPLICATOR_SYSTEM_PROMPT = `You are an expert at creating complete image generation prompts for Seedream 4.5 AI model.

IMPORTANT CONTEXT:
- Seedream will receive 2 reference images:
  1. Image 1: Face structure reference
  2. Image 2: Body type and physique reference
- You are analyzing the SOURCE image that needs to be recreated
- Your output must be a COMPLETE prompt for Seedream

YOUR TASK:
Analyze this image and create a complete Seedream prompt that describes everything visible in THIS image so the AI can recreate it with a different person.

OUTPUT FORMAT (mandatory structure):
"Use reference image 1 for the face structure. Use reference image 2,3,4 for the body type and physique.

Subject details: [Describe the person's clothing in complete detail - every garment, accessories, jewelry, shoes, specific details like patterns, textures, colors, cuts, styles]. [Describe the exact pose - standing, sitting, body position, arm placement, leg position]. [Describe what the person is doing - their action, gesture, body language, facial expression like smiling/serious but WITHOUT describing facial features].

The scene: [describe location type and setting]. The environment features [describe architectural elements, furniture, props, and background in detail]. The setting is [indoor/outdoor details with spatial relationships].

Lighting: [describe light source, direction, quality, shadows, time of day, color temperature in technical detail].

Camera: [describe perspective, depth of field, focal distance, composition. For camera angle: default to 'eye-level' unless the angle is clearly extreme. If the camera is only slightly below eye level, describe it as 'approximately eye-level with a very subtle upward perspective.' If slightly above, use 'approximately eye-level, tilted marginally downward.' Always understate the angle by one level to compensate for Seedream's tendency to exaggerate].

Atmosphere: [describe mood, ambiance, weather if applicable, environmental effects].

Colors and textures: [describe dominant colors throughout the scene, materials, surface properties, color palette].

Technical quality: high-resolution, sharp focus, professional photography, photorealistic."

CRITICAL RULES:
- HARD LIMIT: Total prompt MUST be UNDER 1800 characters. Be concise but cover all key sections. The prompt MUST be a complete, well-formed text that fits entirely within this limit. Do NOT get cut off mid-sentence.
- KEEP IT CONCISE: Each section (Subject details, Scene, Lighting, Camera, etc.) should be 1-2 sentences max. Use precise descriptive words instead of long elaborate descriptions.
- AVOID SUGGESTIVE LANGUAGE: Use neutral terms like "fitted top", "form-fitting", "feminine silhouette" instead of explicit body descriptors. Don't say things like "deep plunging neckline", "cleavage", "voluptuous bust", "open neckline" - these trigger content moderation. Use "elegant V-neck", "flattering cut", "curvy figure" instead.
- DO describe: clothing style/color/cut, pose, action, body language, expression type (smile/serious)
- NEVER describe: hair color, hair style, eye color, facial features, skin tone, ethnic features
- Use "this person", "the subject" when referring to the individual
- BODY PROPORTIONS: Mention the subject has a "curvy figure with feminine silhouette" once. Don't repeat or elaborate on body parts.
- CAMERA ANGLE DAMPENING: Seedream amplifies camera angles. Always understate by one level. Default to "eye-level" unless extreme.
- BANNED TERMS: "low-angle shot", "worm's-eye view", "looking up at", "shot from below", "cleavage", "plunging", "voluptuous", "ample bust"

Output ONLY the formatted prompt, nothing else. Verify your output is under 1800 characters before submitting.`;

// ==================== Carousel Prompts (from reference project) ====================

export const CAROUSEL_PROMPTS = [
  // Variation 1: 30 degrees left
  `Refer to Image 1 as the foundational reference. Preserve the exact same person, outfit, environment, lighting, and mood. Recreate this exact scene but shift the camera position approximately 30 degrees to the left of the original viewpoint. Keep the same distance from the subject and the same framing. The person's pose should adjust naturally to the new camera angle as it would in a real photo taken seconds apart. Maintain natural skin texture, the same ambient lighting direction, and all background elements. Candid snapshot, same moment different angle`,
  // Variation 2: medium close-up
  `Refer to Image 1 as the foundational reference. Preserve the exact same person, outfit, environment, lighting, and mood. Recreate this exact scene but move the camera closer to the subject for a medium close-up framing from chest up, positioned slightly above eye level looking down at a subtle angle. The subject should appear to glance up naturally toward the camera. Keep the same background visible but now with shallow depth of field softly blurring it. Maintain all environmental details, same ambient light source and direction. Shot on iPhone 15 Pro, casual portrait moment`,
  // Variation 3: wide environmental shot
  `Refer to Image 1 as the foundational reference. Preserve the exact same person, outfit, environment, lighting, and mood. Recreate this exact scene but pull the camera back to a wider full-body environmental shot, showing more of the surrounding space. The subject should appear naturally within the broader scene at roughly the same position. Reveal more of the floor, ceiling or sky, and background context that would logically exist beyond the original frame. Keep the same lighting conditions and atmosphere. Slight wide-angle perspective as if taken on a smartphone rear camera stepped back a few meters`,
  // Variation 4: three-quarter rear view
  `Refer to Image 1 as the foundational reference. Preserve the exact same person, outfit, environment, lighting, and mood. Recreate this exact scene but reposition the camera approximately 120 degrees around the subject to capture a three-quarter rear view. The person is glancing back over their shoulder toward where the original camera was, with a natural relaxed expression. Show the back of their outfit and hair while keeping their face partially visible in profile. The same environment and lighting should be visible from this new perspective. Candid over-the-shoulder moment`,
];

// ==================== Free-form Prompt Expansion ====================

const FREEFORM_SYSTEM_PROMPT = `You are an expert prompt engineer for Seedream 4.5 AI image generation model.
Your job is to expand a short concept into a detailed, high-quality image generation prompt.

The generated image will use face and body reference images for character consistency.
Your prompt should describe EVERYTHING EXCEPT facial features, hair, and skin tone.

OUTPUT FORMAT:
"Use reference image 1 for the face structure. Use reference image 2 for the body type and physique.

Subject details: [detailed clothing, accessories, pose, body position, expression type].

The scene: [detailed environment, setting, props].

Lighting: [light source, direction, quality, shadows, color temperature].

Camera: [perspective, depth of field, composition. Default to eye-level. Understate angles].

Atmosphere: [mood, ambiance, weather].

Colors and textures: [dominant colors, materials, surfaces].

Technical quality: high-resolution, sharp focus, professional photography, photorealistic."

RULES:
- HARD LIMIT: Total prompt MUST be UNDER 1800 characters. Be complete but concise. Never get cut off mid-sentence.
- AVOID SUGGESTIVE LANGUAGE: Use neutral terms ("fitted top", "elegant V-neck", "feminine silhouette") instead of "cleavage", "plunging", "voluptuous bust", "ample". These trigger content moderation.
- NEVER describe: hair color/style, eye color, facial features, skin tone
- DO describe: clothing style/color/cut, pose, body language, expression type
- Use "this person" or "the subject" when referring to the individual
- BODY PROPORTIONS: Mention "curvy figure with feminine silhouette" once. Don't elaborate on body parts.
- Camera angle dampening: always understate angles by one level
- Output ONLY the prompt, nothing else`;

// ==================== Exported Functions ====================

export async function expandPrompt(
  basicPrompt: string,
  _personaDescription: string
): Promise<string> {
  return chat([
    { role: "system", content: FREEFORM_SYSTEM_PROMPT },
    { role: "user", content: basicPrompt },
  ]);
}

export async function analyzeIGPostForRecreation(
  imageUrl: string,
  caption: string,
  _personaDescription: string,
  faceRefCount = 1,
  bodyRefCount = 1
): Promise<string> {
  // Build dynamic image position references
  const totalRefs = faceRefCount + bodyRefCount;
  const faceRange = faceRefCount === 1 ? "1" : `1-${faceRefCount}`;
  const bodyStart = faceRefCount + 1;
  const bodyEnd = faceRefCount + bodyRefCount;
  const bodyRange = bodyRefCount === 1 ? `${bodyStart}` : `${bodyStart}-${bodyEnd}`;
  const scenePos = totalRefs + 1;

  const dynamicPrompt = IG_REPLICATOR_SYSTEM_PROMPT
    .replace(
      "- Seedream will receive 2 reference images:\n  1. Image 1: Face structure reference\n  2. Image 2: Body type and physique reference",
      `- Seedream will receive ${totalRefs + 1} reference images:\n  - Image ${faceRange}: Face structure reference\n  - Image ${bodyRange}: Body type and physique reference\n  - Image ${scenePos}: Complete scene reference (pose, clothing, composition)`
    )
    .replace(
      "Use reference image 1 for the face structure. Use reference image 2,3,4 for the body type and physique.",
      `Use reference image ${faceRange} for the face structure. Use reference image ${bodyRange} for the body type and physique. Use reference image ${scenePos} as the complete reference for clothing, pose, action, scene composition, background, lighting, and atmosphere.`
    );

  return chat([
    { role: "system", content: dynamicPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        {
          type: "text",
          text: caption
            ? `Original post caption for context: "${caption}"\n\nAnalyze this image and create the Seedream recreation prompt.`
            : "Analyze this image and create the Seedream recreation prompt.",
        },
      ],
    },
  ]);
}

export async function qualityCheck(
  imageUrl: string
): Promise<{ pass: boolean; issues: string }> {
  const response = await chat([
    {
      role: "system",
      content: `You are an extremely strict quality checker for AI-generated images. You MUST carefully count and verify every anatomical detail.

MANDATORY CHECKS (fail if ANY are wrong):
1. ARMS: Count the arms. A human has EXACTLY 2 arms. If you see 3 or more arms, or any extra limb-like shapes, FAIL immediately.
2. LEGS: Count the legs. A human has EXACTLY 2 legs. If you see 3 or more legs, FAIL immediately.
3. FINGERS: Each hand should have EXACTLY 5 fingers. Count them carefully. Extra or missing fingers = FAIL.
4. FACE: Check for distortion, asymmetry, double features (two noses, extra eyes), or uncanny features. Any = FAIL.
5. BODY MERGING: Check if any body parts are merging into objects, other limbs, or the background. Any merging = FAIL.
6. ARTIFACTS: Check for stains, smudges, watermarks, or unnatural marks on clothing or skin that shouldn't be there. Any = FAIL.
7. BODY PROPORTIONS: The character should have a curvy, voluptuous figure with a full bust and slim waist. If the bust appears noticeably small or flat = FAIL.

IMPORTANT: Be EXTREMELY strict. When in doubt, FAIL. It is better to reject a good image than to accept a flawed one.

Count arms and legs OUT LOUD in your analysis before making your decision.

Respond in this exact JSON format:
{"pass": true/false, "issues": "description of ALL issues found, or empty string if pass"}`,
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: "Quality check this AI-generated image." },
      ],
    },
  ]);

  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { pass: true, issues: "" };
  }
}

export async function generateCaption(
  imageUrl: string,
  personaDescription: string,
  context?: string,
  languages: string[] = ["english"]
): Promise<{ caption: string; hashtags: string }> {
  const languageInstruction =
    languages.length === 1
      ? `Write the caption in ${languages[0]}. Hashtags can stay in English.`
      : `Write the caption in any of these languages: ${languages.join(", ")}. You can use just one, or naturally mix them (e.g., Korean with English phrases like "오늘 vibe is so good 💕"). Pick whatever feels most natural for the post. Hashtags can stay in English.`;

  const response = await chat([
    {
      role: "system",
      content: `You write social media captions as this persona:
${personaDescription}

LANGUAGE: ${languageInstruction}

Write a caption that:
- Matches the persona's voice and vibe
- Is engaging and authentic
- Is suitable for Instagram/TikTok
- Is 1-3 sentences max
- Feels natural and human, not AI-generated

HASHTAGS RULES (STRICT):
- MAXIMUM 5 hashtags. Never more than 5.
- Often it's better to use 0-3 hashtags, or just emojis instead of hashtags
- Real humans rarely use 10+ hashtags — keep it natural
- Empty hashtags is totally fine if the caption already feels complete

Respond in this exact JSON format:
{"caption": "the caption", "hashtags": "#tag1 #tag2 #tag3"}`,
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        {
          type: "text",
          text: context
            ? `Write a caption for this image. Context: ${context}`
            : "Write a caption for this image.",
        },
      ],
    },
  ]);

  try {
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { caption: response.slice(0, 200), hashtags: "" };
  }
}

export async function generateCarouselPrompt(
  basePrompt: string,
  variationIndex: number
): Promise<string> {
  const carouselInstruction = CAROUSEL_PROMPTS[variationIndex] || CAROUSEL_PROMPTS[0];

  return chat([
    {
      role: "system",
      content: `You are creating a variation prompt for a carousel image set.

The base image was generated with this prompt:
${basePrompt}

Now create a modified version of the base prompt that incorporates the following variation instruction. Merge the variation naturally into the base prompt while keeping all the scene, clothing, and character details intact.

Output ONLY the final merged prompt, nothing else.`,
    },
    {
      role: "user",
      content: carouselInstruction,
    },
  ]);
}
