"use client";

/**
 * Admin transcript upload — drag & drop a transcript so the pipeline watch picks
 * it up, instead of SFTP-through-a-jump-server. Only files already de-identified by
 * the Secure Transcript Preparation app are accepted; a raw study-id file is rejected
 * by the backend (de-id happens in the app, not on the server). Access is gated by
 * src/middleware.ts (admin_session cookie); the backend re-checks admin on
 * POST /api/admin/upload-transcript.
 *
 * Duplicate warning: a name that was already processed into the DB is flagged up
 * front via GET /api/admin/upload-precheck, and uploading it needs an explicit
 * confirmation. Without that warning a duplicate is a silent no-op — the pipeline
 * watcher dedupes drop-folder files by path in an in-memory set, so it skips the
 * file with no log line and no error and the file just sits in the folder.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import DuplicateUploadDialog from "@/components/DuplicateUploadDialog";
import usePipelineGate from "@/hooks/usePipelineGate";

// Fast client-side checks. Extension gate, plus a "does this look de-identified"
// gate so a raw transcript is flagged with the reason up front instead of a neutral
// "pending" that the backend would only reject on upload. Mirrors the backend's
// _DEID_NAME_RX (routes_admin_upload.py): the app's output name is
// <hashedPatient>[_<hashedDoctor>]_<hashedDate>.csv — every segment is a de-id
// token now (the visit date is hashed too), so require 2-3 alphanumeric segments.
const ALLOWED_EXT = /\.(csv|xlsx|xls)$/i;
const DEID_NAME_RX = /^[A-Z0-9]+_[A-Z0-9]+(_[A-Z0-9]+)?\.(csv|xlsx)$/i;

type Status =
  | "pending"
  | "invalid"
  | "rejected"
  | "duplicate"
  | "uploading"
  | "done"
  | "error";

interface Item {
  // `uid` is a stable client-side key: the async precheck patches an item after the
  // list may already have grown, so a list index would point at the wrong row.
  uid: number;
  // Always present. `file` is only set for a freshly-picked file this session; items
  // rebuilt from the server's upload log on refresh have a name but no File object
  // (the browser cannot restore a File), and are already "done"/"error" so they are
  // never re-uploaded.
  name: string;
  file?: File;
  status: Status;
  message?: string;
}

interface UploadLogRow {
  queued?: string;
  status?: string;
  message?: string;
}

interface PrecheckResult {
  duplicate: boolean;
  analysis_id?: number;
  analyzed_at?: string | null;
}

// Statuses the Upload button acts on. "duplicate" is included on purpose — it is a
// warning, not a block, and re-processing is legitimate (e.g. after a DB reset).
const UPLOADABLE: Status[] = ["pending", "error", "duplicate"];

/** "45s" / "3 min" — how long a transcript has been sitting in the drop folder. */
function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

