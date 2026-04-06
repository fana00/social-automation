"use client";

import { useEffect, useState } from "react";
import type { IGSource } from "@/types";

interface Props {
  personaId: string;
  value: string;
  onChange: (sourceUrl: string) => void;
}

export default function SourceSelector({ personaId, value, onChange }: Props) {
  const [sources, setSources] = useState<IGSource[]>([]);

  useEffect(() => {
    if (!personaId) return;
    // Read from IG Sources tab (single source of truth)
    fetch(`/api/ig-sources?personaId=${personaId}`)
      .then((res) => res.json())
      .then((data) => setSources(data.sources || []))
      .catch(console.error);
  }, [personaId]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
    >
      <option value="auto">Auto-rotate</option>
      {sources.map((s) => (
        <option key={s.profileUrl} value={s.profileUrl}>
          {s.profileUrl.replace("https://www.instagram.com/", "@").replace("/", "")}
        </option>
      ))}
    </select>
  );
}
