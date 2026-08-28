"use client";

/**
 * The file list on /admin/upload — one row per transcript with where it actually is
 * in the pipeline.
 *
 * Split out of the page because the page was already past the ~150-line limit, but
 * also because the list is the part that was wrong: it used to collapse every server
 * row to a green "done", so a transcript that was mid-run, one that had finished, and
 * one the watcher had never picked up all rendered identically. A run takes 3-12
 * minutes, and a static badge over that span reads as "nothing is happening".
 */

/** Where a file is. The first five are client-side; the rest come from the server. */
export type Status =
  | "pending"
  | "invalid"
  | "rejected"
  | "duplicate"
  | "uploading"
  | "queued"
  | "processing"
  | "analyzed"
  | "error";

export interface Item {
  // `uid` is a stable client-side key: the async precheck patches an item after the
  // list may already have grown, so a list index would point at the wrong row.
  uid: number;
  // Always present. `file` is only set for a freshly-picked file this session; items
  // rebuilt from the server's upload log on refresh have a name but no File object
  // (the browser cannot restore a File) and are never re-uploaded from that row.
  name: string;
  file?: File;
  status: Status;
  message?: string;
  // Seconds since the upload — running while processing, final once analyzed.
  elapsedSeconds?: number;
}

const BADGE: Record<Status, string> = {
  pending: "bg-slate-100 text-slate-600",
  invalid: "bg-amber-100 text-amber-700",
  rejected: "bg-rose-100 text-rose-700",
  duplicate: "bg-amber-100 text-amber-800",
  uploading: "bg-blue-100 text-blue-700",
  queued: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-700 animate-pulse",
  analyzed: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

/** Statuses whose row is waiting on the pipeline, so the page keeps polling. */
export const LIVE: Status[] = ["uploading", "queued", "processing"];

/** "45s" / "3 min" — how long a transcript has been sitting in the drop folder. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * Link to the finished report, or null.
 *
 * The main page reconstructs the filename from `?f=` as `<stem>.csv`, so a stem from
 * an .xlsx upload would resolve to a file that does not exist — only link .csv rows.
 */
function reportHref(name: string): string | null {
  if (!/\.csv$/i.test(name)) return null;
  return `/?f=${encodeURIComponent(name.replace(/\.csv$/i, ""))}&view=first-report`;
}

interface Props {
  items: Item[];
}

export default function AdminUploadQueue({ items }: Props) {
  return (
    <ul className="mt-6 space-y-2">
      {items.map((it) => {
        const href = it.status === "analyzed" ? reportHref(it.name) : null;
        return (
          <li
            key={it.uid}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{it.name}</p>
              {it.message && <p className="mt-0.5 text-xs text-slate-500">{it.message}</p>}
              {href && (
                <a
                  href={href}
                  className="mt-0.5 inline-block text-xs font-semibold text-violet-600 hover:underline"
                >
                  View report →
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {it.elapsedSeconds !== undefined && it.status !== "pending" && (
                <span className="text-xs tabular-nums text-slate-400">
                  {formatWait(it.elapsedSeconds)}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[it.status]}`}
              >
                {it.status}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
