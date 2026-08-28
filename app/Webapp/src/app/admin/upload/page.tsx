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
 *
 * Progress: a run takes 3-12 minutes (measured), so the page polls
 * GET /api/admin/upload-log every 5s while anything is in flight and renders the
 * state the backend DERIVES for each file. It used to show a green "done" the
 * instant the POST returned and again on every refresh, which made a run that had
 * not started yet indistinguishable from one that had finished — and from the
 * upload silently failing, which is how this was reported.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminUploadQueue, {
  formatWait,
  Item,
  LIVE,
  Status,
} from "@/components/AdminUploadQueue";
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

interface UploadLogRow {
  queued?: string;
  status?: string;
  state?: string;
  message?: string;
  elapsed_seconds?: number | null;
}

interface PrecheckResult {
  duplicate: boolean;
  analysis_id?: number;
  analyzed_at?: string | null;
}

// Statuses the Upload button acts on. "duplicate" is included on purpose — it is a
// warning, not a block, and re-processing is legitimate (e.g. after a DB reset).
const UPLOADABLE: Status[] = ["pending", "error", "duplicate"];

// Statuses that describe the file the user just picked, not a past run. The poll
// must not overwrite these: a re-upload of an already-processed name would otherwise
// be relabelled "analyzed" from the PREVIOUS run before it has even been sent.
const LOCAL_ONLY: Status[] = ["pending", "invalid", "rejected", "duplicate", "uploading"];

const POLL_MS = 5000;

/** What the row's derived server state means for the badge and the caption. */
function fromLogRow(r: UploadLogRow): Pick<Item, "status" | "message" | "elapsedSeconds"> {
  // Fall back to "queued", never "done": an older backend without `state` knows only
  // that the file was accepted, which is exactly what "queued" says.
  const state = r.state ?? (r.status === "error" ? "error" : "queued");
  const elapsedSeconds = r.elapsed_seconds ?? undefined;
  if (state === "error") {
    return { status: "error", message: r.message || "Upload failed.", elapsedSeconds };
  }
  if (state === "analyzed") {
    return { status: "analyzed", message: "Analysis complete.", elapsedSeconds };
  }
  if (state === "processing") {
    return {
      status: "processing",
      message: "The pipeline is working on this file — a run takes about 3-12 minutes.",
      elapsedSeconds,
    };
  }
  return {
    status: "queued",
    message: "Waiting for the pipeline watcher to pick it up.",
    elapsedSeconds,
  };
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

  // Rebuild the list from the server's upload history — on load so a refresh does not
  // wipe it, and on a timer so a running file visibly advances. These carry only the
  // de-identified queued name (no real study id).
  const refreshLog = useCallback(
    () =>
      fetch("/api/admin/upload-log")
        .then((r) => (r.ok ? r.json() : { uploads: [] }))
        .then((data: { uploads?: UploadLogRow[] }) => {
          const rows = (data.uploads || []).filter((r) => r.queued);
          setItems((prev) => {
            // Newest row wins per name — the server orders newest first, so the first
            // occurrence of a name is its latest run.
            const latest = new Map<string, UploadLogRow>();
            for (const r of rows) {
              if (!latest.has(r.queued as string)) latest.set(r.queued as string, r);
            }
            const matched = new Set<string>();
            const updated = prev.map((it) => {
              const r = latest.get(it.name);
              if (!r) return it;
              matched.add(it.name);
              return LOCAL_ONLY.includes(it.status) ? it : { ...it, ...fromLogRow(r) };
            });
            const fresh: Item[] = [];
            for (const [name, r] of latest) {
              if (matched.has(name)) continue;
              fresh.push({ uid: nextUid(), name, ...fromLogRow(r) });
            }
            return [...fresh, ...updated];
          });
        })
        .catch(() => {
          /* history is best-effort */
        }),
    []
  );

  useEffect(() => {
    void refreshLog();
  }, [refreshLog]);

  // Poll only while something is actually in flight, and stop once it lands — an
  // idle admin page should not hit the API forever.
  const hasLive = items.some((it) => LIVE.includes(it.status));
  useEffect(() => {
    if (!hasLive) return;
    const timer = window.setInterval(() => void refreshLog(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasLive, refreshLog]);

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
      // Skip already-sent, client-rejected (raw / wrong type), and any history item
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
          // Accepted into the drop folder — the run has NOT happened yet. Calling
          // this "done" was the original defect; the poll advances it from here.
          setByUid(it.uid, {
            status: "queued",
            name: data.queued || it.name,
            message:
              `Queued for processing${data.replaced ? " (replaced existing)" : ""} — ` +
              "a run takes about 3-12 minutes.",
            elapsedSeconds: 0,
          });
        } else {
          setByUid(it.uid, { status: "error", message: data.detail || `Upload failed (${res.status}).` });
        }
      } catch {
        setByUid(it.uid, { status: "error", message: "Network error — is the backend reachable?" });
      }
    }
    setBusy(false);
    void refreshLog();
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

  const hasUploadable = items.some((it) => UPLOADABLE.includes(it.status) && it.file);

  // Why the button is dead. It used to disable on `!hasUploadable` while still
  // reading "Upload" with no tooltip and nothing on the page, so a coordinator whose
  // files were all rejected saw a button that simply did nothing when clicked.
  const disabledReason = useMemo(() => {
    if (busy) return null;
    if (gateLocked) return "The pipeline is still processing a transcript.";
    if (hasUploadable) return null;
    const blocked = items.filter(
      (it) => it.file && (it.status === "invalid" || it.status === "rejected")
    ).length;
    if (blocked > 0) {
      return `${blocked} selected file${blocked > 1 ? "s were" : " was"} not accepted — ` +
        "see the reason on each row, then add a corrected file.";
    }
    return "Nothing to upload — add a de-identified transcript.";
  }, [busy, gateLocked, hasUploadable, items]);

  const buttonLabel = busy
    ? "Uploading…"
    : gateLocked
    ? "Pipeline busy…"
    : hasUploadable
    ? "Upload"
    : "Nothing to upload";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Upload Transcript</h1>

      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <span aria-hidden>⚠️</span>
          Upload only files already de-identified by the Secure Transcript Preparation app.
        </p>
      </div>

      {!gate.reachable && (
        <div role="status" className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-700">
            <span aria-hidden>❔</span> Pipeline status unavailable — the state below may
            be out of date. Uploading still works.
          </p>
        </div>
      )}

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
                Processing {gate.queued[0]}
                {gate.queued.length > 1 && ` (+${gate.queued.length - 1} more queued)`} —{" "}
                {formatWait(gate.waitingSeconds)} elapsed, typically 3-12 minutes. Upload
                is disabled until it finishes.
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
        {/* The chooser applies the input's `accept` filter; a drop does not. If the
            file is greyed out or missing in the chooser, dragging it in still works. */}
        <p className="text-xs text-slate-400">
          File not listed in the chooser? Drag it onto this box instead.
        </p>
      </div>

      {/* Outside the drop zone on purpose: nested, the programmatic .click() bubbles
          back into the zone's own onClick and re-enters the handler. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <>
          <AdminUploadQueue items={items} />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy || !hasUploadable || gateLocked}
              onClick={onUploadClick}
              title={disabledReason ?? undefined}
              className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {buttonLabel}
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
          {disabledReason && (
            <p className="mt-2 text-xs text-slate-500">{disabledReason}</p>
          )}
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
