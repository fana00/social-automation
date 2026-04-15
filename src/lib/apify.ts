interface ScrapedPost {
  imageUrl: string;
  mediaUrls: string[];
  caption: string;
  likes: number;
  timestamp: string;
  type: "image" | "video" | "carousel";
}

export async function scrapeInstagramProfile(
  profileUrl: string,
  maxPosts = 15,
  newerThan?: string
): Promise<ScrapedPost[]> {
  const username = profileUrl
    .replace(/\/$/, "")
    .split("/")
    .pop()
    ?.replace("@", "");

  if (!username) throw new Error("Invalid Instagram profile URL");

  const body: Record<string, unknown> = {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: "posts",
    resultsLimit: Math.min(maxPosts, 30),
    searchType: "user",
  };

  if (newerThan) {
    body.onlyPostsNewerThan = newerThan;
  }

  const res = await fetch(
    "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apify scrape failed: ${res.status} - ${err}`);
  }

  const data = await res.json();

  return data
    .filter((post: Record<string, unknown>) => post.displayUrl || post.imageUrl)
    .map((post: Record<string, unknown>) => {
      const childPosts = post.childPosts as Array<Record<string, unknown>> | undefined;
      const isCarousel = childPosts && childPosts.length > 0;
      const isVideo = post.type === "Video";

      const imageUrl = (post.displayUrl || post.imageUrl) as string;

      let mediaUrls: string[];
      if (isVideo) {
        const videoUrl = (post.videoUrl || (post.video as Record<string, unknown>)?.url || "") as string;
        mediaUrls = videoUrl ? [videoUrl] : [];
      } else if (isCarousel) {
        mediaUrls = childPosts
          .map((child) => (child.displayUrl || child.imageUrl) as string)
          .filter(Boolean);
      } else {
        mediaUrls = [imageUrl];
      }

      return {
        imageUrl,
        mediaUrls,
        caption: ((post.caption as string) || "").slice(0, 500),
        likes: (post.likesCount as number) || 0,
        timestamp: (post.timestamp as string) || "",
        type: isVideo ? "video" : isCarousel ? "carousel" : "image",
      };
    });
}

export async function scrapeInstagramPost(
  postUrl: string
): Promise<{ videoUrl: string; imageUrl: string; caption: string }> {
  const res = await fetch(
    "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
      },
      body: JSON.stringify({
        directUrls: [postUrl],
        resultsType: "posts",
        resultsLimit: 1,
        searchType: "user",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Could not access this reel: ${res.status}`);
  }

  const data = await res.json();

  if (!data || data.length === 0) {
    throw new Error("Could not access this reel. The URL may be invalid or private.");
  }

  const post = data[0];
  const isVideo = post.type === "Video";

  if (!isVideo) {
    throw new Error("This URL is not a video/reel post.");
  }

  const videoUrl = post.videoUrl || post.video?.url;
  if (!videoUrl) {
    throw new Error("Could not extract video URL from this reel.");
  }

  return {
    videoUrl,
    imageUrl: post.displayUrl || post.imageUrl || "",
    caption: ((post.caption as string) || "").slice(0, 500),
  };
}

export type { ScrapedPost };
