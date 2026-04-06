"use client";

import { useEffect, useState } from "react";
import type { Persona } from "@/types";

interface Props {
  value: string;
  onChange: (personaId: string) => void;
}

export default function PersonaSelector({ value, onChange }: Props) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => {
        setPersonas(data.personas || []);
        if (!value && data.personas?.length > 0) {
          onChange(data.personas[0].personaId);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select disabled className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400">
        <option>Loading personas...</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
    >
      {personas.map((p) => (
        <option key={p.personaId} value={p.personaId}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
