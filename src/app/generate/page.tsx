"use client";

import { useState, useEffect, useCallback } from "react";
import PersonaSelector from "@/components/PersonaSelector";
import SourceSelector from "@/components/SourceSelector";
import TaskStatusCard from "@/components/TaskStatusCard";
import MediaModal from "@/components/MediaModal";
import type { ScrapedPostEntry } from "@/types";
import { proxyUrl } from "@/lib/proxy-url";
import { v4 as uuidv4 } from "uuid";

type Tab = "ig-replicator" | "free-form";

interface ScrapedPost {
  imageUrl: string;
  mediaUrls: string[];
  caption: string;
  type: string;
}

export default function GeneratePage() {
  const [tab, setTab] = useState<Tab>("ig-replicator");
  const [persona, setPersona] = useState("");
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<{ taskId: string; genId: string }[]>([]);

  // Load tasks from localStorage on mount, filtering out already-processed ones
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fana_active_tasks") || "[]");
      const processed = JSON.parse(localStorage.getItem("fana_processed_tasks") || "[]");
      const active = saved.filter(
        (t: { taskId: string }) => !processed.includes(t.taskId)
      );
      if (active.length > 0) setTasks(active);
      // Clean up stale entries
      if (active.length !== saved.length) {
        localStorage.setItem("fana_active_tasks", JSON.stringify(active));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("fana_active_tasks", JSON.stringify(tasks));
  }, [tasks]);

  // IG Replicator state
  const [igSource, setIgSource] = useState("auto");
  const [igUrl, setIgUrl] = useState("");
  const [maxPosts, setMaxPosts] = useState(15);
  const [scrapeResult, setScrapeResult] = useState<{ newCount: number; skippedCount: number } | null>(null);
  const [scrapedPosts, setScrapedPosts] = useState<ScrapedPost[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<number>>(new Set());
  const [savedPosts, setSavedPosts] = useState<ScrapedPostEntry[]>([]);
  const [selectedSavedPosts, setSelectedSavedPosts] = useState<Set<string>>(new Set());
  const [showSaved, setShowSaved] = useState(false);
  const [scraping, setScraping] = useState(false);

  // Preview modal state
  const [previewModal, setPreviewModal] = useState<{
    urls: string[];
    isVideo: boolean;
    caption: string;
  } | null>(null);

  // Free-form state
  const [prompt, setPrompt] = useState("");
  const [promptImageUrl, setPromptImageUrl] = useState("");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [contentType, setContentType] = useState<"image" | "carousel" | "video">("image");
  const [carouselCount, setCarouselCount] = useState(4);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [videoInputMode, setVideoInputMode] = useState<"url" | "upload">("url");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Load saved scraped posts when persona changes
  const loadSavedPosts = useCallback(async () => {
    if (!persona) return;
    try {
      const res = await fetch(`/api/scrape/instagram?personaId=${persona}`);
      const data = await res.json();
      setSavedPosts(data.posts || []);
    } catch (err) {
      console.error("Failed to load saved posts:", err);
    }
  }, [persona]);

  useEffect(() => {
    loadSavedPosts();
  }, [loadSavedPosts]);

  async function handleScrape() {
    const url = igSource === "auto" ? igUrl : igSource;
    if (!url || !persona) return;

    setScraping(true);
    setScrapeResult(null);
    fetch("/api/scrape/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl: url, personaId: persona, maxPosts }),
    })
      .then((res) => res.json())
      .then((data) => {
        setScrapedPosts(data.posts || []);
        setSelectedPosts(new Set());
        setScrapeResult({
          newCount: data.newCount ?? data.posts?.length ?? 0,
          skippedCount: data.skippedCount ?? 0,
        });
        loadSavedPosts();
      })
      .catch((err) => console.error("Scrape failed:", err))
      .finally(() => setScraping(false));
  }

  function togglePost(index: number) {
    setSelectedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSavedPost(postId: string) {
    setSelectedSavedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function selectAll(posts: ScrapedPost[]) {
    setSelectedPosts(new Set(posts.map((_, i) => i)));
  }

  function deselectAll() {
    setSelectedPosts(new Set());
  }

  async function generateSingleImage(
    imageUrl: string,
    caption: string,
    sourceUrl: string,
    carouselGroupId?: string
  ) {
    const res = await fetch("/api/generate/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: caption,
        persona,
        mode: "ig-replicator",
        promptImageUrl: imageUrl,
        sourceIgUrl: sourceUrl,
        carouselGroupId,
      }),
    });
    return res.json();
  }

  async function generateVideo(
    videoUrl: string,
    thumbnailUrl: string,
    caption: string
  ) {
    const res = await fetch("/api/generate/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scrapedVideoUrl: videoUrl,
        thumbnailUrl,
        persona,
        caption,
      }),
    });
    return res.json();
  }

  function addTask(data: Record<string, string>) {
    const taskId = data.taskId || data.klingTaskId;
    const genId = data.genId || data.videoGenId;
    if (taskId) {
      setTasks((prev) => [{ taskId, genId }, ...prev]);
    }
  }

  async function handleGenerateSelected() {
    if (!persona) return;
    setLoading(true);

    try {
      const sourceUrl = igSource === "auto" ? igUrl : igSource;

      // Generate from newly scraped posts
      for (const index of selectedPosts) {
        const post = scrapedPosts[index];

        if (post.type === "video" && post.mediaUrls.length > 0) {
          const data = await generateVideo(post.mediaUrls[0], post.imageUrl, post.caption);
          addTask(data);
        } else if (post.type === "carousel" && post.mediaUrls.length >= 1) {
          // Carousel: generate each child image with shared group ID
          const groupId = uuidv4();
          for (const childUrl of post.mediaUrls) {
            const data = await generateSingleImage(childUrl, post.caption, sourceUrl, groupId);
            addTask(data);
            await new Promise((r) => setTimeout(r, 500));
          }
        } else {
          const data = await generateSingleImage(post.imageUrl, post.caption, sourceUrl);
          addTask(data);
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      // Generate from saved posts + mark as used
      for (const postId of selectedSavedPosts) {
        const post = savedPosts.find((p) => p.postId === postId);
        if (!post) continue;

        let generated = false;
        if (post.type === "video" && post.mediaUrls.length > 0) {
          const data = await generateVideo(post.mediaUrls[0], post.thumbnailUrl, post.caption);
          if (data.taskId || data.klingTaskId) generated = true;
          addTask(data);
        } else if (post.type === "carousel" && post.mediaUrls.length >= 1) {
          const groupId = uuidv4();
          for (const childUrl of post.mediaUrls) {
            const data = await generateSingleImage(childUrl, post.caption, post.sourceUrl, groupId);
            if (data.taskId) generated = true;
            addTask(data);
            await new Promise((r) => setTimeout(r, 500));
          }
        } else {
          const data = await generateSingleImage(post.thumbnailUrl, post.caption, post.sourceUrl);
          if (data.taskId) generated = true;
          addTask(data);
        }

        // Mark scraped post as used only if generation started
        if (generated) {
          fetch("/api/sheets/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "scraped",
              id: postId,
            }),
          }).catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 500));
      }

      setSelectedPosts(new Set());
      setSelectedSavedPosts(new Set());
      loadSavedPosts(); // Refresh to show updated "used" status
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFreeFormGenerate() {
    if (!persona) return;
    if (contentType === "video" && !referenceVideoUrl) return;
    if (contentType !== "video" && !prompt) return;

    setLoading(true);
    try {
      if (contentType === "video") {
        setVideoError(null);
        const res = await fetch("/api/generate/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scrapedVideoUrl: referenceVideoUrl,
            persona,
            caption: prompt || "",
          }),
        });
        const data = await res.json();
        if (data.error) {
          setVideoError(data.error);
        } else {
          const taskId = data.taskId || data.klingTaskId;
          const genId = data.genId || data.videoGenId;
          if (taskId) {
            setTasks((prev) => [{ taskId, genId }, ...prev]);
          }
        }
      } else if (contentType === "carousel") {
        const res = await fetch("/api/generate/carousel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, persona, count: carouselCount, aspectRatio }),
        });
        const data = await res.json();
        if (data.tasks) {
          setTasks((prev) => [...data.tasks, ...prev]);
        }
      } else {
        const res = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            persona,
            mode: "free-form",
            promptImageUrl: promptImageUrl || undefined,
            aspectRatio,
          }),
        });
        const data = await res.json();
        if (data.taskId) {
          setTasks((prev) => [{ taskId: data.taskId, genId: data.genId }, ...prev]);
        }
      }
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalSelected = selectedPosts.size + selectedSavedPosts.size;
  const unusedSavedPosts = savedPosts.filter((p) => !p.used);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Generate</h1>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg mb-6 w-fit">
        <button
          onClick={() => setTab("ig-replicator")}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "ig-replicator"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          IG Replicator
        </button>
        <button
          onClick={() => setTab("free-form")}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "free-form"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Free-form
        </button>
      </div>

      {/* Persona Selector (shared) */}
      <div className="mb-4">
        <label className="block text-sm text-zinc-400 mb-1">Persona</label>
        <PersonaSelector value={persona} onChange={setPersona} />
      </div>

      {/* IG Replicator Tab */}
      {tab === "ig-replicator" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">IG Source</label>
            <SourceSelector
              personaId={persona}
              value={igSource}
              onChange={setIgSource}
            />
          </div>

          {igSource === "auto" && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Or paste IG URL
              </label>
              <input
                value={igUrl}
                onChange={(e) => setIgUrl(e.target.value)}
                placeholder="https://instagram.com/username"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">크롤링할 포스트 수 Max</label>
              <input
                type="number"
                value={maxPosts}
                onChange={(e) => setMaxPosts(Math.min(30, Math.max(1, Number(e.target.value))))}
                min={1}
                max={30}
                className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
            <button
              onClick={handleScrape}
              disabled={scraping || (!igUrl && igSource === "auto")}
              className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {scraping ? "Scraping..." : "Scrape"}
            </button>
          </div>

          {scrapeResult && (
            <p className="text-xs text-zinc-500">
              {scrapeResult.newCount} new post{scrapeResult.newCount !== 1 ? "s" : ""} found
              {scrapeResult.skippedCount > 0 &&
                `, ${scrapeResult.skippedCount} duplicate${scrapeResult.skippedCount !== 1 ? "s" : ""} skipped`}
            </p>
          )}

          {/* Newly Scraped Posts */}
          {scrapedPosts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-zinc-400">
                  Scraped {scrapedPosts.length} posts — select to generate
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => selectAll(scrapedPosts)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {scrapedPosts.map((post, i) => (
                  <button
                    key={i}
                    onClick={() => togglePost(i)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      const urls = post.type === "carousel" && post.mediaUrls.length > 0
                        ? post.mediaUrls.map(proxyUrl)
                        : [proxyUrl(post.imageUrl)];
                      setPreviewModal({
                        urls,
                        isVideo: post.type === "video",
                        caption: post.caption,
                      });
                    }}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedPosts.has(i)
                        ? "border-blue-500"
                        : "border-transparent hover:border-zinc-600"
                    }`}
                  >
                    <img
                      src={proxyUrl(post.imageUrl)}
                      alt={`Post ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const t = e.currentTarget;
                        if (!t.src.includes("/api/proxy-image")) {
                          t.src = `/api/proxy-image?url=${encodeURIComponent(post.imageUrl)}`;
                        }
                      }}
                    />
                    {selectedPosts.has(i) && (
                      <div className="absolute top-1 right-1 bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                        &#10003;
                      </div>
                    )}
                    {post.type !== "image" && (
                      <span className="absolute bottom-1 right-1 bg-black/70 text-xs px-1 rounded">
                        {post.type}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Previously Saved Posts */}
          {unusedSavedPosts.length > 0 && (
            <div className="border-t border-zinc-800 pt-4">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
              >
                <span>{showSaved ? "v" : ">"}</span>
                크롤링 완료 but 미사용 ({unusedSavedPosts.length} 미활용)
              </button>

              {showSaved && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                  {unusedSavedPosts.map((post) => (
                    <button
                      key={post.postId}
                      onClick={() => toggleSavedPost(post.postId)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        const urls = post.mediaUrls.length > 0
                          ? post.mediaUrls.map(proxyUrl)
                          : [proxyUrl(post.thumbnailUrl)];
                        setPreviewModal({
                          urls,
                          isVideo: post.type === "video",
                          caption: post.caption,
                        });
                      }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedSavedPosts.has(post.postId)
                          ? "border-blue-500"
                          : "border-transparent hover:border-zinc-600"
                      }`}
                    >
                      <img
                        src={proxyUrl(post.thumbnailUrl)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const t = e.currentTarget;
                          if (!t.src.includes("/api/proxy-image")) {
                            t.src = `/api/proxy-image?url=${encodeURIComponent(post.thumbnailUrl)}`;
                          }
                        }}
                      />
                      {selectedSavedPosts.has(post.postId) && (
                        <div className="absolute top-1 right-1 bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                          &#10003;
                        </div>
                      )}
                      {post.type && post.type !== "image" && (
                        <span className="absolute top-1 left-1 bg-black/70 text-[10px] text-white px-1.5 py-0.5 rounded">
                          {post.type}
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <p className="text-[10px] text-zinc-300 truncate">
                          {post.sourceUrl.replace("https://www.instagram.com/", "@")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generate Button */}
          {totalSelected > 0 && (
            <div className="sticky bottom-4 bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
              <p className="text-sm text-zinc-300">
                {totalSelected} post{totalSelected > 1 ? "s" : ""} selected
              </p>
              <button
                onClick={handleGenerateSelected}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {loading
                  ? "Generating..."
                  : `Generate ${totalSelected} Image${totalSelected > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Free-form Tab */}
      {tab === "free-form" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              {contentType === "video" ? "Prompt (optional)" : "Prompt"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                contentType === "video"
                  ? "Optional: describe what you want (auto-generated from video reference)"
                  : "Describe the image you want to generate..."
              }
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {contentType === "video" && (
            <div className="space-y-3">
              {/* Toggle between URL and Upload */}
              <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg w-fit">
                <button
                  onClick={() => { setVideoInputMode("url"); setVideoError(null); }}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    videoInputMode === "url"
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Paste Reel URL
                </button>
                <button
                  onClick={() => { setVideoInputMode("upload"); setVideoError(null); }}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    videoInputMode === "upload"
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Upload Video
                </button>
              </div>

              {videoInputMode === "url" ? (
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    IG Reel URL or Video URL
                  </label>
                  <input
                    value={referenceVideoUrl}
                    onChange={(e) => { setReferenceVideoUrl(e.target.value); setVideoError(null); }}
                    placeholder="https://www.instagram.com/reel/ABC123/"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Upload Video File
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingVideo(true);
                      setVideoError(null);
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("upload_preset", "ref-img-upload");
                        formData.append("resource_type", "video");
                        const res = await fetch(
                          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dih4auf3w"}/video/upload`,
                          { method: "POST", body: formData }
                        );
                        const data = await res.json();
                        if (data.secure_url) {
                          setReferenceVideoUrl(data.secure_url);
                        } else {
                          setVideoError("Upload failed. Please try again.");
                        }
                      } catch {
                        setVideoError("Upload failed. Please try again.");
                      } finally {
                        setUploadingVideo(false);
                      }
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white file:mr-3 file:bg-zinc-700 file:text-zinc-300 file:border-0 file:rounded file:px-3 file:py-1 file:text-xs"
                  />
                  {uploadingVideo && (
                    <p className="text-xs text-yellow-400 mt-1">Uploading video...</p>
                  )}
                  {referenceVideoUrl && videoInputMode === "upload" && (
                    <p className="text-xs text-green-400 mt-1">Video uploaded successfully</p>
                  )}
                </div>
              )}

              {videoError && (
                <p className="text-sm text-red-400">{videoError}</p>
              )}
            </div>
          )}

          {contentType !== "video" && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Reference Image URL (optional)
              </label>
              <input
                value={promptImageUrl}
                onChange={(e) => setPromptImageUrl(e.target.value)}
                placeholder="Paste image URL for pose/composition reference"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}

          <div className="flex gap-4">
            {contentType !== "video" && (
              <div className="flex-1">
                <label className="block text-sm text-zinc-400 mb-1">
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                >
                  <option value="3:4">3:4 (Portrait)</option>
                  <option value="9:16">9:16 (Story/Reel)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                </select>
              </div>
            )}

            <div className="flex-1">
              <label className="block text-sm text-zinc-400 mb-1">
                Content Type
              </label>
              <select
                value={contentType}
                onChange={(e) =>
                  setContentType(e.target.value as "image" | "carousel" | "video")
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="image">Single Image</option>
                <option value="carousel">Carousel</option>
                <option value="video">Video</option>
              </select>
            </div>

            {contentType === "carousel" && (
              <div className="w-24">
                <label className="block text-sm text-zinc-400 mb-1">
                  Count
                </label>
                <input
                  type="number"
                  value={carouselCount}
                  onChange={(e) => setCarouselCount(Number(e.target.value))}
                  min={2}
                  max={5}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleFreeFormGenerate}
            disabled={
              loading ||
              (contentType === "video" ? !referenceVideoUrl : !prompt) ||
              !persona
            }
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
      )}

      {/* Active Tasks - Grid Layout */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-medium mb-4">
            Active Tasks ({tasks.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((task) => (
              <TaskStatusCard
                key={task.taskId}
                taskId={task.taskId}
                onDismiss={() =>
                  setTasks((prev) => prev.filter((t) => t.taskId !== task.taskId))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {previewModal && (
        <MediaModal
          urls={previewModal.urls}
          isVideo={previewModal.isVideo}
          caption={previewModal.caption}
          onClose={() => setPreviewModal(null)}
        />
      )}
    </div>
  );
}
