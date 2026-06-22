import type { DocType } from "@prisma/client";
import { docMeta } from "@/lib/docTypes";

export function DocTypeBadge({ type }: { type: DocType }) {
  const m = docMeta(type);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-muted">
      <span>{m.emoji}</span>
      {m.short}
    </span>
  );
}
