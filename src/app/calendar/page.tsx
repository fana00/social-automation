"use client";

import { useEffect, useState, useMemo } from "react";
import StatusBadge from "@/components/StatusBadge";
import type { CalendarEntry } from "@/types";

// Convert Cloudinary video URL to a JPG thumbnail using their on-the-fly transformation
function thumbUrl(url: string): string {
  if (!url) return url;
  if (url.includes("/video/upload/") && url.match(/\.(mp4|mov|webm)$/i)) {
    return url
      .replace("/video/upload/", "/video/upload/f_jpg,so_0/")
      .replace(/\.(mp4|mov|webm)$/i, ".jpg");
  }
  return url;
}

export default function CalendarPage() {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    fetch("/api/sheets/calendar")
      .then((res) => res.json())
      .then((data) => {
        const all = data.entries || [];
        setEntries(all.filter((e: CalendarEntry) => e.status === "scheduled" || e.status === "published"));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const calendarDays = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [viewMonth]);

  function getEntriesForDay(day: number): CalendarEntry[] {
    const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return entries.filter((e) => e.date === dateStr);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function prevMonth() {
    setViewMonth((v) => {
      if (v.month === 0) return { year: v.year - 1, month: 11 };
      return { ...v, month: v.month - 1 };
    });
  }

  function nextMonth() {
    setViewMonth((v) => {
      if (v.month === 11) return { year: v.year + 1, month: 0 };
      return { ...v, month: v.month + 1 };
    });
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-zinc-500">Loading calendar...</div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-zinc-500">
          Showing scheduled &amp; published posts
        </p>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="text-zinc-400 hover:text-white px-3 py-1 rounded transition-colors"
        >
          &lt; Prev
        </button>
        <h2 className="text-lg font-medium">
          {monthNames[viewMonth.month]} {viewMonth.year}
        </h2>
        <button
          onClick={nextMonth}
          className="text-zinc-400 hover:text-white px-3 py-1 rounded transition-colors"
        >
          Next &gt;
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 border border-zinc-800 rounded-lg overflow-hidden">
        {/* Day Headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="bg-zinc-900 text-center text-xs text-zinc-500 py-2 border-b border-zinc-800"
          >
            {day}
          </div>
        ))}

        {/* Day Cells */}
        {calendarDays.map((day, i) => {
          const dayEntries = day ? getEntriesForDay(day) : [];
          return (
            <div
              key={i}
              className="min-h-[100px] border-b border-r border-zinc-800 p-1 bg-zinc-950"
            >
              {day && (
                <>
                  <span className="text-xs text-zinc-500">{day}</span>
                  <div className="space-y-1 mt-1">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.rowId}
                        className="flex items-center gap-1 bg-zinc-900 rounded p-1"
                      >
                        {entry.mediaUrls[0] && (
                          <img
                            src={thumbUrl(entry.mediaUrls[0])}
                            alt=""
                            className="w-6 h-6 rounded object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-zinc-400 truncate">
                            {entry.persona}
                          </p>
                          <StatusBadge status={entry.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Entries List */}
      {entries.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            All Entries ({entries.length})
          </h3>
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.rowId}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
              >
                {entry.mediaUrls[0] && (
                  <img
                    src={thumbUrl(entry.mediaUrls[0])}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-white">{entry.date}</span>
                    <span className="text-xs text-zinc-500">
                      {entry.platform}
                    </span>
                    <StatusBadge status={entry.status} />
                    {entry.mediaUrls.length > 1 && (
                      <span className="text-xs text-zinc-500">
                        {entry.mediaUrls.length} images
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 truncate">
                    {entry.caption || "(no caption)"}
                  </p>
                </div>
                <span className="text-xs text-zinc-600 shrink-0">
                  {entry.persona}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
