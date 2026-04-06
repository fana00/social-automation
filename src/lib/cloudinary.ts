import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadFromUrl(
  sourceUrl: string,
  folder = "fana/generated"
): Promise<string> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder,
    resource_type: "auto",
    format: "jpg",
    quality: "auto:good",
    transformation: [{ width: 2048, crop: "limit" }],
  });
  return result.secure_url;
}

/** Upload a video and return both the video URL and a screenshot thumbnail URL */
export async function uploadVideoFromUrl(
  sourceUrl: string,
  folder = "fana/videos"
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder,
    resource_type: "video",
  });

  const videoUrl = result.secure_url;

  // Generate screenshot from first frame using Cloudinary transformation
  // Replace /video/upload/ with /video/upload/f_jpg,so_0/ to get first frame as JPG
  const thumbnailUrl = videoUrl.replace(
    "/video/upload/",
    "/video/upload/f_jpg,so_0/"
  );

  return { videoUrl, thumbnailUrl };
}

export async function getGallery(
  folder = "fana/generated",
  maxResults = 50
): Promise<
  { url: string; publicId: string; createdAt: string; resourceType: string }[]
> {
  const result = await cloudinary.api.resources({
    type: "upload",
    prefix: folder,
    max_results: maxResults,
    sort_by: [{ created_at: "desc" }],
    resource_type: "image",
  });

  return result.resources.map(
    (r: {
      secure_url: string;
      public_id: string;
      created_at: string;
      resource_type: string;
    }) => ({
      url: r.secure_url,
      publicId: r.public_id,
      createdAt: r.created_at,
      resourceType: r.resource_type,
    })
  );
}
