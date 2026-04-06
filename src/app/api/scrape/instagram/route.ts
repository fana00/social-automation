import { NextRequest, NextResponse } from "next/server";
import { scrapeInstagramProfile, type ScrapedPost } from "@/lib/apify";
import {
  appendScrapedPosts,
  getScrapedPosts,
  getIGSourceByUrl,
  updateIGSourceLastScraped,
  appendIGSource,
} from "@/lib/sheets";
import { v2 as cloudinary } from "cloudinary";

async function uploadToCloudinary(
  url: string,
  folder: string,
  resourceType: "image" | "video" = "image"
): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) return url;

  const buffer = Buffer.from(await res.arrayBuffer());
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
    );
    stream.end(buffer);
  });
  return result.secure_url;
}

async function uploadPostMedia(
  post: ScrapedPost,
  personaId: string
): Promise<{ thumbnailUrl: string; mediaUrls: string[] }> {
  const folder = `fana/scraped/${personaId}`;

  const thumbnailUrl = await uploadToCloudinary(
    post.imageUrl,
    folder,
    "image"
  ).catch(() => post.imageUrl);

  const mediaUrls: string[] = [];
  for (const url of post.mediaUrls) {
    try {
      const resourceType = post.type === "video" ? "video" : "image";
      const uploaded = await uploadToCloudinary(url, folder, resourceType);
      mediaUrls.push(uploaded);
    } catch {
      mediaUrls.push(url);
    }
  }

  return { thumbnailUrl, mediaUrls };
}

export async function POST(req: NextRequest) {
  try {
    const { profileUrl, personaId, maxPosts = 15, newerThan } = await req.json();

    if (!profileUrl) {
      return NextResponse.json(
        { error: "profileUrl is required" },
        { status: 400 }
      );
    }

    // Auto-determine date filter from IG Sources tab
    let effectiveNewerThan = newerThan;
    if (!effectiveNewerThan) {
      const igSource = await getIGSourceByUrl(profileUrl);
      if (igSource?.source.lastScraped) {
        // Use last scraped date to only get new posts
        effectiveNewerThan = igSource.source.lastScraped.split("T")[0];
      }
    }

    const posts = await scrapeInstagramProfile(
      profileUrl,
      Math.min(maxPosts, 30),
      effectiveNewerThan
    );

    if (!personaId || posts.length === 0) {
      return NextResponse.json({ posts, newCount: 0 });
    }

    // Dedup: compare against existing scraped posts by caption
    const existingPosts = await getScrapedPosts(personaId);
    const existingCaptions = new Set(
      existingPosts.map((p) => p.caption.substring(0, 100))
    );

    const newPosts = posts.filter(
      (p) => !existingCaptions.has(p.caption.substring(0, 100))
    );

    if (newPosts.length === 0) {
      // Update last scraped even if no new posts
      await updateIGSourceLastScraped(profileUrl, new Date().toISOString(), 0);
      return NextResponse.json({ posts: [], newCount: 0 });
    }

    // Upload new posts to Cloudinary and persist
    const postEntries = [];
    for (const post of newPosts) {
      const { thumbnailUrl, mediaUrls } = await uploadPostMedia(post, personaId);
      postEntries.push({
        sourceUrl: profileUrl,
        personaId,
        thumbnailUrl,
        mediaUrls,
        caption: post.caption,
        type: post.type as "image" | "video" | "carousel",
        likes: post.likes,
        scrapedAt: new Date().toISOString(),
        used: false,
      });
    }
    await appendScrapedPosts(postEntries);

    // Update Last Scraped timestamp and count in IG Sources tab
    const igSource = await getIGSourceByUrl(profileUrl);
    if (igSource) {
      await updateIGSourceLastScraped(
        profileUrl,
        new Date().toISOString(),
        newPosts.length
      );
    } else if (personaId) {
      // Auto-add new source to IG Sources tab
      await appendIGSource({
        profileUrl,
        personaId,
        lastScraped: new Date().toISOString(),
        postsScraped: newPosts.length,
        active: true,
        notes: "Auto-added from scrape",
      });
    }

    return NextResponse.json({
      posts: postEntries.map((e) => ({
        imageUrl: e.thumbnailUrl,
        mediaUrls: e.mediaUrls,
        caption: e.caption,
        type: e.type,
        likes: e.likes,
        timestamp: e.scrapedAt,
      })),
      newCount: newPosts.length,
      skippedCount: posts.length - newPosts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId") || undefined;
    const posts = await getScrapedPosts(personaId);
    return NextResponse.json({ posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
