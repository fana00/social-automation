import type { ContentStatus, QCStatus } from "@/types";

const statusStyles: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  generating: "bg-yellow-900 text-yellow-300",
  ready: "bg-green-900 text-green-300",
  scheduled: "bg-blue-900 text-blue-300",
  published: "bg-purple-900 text-purple-300",
  failed: "bg-red-900 text-red-300",
  pending: "bg-zinc-700 text-zinc-300",
  passed: "bg-green-900 text-green-300",
  "failed-retry": "bg-yellow-900 text-yellow-300",
  "failed-flagged": "bg-red-900 text-red-300",
  rejected: "bg-red-900 text-red-300",
};

export default function StatusBadge({
  status,
}: {
  status: ContentStatus | QCStatus | string;
}) {
  const style = statusStyles[status] || "bg-zinc-700 text-zinc-300";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
