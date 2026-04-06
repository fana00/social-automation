"use client";

import { useEffect, useState, useCallback } from "react";
import ImagePreview from "@/components/ImagePreview";
import CarouselPreview from "@/components/CarouselPreview";
import MediaModal from "@/components/MediaModal";
import TaskStatusCard from "@/components/TaskStatusCard";
import type { GenerationLogEntry, CalendarEntry } from "@/types";

interface GalleryItem {
  type: "single" | "carousel" | "video";
  genId: string;
  persona: string;
  caption: string;
  hashtags: string;
  images: string[];
  status: string;
  calendarStatus: string;
  calendarRowId: string;
  mode: string;
}

interface BlotatoAccount {
  id: string;
  platform: string;
  username: string;
  displayName?: string;
}

// Default Blotato account username per persona
const PERSONA_DEFAULT_ACCOUNT: Record<string, string> = {
  zoey: "zoey_afterdark",
  liora: "liora._.han",
  rika: "its_rika.ai",
  // kiara: TBD
};

interface ScheduleModal {
  item: GalleryItem;
  caption: string;
  hashtags: string;
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [orphanedVideoStarts, setOrphanedVideoStarts] = useState<
    { genId: string; imageUrl: string; refVideoUrl: string; persona: string; caption: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "persona">("status");
  const [previewModal, setPreviewModal] = useState<{
    urls: string[];
    isVideo: boolean;
    caption: string;
  } | null>(null);
  const [accounts, setAccounts] = useState<BlotatoAccount[]>([]);
  const [scheduleModal, setScheduleModal] = useState<ScheduleModal | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"next_slot" | "now">("next_slot");
  const [pendingTasks, setPendingTasks] = useState<{ taskId: string; genId: string }[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Load/persist gallery pending tasks
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fana_gallery_tasks") || "[]");
      if (saved.length > 0) setPendingTasks(saved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("fana_gallery_tasks", JSON.stringify(pendingTasks));
  }, [pendingTasks]);

  // Load Blotato accounts
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts || []);
        if (d.accounts?.[0]) setSelectedAccountId(d.accounts[0].id);
      })
      .catch(() => {});
  }, []);

  const loadGallery = useCallback(async () => {
    try {
      const [logRes, calRes] = await Promise.all([
        fetch("/api/sheets/rows"),
        fetch("/api/sheets/calendar"),
      ]);
      const logData = await logRes.json();
      const calData = await calRes.json();
      const log: GenerationLogEntry[] = logData.log || [];
      const calendar: CalendarEntry[] = calData.entries || [];

      // Build calendar status lookup by rowId
      const calStatusMap = new Map<string, string>();
      calendar.forEach((c) => calStatusMap.set(c.rowId, c.status));

      const completed = log.filter(
        (e) =>
          e.finalResultUrls.length > 0 &&
          (e.qcStatus === "passed" || e.qcStatus === "failed-flagged")
      );

      const carouselGroups = new Map<string, GenerationLogEntry[]>();
      const singles: GenerationLogEntry[] = [];
      const videoStartImages: GenerationLogEntry[] = [];

      // Collect all Kling task IDs to detect orphaned start images
      const klingGenIds = new Set(
        log
          .filter((e) => e.model === "kling-3.0/motion-control")
          .map((e) => e.genId)
      );
      // Also check if any Kling task exists for each video ref URL
      const klingRefVideos = new Set(
        log
          .filter((e) => e.model === "kling-3.0/motion-control")
          .map((e) => {
            const match = e.expandedPrompt.match(/Reference video: (.+)/);
            return match?.[1] || "";
          })
          .filter(Boolean)
      );

      completed.forEach((entry) => {
        // Video start images — filter out from main grid
        if (
          entry.mode === "video" &&
          entry.carouselGroupId.startsWith("video:") &&
          entry.model !== "kling-3.0/motion-control"
        ) {
          videoStartImages.push(entry);
          return;
        }

        if (entry.carouselGroupId && !entry.carouselGroupId.startsWith("video:")) {
          const existing = carouselGroups.get(entry.carouselGroupId) || [];
          existing.push(entry);
          carouselGroups.set(entry.carouselGroupId, existing);
        } else {
          singles.push(entry);
        }
      });

      // Find orphaned start images (no corresponding Kling output)
      const orphaned = videoStartImages.filter((entry) => {
        const refVideo = entry.carouselGroupId.replace("video:", "");
        return !klingRefVideos.has(refVideo);
      });

      setOrphanedVideoStarts(
        orphaned.map((e) => ({
          genId: e.genId,
          imageUrl: e.finalResultUrls[0],
          refVideoUrl: e.carouselGroupId.replace("video:", ""),
          persona: e.persona,
          caption: e.basicPrompt,
        }))
      );

      const galleryItems: GalleryItem[] = [];

      carouselGroups.forEach((entries) => {
        const captionParts = (entries[0]?.caption || "").split("\n\n");
        const calStatus = calStatusMap.get(entries[0].calendarRowId) || "ready";
        galleryItems.push({
          type: "carousel",
          genId: entries[0].genId,
          persona: entries[0].persona,
          caption: captionParts[0] || "",
          hashtags: captionParts[1] || "",
          images: entries.flatMap((e) => e.finalResultUrls),
          status: entries[0].qcStatus,
          calendarStatus: calStatus,
          calendarRowId: entries[0].calendarRowId,
          mode: entries[0].mode,
        });
      });

      singles.forEach((entry) => {
        const captionParts = (entry.caption || "").split("\n\n");
        const isVideo =
          entry.mode === "video" && entry.model === "kling-3.0/motion-control";
        const calStatus = calStatusMap.get(entry.calendarRowId) || "ready";
        galleryItems.push({
          type: isVideo ? "video" : "single",
          genId: entry.genId,
          persona: entry.persona,
          caption: captionParts[0] || "",
          hashtags: captionParts[1] || "",
          images: entry.finalResultUrls,
          status: entry.qcStatus,
          calendarStatus: calStatus,
          calendarRowId: entry.calendarRowId,
          mode: entry.mode,
        });
      });

      // Check Blotato status for any item with a blotatoPostId (regardless of local status)
      // Blotato status values: "scheduled", "in-progress", "published", "failed"
      const itemsToCheck = calendar.filter(
        (c: CalendarEntry) =>
          c.blotatoPostId &&
          c.status !== "published" // skip already-published
      );
      for (const cal of itemsToCheck) {
        try {
          const statusRes = await fetch(
            `/api/publish/status?id=${encodeURIComponent(cal.blotatoPostId)}`
          );
          const statusData = await statusRes.json();

          let newStatus: string | null = null;
          if (statusData.status === "published") {
            newStatus = "published";
          } else if (statusData.status === "failed") {
            newStatus = "ready"; // reset so user can retry
          } else if (
            statusData.status === "scheduled" ||
            statusData.status === "in-progress"
          ) {
            // Blotato is queued or publishing — keep showing as scheduled in our UI
            newStatus = "scheduled";
          }

          if (newStatus && newStatus !== cal.status) {
            await fetch("/api/sheets/update", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "calendar",
                id: cal.rowId,
                updates: { status: newStatus },
              }),
            });
            const idx = galleryItems.findIndex(
              (g) => g.calendarRowId === cal.rowId
            );
            if (idx >= 0) galleryItems[idx].calendarStatus = newStatus;
          }
        } catch {
          // ignore status check failures
        }
      }

      setItems(galleryItems.reverse());
    } catch (err) {
      console.error("Failed to load gallery:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  function openScheduleModal(
    item: GalleryItem,
    caption: string,
    hashtags: string
  ) {
    // Auto-select the default account for this persona
    const defaultUsername = PERSONA_DEFAULT_ACCOUNT[item.persona];
    if (defaultUsername) {
      const match = accounts.find((a) => a.username === defaultUsername);
      if (match) setSelectedAccountId(match.id);
    }
    setScheduleModal({ item, caption, hashtags });
  }

  async function handlePublish() {
    if (!scheduleModal || !selectedAccountId) return;
    setPublishing(true);

    try {
      const account = accounts.find((a) => a.id === selectedAccountId);
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarRowId: scheduleModal.item.calendarRowId,
          accountId: selectedAccountId,
          caption: scheduleModal.caption,
          hashtags: scheduleModal.hashtags,
          mediaUrls: scheduleModal.item.images,
          platform: account?.platform || "instagram",
          useNextFreeSlot: scheduleMode === "next_slot",
        }),
      });

      if (res.ok) {
        setScheduleModal(null);
        loadGallery();
        alert("Scheduled successfully!");
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Publish failed:", err);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveCaption(item: GalleryItem, caption: string, hashtags: string) {
    // Update in local state immediately
    setItems((prev) =>
      prev.map((i) => (i.genId === item.genId ? { ...i, caption, hashtags } : i))
    );

    // Persist to Google Sheets
    await fetch("/api/sheets/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "generation",
        id: item.genId,
        updates: { caption: `${caption}\n\n${hashtags}` },
      }),
    });

    if (item.calendarRowId) {
      await fetch("/api/sheets/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "calendar",
          id: item.calendarRowId,
          updates: { caption, hashtags },
        }),
      });
    }
  }

  async function handleReject(item: GalleryItem) {
    if (!confirm("Reject this content?")) return;

    try {
      await fetch("/api/sheets/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generation",
          id: item.genId,
          updates: { qcStatus: "rejected" },
        }),
      });
      if (item.calendarRowId) {
        await fetch("/api/sheets/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "calendar",
            id: item.calendarRowId,
            updates: { status: "failed" },
          }),
        });
      }
      setItems((prev) => prev.filter((i) => i.genId !== item.genId));
    } catch (err) {
      console.error("Reject failed:", err);
    }
  }

  async function handleRegenerate(item: GalleryItem) {
    const newPrompt = window.prompt("Edit prompt and regenerate:", item.caption);
    if (!newPrompt) return;

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genId: item.genId,
          prompt: newPrompt,
          persona: item.persona,
          mode: item.mode,
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setItems((prev) => prev.filter((i) => i.genId !== item.genId));
        setPendingTasks((prev) => [
          { taskId: data.taskId, genId: data.genId },
          ...prev,
        ]);
      } else if (data.error) {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
    }
  }

  async function handleConvertToVideo(imageUrl: string) {
    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (data.taskId || data.klingTaskId) {
        alert(`Video generation started! Task: ${data.klingTaskId || data.taskId}`);
      }
    } catch (err) {
      console.error("Video conversion failed:", err);
    }
  }

  async function handleContinueVideo(
    startImageUrl: string,
    refVideoUrl: string,
    persona: string,
    caption: string
  ) {
    try {
      const res = await fetch("/api/generate/video/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startImageUrl,
          referenceVideoUrl: refVideoUrl,
          persona,
          caption,
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setPendingTasks((prev) => [
          { taskId: data.taskId, genId: data.genId },
          ...prev,
        ]);
        setOrphanedVideoStarts((prev) =>
          prev.filter((o) => o.imageUrl !== startImageUrl)
        );
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Continue video failed:", err);
    }
  }

  function openPreview(item: GalleryItem) {
    setPreviewModal({
      urls: item.images,
      isVideo: item.type === "video",
      caption: item.caption,
    });
  }

  const filteredItems =
    filter === "all"
      ? items
      : items.filter((item) => item.persona === filter);

  const personas = [...new Set(items.map((i) => i.persona))];

  const sectionColors: Record<string, string> = {
    ready: "border-green-500 text-green-400",
    scheduled: "border-blue-500 text-blue-400",
    published: "border-purple-500 text-purple-400",
    draft: "border-zinc-600 text-zinc-400",
    failed: "border-red-500 text-red-400",
  };
  const statusOrder = ["ready", "scheduled", "published", "draft", "failed"];
  const contentTypeLabels: Record<string, string> = {
    single: "Image",
    carousel: "Carousel",
    video: "Video",
  };

  function sortByStatus(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
      const ai = statusOrder.indexOf(a);
      const bi = statusOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  function groupByKey(items: GalleryItem[], key: "calendarStatus" | "persona" | "type"): Record<string, GalleryItem[]> {
    const groups: Record<string, GalleryItem[]> = {};
    items.forEach((item) => {
      const k = item[key];
      if (!groups[k]) groups[k] = [];
      groups[k].push(item);
    });
    return groups;
  }

  // Build nested group structure
  type NestedGroups = Record<string, Record<string, Record<string, GalleryItem[]>>>;

  const nestedGroups: NestedGroups = (() => {
    const result: NestedGroups = {};
    if (groupBy === "none") return { All: { All: { All: filteredItems } } };

    const primaryKey = groupBy === "status" ? "calendarStatus" : "persona";
    const secondaryKey = groupBy === "status" ? "persona" : "calendarStatus";

    const primary = groupByKey(filteredItems, primaryKey as "calendarStatus" | "persona");
    const primaryKeys = primaryKey === "calendarStatus" ? sortByStatus(Object.keys(primary)) : Object.keys(primary);

    primaryKeys.forEach((pk) => {
      result[pk] = {};
      const secondary = groupByKey(primary[pk], secondaryKey as "calendarStatus" | "persona");
      const secondaryKeys = secondaryKey === "calendarStatus" ? sortByStatus(Object.keys(secondary)) : Object.keys(secondary);

      secondaryKeys.forEach((sk) => {
        result[pk][sk] = groupByKey(secondary[sk], "type");
      });
    });

    return result;
  })();

  function renderItem(item: GalleryItem) {
    const isLocked = item.calendarStatus === "scheduled" || item.calendarStatus === "published";

    return item.type === "carousel" ? (
      <CarouselPreview
        key={item.genId}
        images={item.images}
        caption={item.caption}
        hashtags={item.hashtags}
        persona={item.persona}
        calendarStatus={item.calendarStatus}
        onSchedule={!isLocked ? (c, h) => openScheduleModal(item, c, h) : undefined}
        onClickPreview={() => openPreview(item)}
        onReject={!isLocked ? () => handleReject(item) : undefined}
        onSaveCaption={!isLocked ? (c, h) => handleSaveCaption(item, c, h) : undefined}
      />
    ) : (
      <ImagePreview
        key={item.genId}
        imageUrl={item.images[0]}
        caption={item.caption}
        hashtags={item.hashtags}
        persona={item.persona}
        isVideo={item.type === "video"}
        calendarStatus={item.calendarStatus}
        onSchedule={!isLocked ? (c, h) => openScheduleModal(item, c, h) : undefined}
        onConvertToVideo={
          !isLocked && item.type !== "video"
            ? () => handleConvertToVideo(item.images[0])
            : undefined
        }
        onClickPreview={() => openPreview(item)}
        onReject={!isLocked ? () => handleReject(item) : undefined}
        onSaveCaption={!isLocked ? (c, h) => handleSaveCaption(item, c, h) : undefined}
        onRegenerate={!isLocked ? () => handleRegenerate(item) : undefined}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Gallery</h1>
        <div className="flex gap-2">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as "none" | "status" | "persona")}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="none">No grouping</option>
            <option value="status">Group by status</option>
            <option value="persona">Group by persona</option>
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="all">All Personas</option>
            {personas.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            onClick={() => { setLoading(true); loadGallery(); }}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-200 mb-6 leading-relaxed">
        우측 그룹 선택 시 다른 view 확인 가능.<br />
        결과물이 보이지 않을 시 Refresh 버튼 클릭<br /><br />
        'Reject' 버튼 클릭 시 활용하지 않는 것으로 간주 / 페이지에서 보이지 않음<br />
        그래도 Google sheet 에서 기록 확인 가능
      </p>

      {/* Orphaned video start images — need Kling step */}
      {orphanedVideoStarts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-600">
            <h2 className="text-lg font-semibold text-yellow-400">
              Pending Video
            </h2>
            <span className="text-sm text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
              {orphanedVideoStarts.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orphanedVideoStarts.map((v) => (
              <div
                key={v.genId}
                className="border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden"
              >
                <div className="relative">
                  <img
                    src={v.imageUrl}
                    alt="Video start image"
                    className="w-full aspect-[3/4] object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-yellow-900 text-yellow-300 text-xs px-2 py-0.5 rounded">
                      start image
                    </span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="bg-zinc-900/80 text-xs px-2 py-0.5 rounded text-zinc-300">
                      {v.persona}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-zinc-500 mb-2">
                    Start image ready — video generation needed
                  </p>
                  <button
                    onClick={() =>
                      handleContinueVideo(
                        v.imageUrl,
                        v.refVideoUrl,
                        v.persona,
                        v.caption
                      )
                    }
                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-black text-xs font-medium py-1.5 rounded transition-colors"
                  >
                    Continue to Video
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending regeneration tasks */}
      {pendingTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">
            Regenerating ({pendingTasks.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingTasks.map((task) => (
              <TaskStatusCard
                key={task.taskId}
                taskId={task.taskId}
                onComplete={() => {
                  setPendingTasks((prev) =>
                    prev.filter((t) => t.taskId !== task.taskId)
                  );
                  loadGallery();
                }}
                onDismiss={() =>
                  setPendingTasks((prev) =>
                    prev.filter((t) => t.taskId !== task.taskId)
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-20">Loading gallery...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center text-zinc-500 py-20">
          No generated content yet. Go to Generate to create some!
        </div>
      ) : groupBy === "none" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map(renderItem)}
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(nestedGroups).map(([primaryGroup, subgroups]) => {
            const primaryColor = sectionColors[primaryGroup] || "border-zinc-600 text-zinc-400";
            const primaryTotal = Object.values(subgroups).reduce(
              (sum, types) => sum + Object.values(types).reduce((s, items) => s + items.length, 0), 0
            );

            return (
              <div key={primaryGroup}>
                {/* Primary group header */}
                <div className={`flex items-center gap-3 mb-5 pb-2 border-b-2 ${primaryColor.split(" ")[0]}`}>
                  <h2 className={`text-xl font-bold capitalize ${primaryColor.split(" ")[1]}`}>
                    {primaryGroup}
                  </h2>
                  <span className="text-sm text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                    {primaryTotal}
                  </span>
                </div>

                <div className="space-y-8 pl-2">
                  {Object.entries(subgroups).map(([secondaryGroup, contentTypes]) => {
                    const secondaryColor = sectionColors[secondaryGroup] || "border-zinc-700 text-zinc-300";
                    const secondaryTotal = Object.values(contentTypes).reduce((s, items) => s + items.length, 0);

                    return (
                      <div key={secondaryGroup}>
                        {/* Secondary group header */}
                        <div className={`flex items-center gap-2 mb-3 pb-1 border-b ${secondaryColor.split(" ")[0]} border-opacity-50`}>
                          <h3 className={`text-base font-semibold capitalize ${secondaryColor.split(" ")[1]}`}>
                            {secondaryGroup}
                          </h3>
                          <span className="text-xs text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                            {secondaryTotal}
                          </span>
                        </div>

                        <div className="space-y-4 pl-2">
                          {Object.entries(contentTypes).map(([contentType, items]) => (
                            <div key={contentType}>
                              {/* Content type label */}
                              <p className="text-xs text-zinc-600 mb-2 uppercase tracking-wider">
                                {contentTypeLabels[contentType] || contentType} ({items.length})
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {items.map(renderItem)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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

      {/* Schedule Modal */}
      {scheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setScheduleModal(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Schedule Post</h3>

            {/* Account selector */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Account</label>
              {accounts.length > 0 ? (
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || a.username} ({a.platform})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-zinc-500">
                  No accounts found. Connect accounts in Blotato first.
                </p>
              )}
            </div>

            {/* Schedule mode */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">When</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setScheduleMode("next_slot")}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    scheduleMode === "next_slot"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Next free slot
                </button>
                <button
                  onClick={() => setScheduleMode("now")}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    scheduleMode === "now"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Publish now
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-zinc-800 rounded-lg p-3">
              <p className="text-sm text-white mb-1">{scheduleModal.caption}</p>
              <p className="text-xs text-zinc-500">{scheduleModal.hashtags}</p>
              <p className="text-xs text-zinc-600 mt-1">
                {scheduleModal.item.images.length} media file(s)
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setScheduleModal(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || !selectedAccountId}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {publishing ? "Publishing..." : scheduleMode === "now" ? "Publish Now" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
