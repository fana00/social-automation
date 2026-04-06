"use client";

import { useEffect, useState, useRef } from "react";
import StatusBadge from "./StatusBadge";

interface Props {
  taskId: string;
  onComplete?: (resultUrl: string) => void;
  onDismiss?: () => void;
}

function markTaskProcessed(id: string) {
  const processed: string[] = JSON.parse(
    localStorage.getItem("fana_processed_tasks") || "[]"
  );
  if (!processed.includes(id)) {
    processed.push(id);
    if (processed.length > 100) processed.splice(0, processed.length - 100);
    localStorage.setItem("fana_processed_tasks", JSON.stringify(processed));
  }
  // Remove from active tasks
  const active = JSON.parse(localStorage.getItem("fana_active_tasks") || "[]");
  localStorage.setItem("fana_active_tasks",
    JSON.stringify(active.filter((t: { taskId: string }) => t.taskId !== id))
  );
  // Remove from callback in-progress
  const inProgress: string[] = JSON.parse(
    localStorage.getItem("fana_callback_in_progress") || "[]"
  );
  localStorage.setItem("fana_callback_in_progress",
    JSON.stringify(inProgress.filter((t) => t !== id))
  );
}

export default function TaskStatusCard({ taskId, onComplete, onDismiss }: Props) {
  const [status, setStatus] = useState("pending");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const processedRef = useRef(false);

  useEffect(() => {
    if (!taskId) return;

    // Check if this task was already processed or callback is in progress
    const processedTasks: string[] = JSON.parse(
      localStorage.getItem("fana_processed_tasks") || "[]"
    );
    const callbackInProgress: string[] = JSON.parse(
      localStorage.getItem("fana_callback_in_progress") || "[]"
    );
    if (processedTasks.includes(taskId) || callbackInProgress.includes(taskId)) {
      setStatus("completed");
      return;
    }

    processedRef.current = false;

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const data = await res.json();

        setStatus(data.status);

        if (data.status === "completed" && data.resultUrl) {
          clearInterval(poll);
          clearInterval(timer);
          setResultUrl(data.resultUrl);

          // Trigger post-processing (QC + Caption + Cloudinary upload)
          // This handles the case where kie.ai callback can't reach localhost
          if (!processedRef.current) {
            processedRef.current = true;

            // Mark callback in progress in localStorage to prevent duplicates on navigation
            const inProgress: string[] = JSON.parse(
              localStorage.getItem("fana_callback_in_progress") || "[]"
            );
            if (!inProgress.includes(taskId)) {
              inProgress.push(taskId);
              localStorage.setItem("fana_callback_in_progress", JSON.stringify(inProgress));
            }

            setProcessing(true);
            setStatus("processing QC & caption...");
            try {
              const cbRes = await fetch("/api/tasks/callback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  taskId,
                  status: "success",
                  resultUrl: data.resultUrl,
                }),
              });
              const cbData = await cbRes.json();
              if (cbData.chainedToVideo && cbData.klingTaskId) {
                // Video pipeline: Seedream done, now polling Kling
                setStatus("Generating video...");
                setResultUrl(cbData.startImageUrl || data.resultUrl);
                processedRef.current = false;
                // Poll the Kling task now
                const klingPoll = setInterval(async () => {
                  try {
                    const kr = await fetch(`/api/tasks/${cbData.klingTaskId}`);
                    const kd = await kr.json();
                    if (kd.status === "completed" && kd.resultUrl) {
                      clearInterval(klingPoll);
                      // Trigger callback for Kling result
                      const kr2 = await fetch("/api/tasks/callback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          taskId: cbData.klingTaskId,
                          status: "success",
                          resultUrl: kd.resultUrl,
                        }),
                      });
                      const kd2 = await kr2.json();
                      setResultUrl(kd2.cloudinaryUrl || kd.resultUrl);
                      setStatus("completed");
                      setProcessing(false);
                      markTaskProcessed(taskId);
                      onComplete?.(kd2.cloudinaryUrl || kd.resultUrl);
                    } else if (kd.status === "failed") {
                      clearInterval(klingPoll);
                      setError(kd.error || "Video generation failed");
                      setProcessing(false);
                    }
                  } catch { /* keep polling */ }
                }, 5000);
              } else if (cbData.cloudinaryUrl) {
                setResultUrl(cbData.cloudinaryUrl);
                setStatus("completed");
                markTaskProcessed(taskId);
                onComplete?.(cbData.cloudinaryUrl);
              } else if (cbData.retrying) {
                setStatus("QC failed, retrying...");
                processedRef.current = false;
              } else {
                setStatus("completed");
                markTaskProcessed(taskId);
                onComplete?.(data.resultUrl);
              }
            } catch {
              setStatus("completed");
              markTaskProcessed(taskId);
              onComplete?.(data.resultUrl);
            } finally {
              setProcessing(false);
            }
          }
        } else if (data.status === "failed") {
          setError(data.error || "Generation failed");
          clearInterval(poll);
          clearInterval(timer);
        }
      } catch {
        // Keep polling on network errors
      }
    }, 5000);

    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [taskId, onComplete, retryKey]);

  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusBadge
            status={
              processing
                ? "generating"
                : status === "completed"
                  ? "ready"
                  : status
            }
          />
          {(status === "processing" || processing) && (
            <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          )}
        </div>
        <span className="text-xs text-zinc-500">{elapsed}s</span>
      </div>

      {/* Progress estimation */}
      {status !== "completed" && status !== "failed" && !processing && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>
              {elapsed < 30
                ? "Generating image..."
                : elapsed < 60
                  ? "Still processing..."
                  : "Taking longer than usual..."}
            </span>
            <span>~{elapsed < 40 ? "30-40s" : elapsed < 120 ? "1-2 min" : "2-3 min"}</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(95, (elapsed / 45) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {processing && (
        <p className="text-xs text-yellow-400 mb-2">
          Running QC check &amp; generating caption...
        </p>
      )}

      <p className="text-xs text-zinc-500 font-mono mb-3 truncate">
        Task: {taskId}
      </p>

      {error && (
        <div className="mb-3">
          <p className="text-sm text-red-400 mb-2">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Remove from processed list so it can re-poll
                const processed: string[] = JSON.parse(
                  localStorage.getItem("fana_processed_tasks") || "[]"
                );
                localStorage.setItem(
                  "fana_processed_tasks",
                  JSON.stringify(processed.filter((id) => id !== taskId))
                );
                // Reset state and re-trigger the useEffect
                setError(null);
                setStatus("pending");
                setResultUrl(null);
                setElapsed(0);
                setProcessing(false);
                processedRef.current = false;
                setRetryKey((k) => k + 1);
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Retry
            </button>
            {onDismiss && (
              <button
                onClick={() => {
                  markTaskProcessed(taskId);
                  onDismiss();
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-500 text-xs px-3 py-1.5 rounded transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {resultUrl && (
        <div className="mt-2">
          {resultUrl.match(/\.(mp4|mov|webm)$/i) || resultUrl.includes("/video/upload/") ? (
            <video
              src={resultUrl}
              controls
              className="w-full rounded-lg border border-zinc-800"
            />
          ) : (
            <img
              src={resultUrl}
              alt="Generated result"
              className="w-full rounded-lg border border-zinc-800"
            />
          )}
        </div>
      )}
    </div>
  );
}
