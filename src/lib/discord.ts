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

// ============================================================
// Discord Bot — send messages to a specific channel
// Requires: DISCORD_BOT_TOKEN, DISCORD_SCHEDULE_CHANNEL_ID
// ============================================================

async function sendBotMessage(
  channelId: string,
  content: string,
  embeds?: DiscordEmbed[]
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[discord] DISCORD_BOT_TOKEN not set, skipping notification");
    return;
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, embeds }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[discord] Bot message failed: ${res.status} - ${err}`);
  }
}

export async function notifyScheduled(opts: {
  persona: string;
  account: string;
  platform: string;
  caption: string;
  hashtags: string;
  mediaUrls: string[];
  contentType: "image" | "carousel" | "video";
  scheduledFor?: string;
}): Promise<void> {
  const channelId = process.env.DISCORD_SCHEDULE_CHANNEL_ID;
  if (!channelId) {
    console.warn("[discord] DISCORD_SCHEDULE_CHANNEL_ID not set");
    return;
  }

  const captionText = opts.caption + (opts.hashtags ? `\n\n${opts.hashtags}` : "");
  const truncated =
    captionText.length > 500 ? captionText.substring(0, 497) + "..." : captionText;

  // For video, use a thumbnail (Cloudinary's f_jpg,so_0 transformation)
  const previewUrl =
    opts.contentType === "video" && opts.mediaUrls[0]?.includes("/video/upload/")
      ? opts.mediaUrls[0]
          .replace("/video/upload/", "/video/upload/f_jpg,so_0/")
          .replace(/\.(mp4|mov|webm)$/i, ".jpg")
      : opts.mediaUrls[0];

  const embed: DiscordEmbed = {
    title: `📅 Scheduled — @${opts.account}`,
    description: truncated || "(no caption)",
    color: 0x5865f2,
    image: previewUrl ? { url: previewUrl } : undefined,
    fields: [
      { name: "Persona", value: opts.persona, inline: true },
      { name: "Platform", value: opts.platform, inline: true },
      { name: "Type", value: opts.contentType, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  if (opts.contentType === "carousel" && opts.mediaUrls.length > 1) {
    embed.fields?.push({
      name: "Images",
      value: `${opts.mediaUrls.length} images in carousel`,
      inline: true,
    });
  }

  if (opts.scheduledFor) {
    embed.fields?.push({
      name: "Scheduled for",
      value: opts.scheduledFor,
      inline: false,
    });
  }

  await sendBotMessage(channelId, "", [embed]);
}
