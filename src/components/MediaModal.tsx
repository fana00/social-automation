"use client";

import { useEffect, useState } from "react";

interface Props {
  urls: string[];
  isVideo?: boolean;
  caption?: string;
  onClose: () => void;
}

export default function MediaModal({ urls, isVideo, caption, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0)
        setCurrentIndex((i) => i - 1);
      if (e.key === "ArrowRight" && currentIndex < urls.length - 1)
        setCurrentIndex((i) => i + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, currentIndex, urls.length]);

  const currentUrl = urls[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm"
        >
          ESC to close
        </button>

        {/* Media */}
        <div className="rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center min-h-[200px]">
          {isVideo ? (
            <video
              key={currentUrl}
              src={currentUrl}
              controls
              autoPlay
              className="w-full max-h-[80vh] object-contain"
            />
          ) : (
            <img
              src={currentUrl}
              alt=""
              className="w-full max-h-[80vh] object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                // If the image fails and it's not already proxied, try proxying it
                if (!target.src.includes("/api/proxy-image")) {
                  target.src = `/api/proxy-image?url=${encodeURIComponent(currentUrl)}`;
                }
              }}
            />
          )}
        </div>

        {/* Carousel navigation */}
        {urls.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="text-white/70 hover:text-white disabled:text-white/20 text-lg"
            >
              &larr;
            </button>
            <span className="text-white/50 text-sm">
              {currentIndex + 1} / {urls.length}
            </span>
            <button
              onClick={() =>
                setCurrentIndex((i) => Math.min(urls.length - 1, i + 1))
              }
              disabled={currentIndex === urls.length - 1}
              className="text-white/70 hover:text-white disabled:text-white/20 text-lg"
            >
              &rarr;
            </button>
          </div>
        )}

        {/* Caption */}
        {caption && (
          <p className="text-zinc-400 text-sm mt-3 text-center line-clamp-3">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}