export default function AdminUploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The pipeline handles one transcript at a time; uploading mid-run would queue
  // behind it invisibly. `stale` means the queue is stuck, not working — uploading
  // is re-enabled then so a file the watcher cannot process never locks the page.
  const gate = usePipelineGate();
  const gateLocked = gate.busy && !gate.stale;
  const inputRef = useRef<HTMLInputElement>(null);
  const uidRef = useRef(0);
  const nextUid = () => ++uidRef.current;

  // On load, rebuild the list from the server's upload history so a refresh does not
  // wipe it. These carry only the de-identified queued name (no real study id).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/upload-log")
      .then((r) => (r.ok ? r.json() : { uploads: [] }))
      .then((data: { uploads?: UploadLogRow[] }) => {
        if (cancelled) return;
        const history: Item[] = (data.uploads || []).map((u) => ({
          uid: nextUid(),
          name: u.queued || "(unknown)",
          status: u.status === "error" ? "error" : "done",
          message: u.message || (u.status === "error" ? "Upload failed." : "Queued for processing."),
        }));
        setItems((prev) => [...history, ...prev]);
      })
      .catch(() => { /* history is best-effort */ });
    return () => { cancelled = true; };
  }, []);

  const setByUid = (uid: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));

  // Ask the backend whether this de-identified name already has results in the DB.
  // Best-effort: a failed precheck leaves the item "pending" so the upload still
  // works — the warning is a convenience, not a gate.
  const precheck = useCallback((uid: number, name: string) => {
    fetch(`/api/backend/admin/upload-precheck?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PrecheckResult | null) => {
        if (!d?.duplicate) return;
        const when = d.analyzed_at ? new Date(d.analyzed_at).toLocaleString() : "earlier";
        setByUid(uid, {
          status: "duplicate",
          message:
            `Already processed ${when}` +
            (d.analysis_id ? ` (analysis #${d.analysis_id})` : "") +
            ". Uploading again re-runs the pipeline.",
        });
      })
      .catch(() => { /* precheck is best-effort */ });
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: Item[] = Array.from(files).map((file) => {
      if (!ALLOWED_EXT.test(file.name)) {
        return {
          uid: nextUid(),
          name: file.name,
          file,
          status: "invalid" as Status,
          message: "Unsupported file type — use .csv, .xlsx, or .xls.",
        };
      }
      // A correct file has the app's de-identified name. Anything else is a raw
      // transcript (or the mapping CSV) — flag it now with the reason instead of a
      // neutral "pending" that only fails when the server rejects it on upload.
      if (!DEID_NAME_RX.test(file.name)) {
        return {
          uid: nextUid(),
          name: file.name,
          file,
          status: "rejected" as Status,
          message:
            "Not de-identified. Prepare it with the Secure Transcript Preparation " +
            "app first, then upload the file from its ready_to_upload folder.",
        };
      }
      return { uid: nextUid(), name: file.name, file, status: "pending" as Status };
    });
    setItems((prev) => [...prev, ...next]);
    next.forEach((it) => {
      if (it.status === "pending") precheck(it.uid, it.name);
    });
  }, [precheck]);

  const uploadAll = async (includeDuplicates: boolean) => {
    setBusy(true);
    const snapshot = items;
    for (const it of snapshot) {
      // Skip already-done, client-rejected (raw / wrong type), and any history item
      // rebuilt without a File (browsers can't restore a File — not re-uploadable).
      if (!UPLOADABLE.includes(it.status) || !it.file) continue;
      if (it.status === "duplicate" && !includeDuplicates) continue;
      setByUid(it.uid, { status: "uploading", message: undefined });
      try {
        const fd = new FormData();
        fd.append("file", it.file, it.file.name);
        const res = await fetch("/api/admin/upload-transcript", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const message = `Queued for processing: ${data.queued}${data.replaced ? " (replaced existing)" : ""}`;
          setByUid(it.uid, { status: "done", message });
        } else {
          setByUid(it.uid, { status: "error", message: data.detail || `Upload failed (${res.status}).` });
        }
      } catch {
        setByUid(it.uid, { status: "error", message: "Network error — is the backend reachable?" });
      }
    }
    setBusy(false);
  };

  const duplicates = items.filter((it) => it.status === "duplicate" && it.file);

  // Warn before sending a name the pipeline has already processed; otherwise upload
  // straight away.
  const onUploadClick = () => {
    if (gateLocked) return;
    if (duplicates.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void uploadAll(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const badge: Record<Status, string> = {
    pending: "bg-slate-100 text-slate-600",
    invalid: "bg-amber-100 text-amber-700",
    rejected: "bg-rose-100 text-rose-700",
    duplicate: "bg-amber-100 text-amber-800",
    uploading: "bg-blue-100 text-blue-700",
    done: "bg-emerald-100 text-emerald-700",
    error: "bg-rose-100 text-rose-700",
  };
  const hasUploadable = items.some((it) => UPLOADABLE.includes(it.status) && it.file);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Upload Transcript</h1>

      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <span aria-hidden>⚠️</span>
          Upload only files already de-identified by the Secure Transcript Preparation app.
        </p>
      </div>

      {gate.busy && (
        <div
          role="status"
          className={`mt-3 rounded-xl border p-4 ${
            gate.stale
              ? "border-rose-300 bg-rose-50"
              : "border-blue-300 bg-blue-50"
          }`}
        >
          <p className={`text-sm font-semibold ${gate.stale ? "text-rose-900" : "text-blue-900"}`}>
            <span aria-hidden>{gate.stale ? "⚠️" : "⏳"}</span>{" "}
            {gate.stale ? (
              <>
                {gate.queued[0]} has been waiting {formatWait(gate.waitingSeconds)} — the
                pipeline watch may be down. Upload is re-enabled, but check the watcher
                before adding more.
              </>
            ) : (
              <>
                Pipeline is processing {gate.queued[0]}
                {gate.queued.length > 1 && ` (+${gate.queued.length - 1} more queued)`} —
                upload is disabled until it finishes.
              </>
            )}
          </p>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-14 cursor-pointer transition-colors ${
          dragging ? "border-violet-500 bg-violet-50" : "border-slate-300 hover:border-slate-400 bg-white"
        }`}
      >
        <p className="text-sm font-semibold text-slate-700">Drop files here, or click to choose</p>
        <p className="text-xs text-slate-400">.csv, .xlsx, or .xls · up to 25 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <ul className="mt-6 space-y-2">
            {items.map((it) => (
              <li
                key={it.uid}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{it.name}</p>
                  {it.message && <p className="mt-0.5 text-xs text-slate-500">{it.message}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge[it.status]}`}>
                  {it.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy || !hasUploadable || gateLocked}
              onClick={onUploadClick}
              title={gateLocked ? "The pipeline is still processing a transcript." : undefined}
              className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? "Uploading…" : gateLocked ? "Pipeline busy…" : "Upload"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setItems([])}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </>
      )}

      <DuplicateUploadDialog
        open={confirmOpen}
        duplicates={duplicates.map((d) => ({ name: d.name, message: d.message }))}
        onCancel={() => setConfirmOpen(false)}
        onSkipDuplicates={() => {
          setConfirmOpen(false);
          void uploadAll(false);
        }}
        onReprocess={() => {
          setConfirmOpen(false);
          void uploadAll(true);
        }}
      />
    </main>
  );
}
