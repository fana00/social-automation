"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";

interface Props {
  images: string[];
  caption?: string;
  hashtags?: string;
  persona?: string;
  calendarStatus?: string;
  onSchedule?: (caption: string, hashtags: string) => void;
  onClickPreview?: () => void;
  onReject?: () => void;
  onSaveCaption?: (caption: string, hashtags: string) => void;
}

export default function CarouselPreview({
  images,
  caption = "",
  hashtags = "",
  persona,
  calendarStatus,
  onSchedule,
  onClickPreview,
  onReject,
  onSaveCaption,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedCaption, setEditedCaption] = useState(caption);
  const [editedHashtags, setEditedHashtags] = useState(hashtags);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden group">
      <div className="relative cursor-pointer" onClick={onClickPreview}>
        <img
          src={images[currentIndex]}
          alt={`Carousel ${currentIndex + 1}`}
          className="w-full aspect-square object-cover"
        />

        {/* Navigation dots */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>

        {/* Arrows */}
        {currentIndex > 0 && (
          <button
            onClick={() => setCurrentIndex((i) => i - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
          >
            &lt;
          </button>
        )}
        {currentIndex < images.length - 1 && (
          <button
            onClick={() => setCurrentIndex((i) => i + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
          >
            &gt;
          </button>
        )}

        {/* Status badge - top left */}
        <div className="absolute top-2 left-2 flex gap-1">
          {calendarStatus && <StatusBadge status={calendarStatus} />}
        </div>
        {/* Info - top right */}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className="bg-zinc-900/80 text-xs px-2 py-0.5 rounded text-zinc-300">
            {images.length} images
          </span>
          {persona && (
            <span className="bg-zinc-900/80 text-xs px-2 py-0.5 rounded text-zinc-300">
              {persona}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2">
        {isEditing ? (
          <>
            <textarea
              value={editedCaption}
              onChange={(e) => setEditedCaption(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white resize-none"
              rows={3}
            />
            <input
              value={editedHashtags}
              onChange={(e) => setEditedHashtags(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-400"
            />
            <button
              onClick={() => {
                setIsEditing(false);
                onSaveCaption?.(editedCaption, editedHashtags);
              }}
              className="text-xs text-green-400 hover:text-green-300"
            >
              Save
            </button>
          </>
        ) : (
          <p
            className="text-sm text-zinc-300 line-clamp-3 cursor-pointer hover:text-white"
            onClick={() => setIsEditing(true)}
            title="Click to edit"
          >
            {editedCaption || "Click to add caption"}
          </p>
        )}

        <div className="flex gap-2">
          {onSchedule && (
            <button
              onClick={() => onSchedule(editedCaption, editedHashtags)}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded transition-colors"
            >
              Schedule
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="bg-red-900/50 hover:bg-red-800 text-red-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
