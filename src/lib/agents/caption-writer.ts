import { generateCaption } from "@/lib/openrouter";
import { getPersonaById, updateGenerationLog } from "@/lib/sheets";

interface CaptionInput {
  genId: string;
  imageUrl: string;
  persona: string;
  context?: string;
}

interface CaptionOutput {
  caption: string;
  hashtags: string;
}

export async function runCaptionWriter(
  input: CaptionInput
): Promise<CaptionOutput> {
  const personaData = await getPersonaById(input.persona);
  if (!personaData) throw new Error(`Persona '${input.persona}' not found`);

  const result = await generateCaption(
    input.imageUrl,
    personaData.personality,
    input.context,
    personaData.languages
  );

  // Update the generation log with the caption
  await updateGenerationLog(input.genId, {
    caption: `${result.caption}\n\n${result.hashtags}`,
  });

  return result;
}
