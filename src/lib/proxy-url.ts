/** Proxy external URLs (Instagram CDN etc.) through our API to avoid CORS blocks */
export function proxyUrl(url: string): string {
  if (!url) return "";
  if (
    url.includes("cdninstagram.com") ||
    url.includes("instagram.com") ||
    url.includes("fbcdn.net")
  ) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
