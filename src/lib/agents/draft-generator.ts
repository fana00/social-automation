import { createImageTask } from "@/lib/kie";
import { expandPrompt, analyzeIGPostForRecreation } from "@/lib/openrouter";
import { getPersonaById } from "@/lib/sheets";

interface DraftGeneratorInput {
  persona: string;
  mode: "ig-replicator" | "free-form";
  basicPrompt?: string;
  promptImageUrl?: string;
  aspectRatio?: string;
  // For IG replicator mode
  scrapedImageUrl?: string;
  scrapedCaption?: string;
}

interface DraftGeneratorOutput {
  taskId: string;
  expandedPrompt: string;
  model: string;
  faceRefUrls: string[];
  bodyRefUrls: string[];
}

export async function runDraftGenerator(
  input: DraftGeneratorInput
): Promise<DraftGeneratorOutput> {
  const personaData = await getPersonaById(input.persona);
  if (!personaData) throw new Error(`Persona '${input.persona}' not found`);

  let expandedPrompt: string;

  if (input.mode === "ig-replicator" && input.scrapedImageUrl) {
    // IG Replicator: analyze scraped post and recreate for persona
    expandedPrompt = await analyzeIGPostForRecreation(
      input.scrapedImageUrl,
      input.scrapedCaption || "",
      personaData.personality,
      personaData.faceRefUrls.length,
      personaData.bodyRefUrls.length
    );
  } else if (input.basicPrompt) {
    // Free-form: expand the user's prompt
    expandedPrompt = await expandPrompt(
      input.basicPrompt,
      personaData.personality
    );
  } else {
    throw new Error("No prompt or scraped content provided");
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/tasks/callback`;

  // Pass ALL face and body refs + scene reference to kie.ai
  // image_urls order: face refs → body refs → scene/scraped image (last)
  const taskId = await createImageTask({
    prompt: expandedPrompt,
    faceRefUrls: personaData.faceRefUrls,
    bodyRefUrls: personaData.bodyRefUrls,
    sceneRefUrl:
      input.mode === "ig-replicator" ? input.scrapedImageUrl : input.promptImageUrl,
    aspectRatio: input.aspectRatio || "3:4",
    callbackUrl,
  });

  const model = "fal:seedream-v4.5-edit";

  return {
    taskId,
    expandedPrompt,
    model,
    faceRefUrls: personaData.faceRefUrls,
    bodyRefUrls: personaData.bodyRefUrls,
  };
}
