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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(
  url: string,
  folder: string,
  resourceType: "image" | "video" = "image"
): Promise<string | null> {
  // Try direct Cloudinary upload first (Cloudinary fetches the URL itself)
  try {
    const direct = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload(
        url,
        { folder, resource_type: resourceType, timeout: 60000 },
        (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
      );
    });
    return direct.secure_url;
  } catch (directErr) {
    console.warn(
      `[scrape] Cloudinary direct upload failed for ${url.substring(0, 80)}:`,
      directErr instanceof Error ? directErr.message : directErr
    );
  }

  // Fallback: fetch via our server, then stream to Cloudinary
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.instagram.com/",
      },
    });
    if (!res.ok) {
      console.error(
        `[scrape] Server fetch failed for ${url.substring(0, 80)}: ${res.status} ${res.statusText}`
      );
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
    console.error(
      `[scrape] Upload failed for ${url.substring(0, 80)}:`,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

async function uploadPostMedia(
  post: ScrapedPost
): Promise<{ thumbnailUrl: string; mediaUrls: string[] } | null> {
  // Shared folder so the same media can be reused across personas without duplication
  const folder = "fana/scraped/_shared";

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

    // Look up the IG Source row to determine which personas this profile feeds
    const igSource = await getIGSourceByUrl(profileUrl);

    // Resolve the list of personas for fan-out:
    // - If the source row exists, use its personaIds (multi-persona support)
    // - Otherwise (manual scrape of new URL), use the personaId from the request
    const targetPersonas: string[] =
      igSource?.source.personaIds && igSource.source.personaIds.length > 0
        ? igSource.source.personaIds
        : personaId
          ? [personaId]
          : [];

    if (targetPersonas.length === 0) {
      return NextResponse.json(
        { error: "No persona linked to this profile" },
        { status: 400 }
      );
    }

    // Date filter: only apply when explicitly provided by the user.
    // No auto-filter from lastScraped — user has full control.
    const effectiveNewerThan = newerThan || undefined;

    // Single Apify scrape (regardless of how many personas are linked)
    const posts = await scrapeInstagramProfile(
      profileUrl,
      Math.min(maxPosts, 30),
      effectiveNewerThan
    );

    if (posts.length === 0) {
      await updateIGSourceLastScraped(profileUrl, new Date().toISOString(), 0);
      return NextResponse.json({ posts: [], newCount: 0 });
    }

    // Pre-fetch existing scraped posts for ALL target personas, so we can dedup
    // BEFORE uploading to Cloudinary (avoids wasted bandwidth on duplicates).
    const existingByPersona = new Map<string, Set<string>>();
    for (const targetPersona of targetPersonas) {
      const existingPosts = await getScrapedPosts(targetPersona);
      existingByPersona.set(
        targetPersona,
        new Set(existingPosts.map((p) => p.caption.substring(0, 100)))
      );
    }

    // A post is "new" if it's missing from at least one target persona's history.
    // (If all target personas already have it, no need to upload.)
    const newPosts = posts.filter((p) => {
      const cap = p.caption.substring(0, 100);
      return targetPersonas.some(
        (persona) => !existingByPersona.get(persona)!.has(cap)
      );
    });

    const dedupedCount = posts.length - newPosts.length;

    // Upload only the new posts to Cloudinary
    const uploadedPosts: {
      post: ScrapedPost;
      thumbnailUrl: string;
      mediaUrls: string[];
    }[] = [];
    let uploadFailures = 0;
    for (const post of newPosts) {
      const uploaded = await uploadPostMedia(post);
      if (!uploaded) {
        uploadFailures++;
        continue;
      }
      uploadedPosts.push({ post, ...uploaded });
    }

    // Fan out to each linked persona: per-persona dedup (some personas may already have a post)
    let totalNewCount = 0;
    const requestPersonaEntries: typeof uploadedPosts = [];

    for (const targetPersona of targetPersonas) {
      const existingCaptions = existingByPersona.get(targetPersona)!;

      const newForPersona = uploadedPosts.filter(
        (u) => !existingCaptions.has(u.post.caption.substring(0, 100))
      );

      if (newForPersona.length === 0) continue;

      const entries = newForPersona.map((u) => ({
        sourceUrl: profileUrl,
        personaId: targetPersona,
        thumbnailUrl: u.thumbnailUrl,
        mediaUrls: u.mediaUrls,
        caption: u.post.caption,
        type: u.post.type as "image" | "video" | "carousel",
        likes: u.post.likes,
        scrapedAt: new Date().toISOString(),
        used: false,
      }));

      await appendScrapedPosts(entries);
      totalNewCount += newForPersona.length;

      // Track entries for the persona that initiated the request (for response)
      if (targetPersona === personaId) {
        requestPersonaEntries.push(...newForPersona);
      }
    }

    if (uploadFailures > 0) {
      console.warn(
        `[scrape] Skipped ${uploadFailures} posts due to media upload failures`
      );
    }
    const totalSkippedCount = dedupedCount + uploadFailures;

    // Update Last Scraped on the IG Sources row (or create if missing)
    if (igSource) {
      await updateIGSourceLastScraped(
        profileUrl,
        new Date().toISOString(),
        uploadedPosts.length
      );
    } else if (personaId) {
      // Auto-add new source to IG Sources tab with the requesting persona
      await appendIGSource({
        profileUrl,
        personaIds: [personaId],
        lastScraped: new Date().toISOString(),
        postsScraped: uploadedPosts.length,
        active: true,
        notes: "Auto-added from scrape",
      });
    }

    // Return the entries for the requesting persona (so the UI shows what they
    // can act on). If the request didn't specify a persona, fall back to all uploads.
    const responseEntries =
      requestPersonaEntries.length > 0 ? requestPersonaEntries : uploadedPosts;

    return NextResponse.json({
      posts: responseEntries.map((e) => ({
        imageUrl: e.thumbnailUrl,
        mediaUrls: e.mediaUrls,
        caption: e.post.caption,
        type: e.post.type,
        likes: e.post.likes,
        timestamp: new Date().toISOString(),
      })),
      newCount: totalNewCount,
      skippedCount: totalSkippedCount,
      personasFanout: targetPersonas,
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
