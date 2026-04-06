const BLOTATO_API_BASE = "https://backend.blotato.com/v2";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "blotato-api-key": process.env.BLOTATO_API_KEY || "",
  };
}

export interface BlotatoAccount {
  id: string;
  platform: string;
  username: string;
  displayName?: string;
}

export async function getAccounts(): Promise<BlotatoAccount[]> {
  const res = await fetch(`${BLOTATO_API_BASE}/users/me/accounts`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blotato getAccounts failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const list = data.items || data.accounts || (Array.isArray(data) ? data : []);
  return list.map(
    (a: Record<string, unknown>) => ({
      id: String(a.id || ""),
      platform: String(a.platform || ""),
      username: String(a.username || ""),
      displayName: String(a.fullname || a.displayName || a.username || ""),
    })
  );
}

interface SchedulePostOptions {
  accountId: string;
  text: string;
  mediaUrls: string[];
  platform: string;
  scheduledTime?: string;
  useNextFreeSlot?: boolean;
}

export async function schedulePost(
  options: SchedulePostOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    post: {
      accountId: options.accountId,
      content: {
        text: options.text,
        mediaUrls: options.mediaUrls,
        platform: options.platform,
      },
      target: {
        targetType: options.platform,
      },
    },
  };

  if (options.scheduledTime) {
    body.scheduledTime = options.scheduledTime;
  } else if (options.useNextFreeSlot) {
    body.useNextFreeSlot = true;
  }

  const res = await fetch(`${BLOTATO_API_BASE}/posts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blotato schedulePost failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.postSubmissionId || data.postId || data.id || "";
}

export interface PostStatus {
  postSubmissionId: string;
  status: "in-progress" | "published" | "failed";
  publicUrl?: string;
  errorMessage?: string;
}

export async function getPostStatus(
  postSubmissionId: string
): Promise<PostStatus> {
  const res = await fetch(
    `${BLOTATO_API_BASE}/posts/${postSubmissionId}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Blotato getPostStatus failed: ${res.status}`);
  }

  return res.json();
}
