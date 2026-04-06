interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  image?: { url: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

export async function sendNotification(
  content: string,
  embeds?: DiscordEmbed[]
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      embeds,
    }),
  });
}

export async function notifyGenerationComplete(
  persona: string,
  imageUrl: string,
  caption: string,
  mode: string
): Promise<void> {
  await sendNotification("", [
    {
      title: `Generation Complete - ${persona}`,
      description: caption || "No caption generated yet",
      color: 0x00ff88,
      image: { url: imageUrl },
      fields: [
        { name: "Mode", value: mode, inline: true },
        { name: "Persona", value: persona, inline: true },
      ],
      timestamp: new Date().toISOString(),
    },
  ]);
}

export async function notifyGenerationFailed(
  persona: string,
  error: string,
  mode: string
): Promise<void> {
  await sendNotification("", [
    {
      title: `Generation Failed - ${persona}`,
      description: error,
      color: 0xff4444,
      fields: [
        { name: "Mode", value: mode, inline: true },
        { name: "Persona", value: persona, inline: true },
      ],
      timestamp: new Date().toISOString(),
    },
  ]);
}

export async function notifyQCFailed(
  persona: string,
  imageUrl: string,
  issues: string,
  attempt: number
): Promise<void> {
  await sendNotification("", [
    {
      title: `QC Failed (Attempt ${attempt}/3) - ${persona}`,
      description: issues,
      color: 0xffaa00,
      image: { url: imageUrl },
      timestamp: new Date().toISOString(),
    },
  ]);
}
