"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";

interface Props {
  imageUrl: string;
  caption?: string;
  hashtags?: string;
  persona?: string;
  status?: string;
  isVideo?: boolean;
  onSchedule?: (caption: string, hashtags: string) => void;
  onConvertToVideo?: () => void;
  onClickPreview?: () => void;
  onReject?: () => void;
  calendarStatus?: string;
  onSaveCaption?: (caption: string, hashtags: string) => void;
  onRegenerate?: () => void;
}

export default function ImagePreview({
  imageUrl,
  caption = "",
  hashtags = "",
  persona,
  status,
  isVideo = false,
  onSchedule,
  onConvertToVideo,
  onClickPreview,
  onReject,
  calendarStatus,
  onSaveCaption,
  onRegenerate,
}: Props) {
  const [editedCaption, setEditedCaption] = useState(caption);
  const [editedHashtags, setEditedHashtags] = useState(hashtags);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden group">
      <div
        className="relative cursor-pointer"
        onClick={onClickPreview}
      >
        {isVideo ? (
          <video
            src={imageUrl}
            className="w-full aspect-[9/16] object-cover"
            muted
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <img
            src={imageUrl}
            alt="Generated content"
            className="w-full aspect-square object-cover"
          />
        )}
        {/* Status badge - top left */}
        <div className="absolute top-2 left-2 flex gap-1">
          {calendarStatus && <StatusBadge status={calendarStatus} />}
          {isVideo && (
            <span className="bg-zinc-900/80 text-xs px-2 py-0.5 rounded text-zinc-300">
              video
            </span>
          )}
        </div>
        {/* Persona - top right */}
        <div className="absolute top-2 right-2 flex gap-1">
          {persona && (
            <span className="bg-zinc-900/80 text-xs px-2 py-0.5 rounded text-zinc-300">
              {persona}
            </span>
          )}
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 text-white text-sm bg-black/50 px-3 py-1 rounded transition-opacity">
            Click to preview
          </span>
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
              placeholder="Hashtags"
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
          <>
            <p
              className="text-sm text-zinc-300 line-clamp-3 cursor-pointer hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title="Click to edit"
            >
              {editedCaption || "Click to add caption"}
            </p>
            {editedHashtags && (
              <p className="text-xs text-zinc-500 line-clamp-1">
                {editedHashtags}
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
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
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Redo
            </button>
          )}
          {onConvertToVideo && (
            <button
              onClick={onConvertToVideo}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Video
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
