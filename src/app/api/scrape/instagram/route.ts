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
): Promise<string | null> {
  // Try direct Cloudinary upload first (Cloudinary's servers can sometimes fetch IG CDN)
  try {
    const direct = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload(
        url,
        { folder, resource_type: resourceType },
        (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
      );
    });
    return direct.secure_url;
  } catch {
    // Fall through to manual fetch + stream upload
  }

  // Fallback: fetch via our server, then stream to Cloudinary
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.error(`[scrape] Failed to fetch ${url.substring(0, 60)}: ${res.status}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
      );
      stream.end(buffer);
    });
    return result.secure_url;
  } catch (e) {
    console.error(`[scrape] Upload failed for ${url.substring(0, 60)}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function uploadPostMedia(
  post: ScrapedPost,
  personaId: string
): Promise<{ thumbnailUrl: string; mediaUrls: string[] } | null> {
  const folder = `fana/scraped/${personaId}`;

  const thumbnailUrl = await uploadToCloudinary(post.imageUrl, folder, "image");
  if (!thumbnailUrl) return null;

  const mediaUrls: string[] = [];
  for (const url of post.mediaUrls) {
    const resourceType = post.type === "video" ? "video" : "image";
    const uploaded = await uploadToCloudinary(url, folder, resourceType);
    if (!uploaded) return null;
    mediaUrls.push(uploaded);
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

    // Upload new posts to Cloudinary and persist (skip posts where any media fails)
    const postEntries = [];
    let skippedCount = 0;
    for (const post of newPosts) {
      const uploaded = await uploadPostMedia(post, personaId);
      if (!uploaded) {
        skippedCount++;
        continue;
      }
      postEntries.push({
        sourceUrl: profileUrl,
        personaId,
        thumbnailUrl: uploaded.thumbnailUrl,
        mediaUrls: uploaded.mediaUrls,
        caption: post.caption,
        type: post.type as "image" | "video" | "carousel",
        likes: post.likes,
        scrapedAt: new Date().toISOString(),
        used: false,
      });
    }
    if (postEntries.length > 0) {
      await appendScrapedPosts(postEntries);
    }
    if (skippedCount > 0) {
      console.warn(`[scrape] Skipped ${skippedCount} posts due to media upload failures`);
    }

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
