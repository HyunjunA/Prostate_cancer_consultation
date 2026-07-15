"use client";

/**
 * Admin transcript upload — drag & drop a transcript so the pipeline watch picks
 * it up, instead of SFTP-through-a-jump-server. A RAW study-id file (SID/DLC …) is
 * de-identified on the server; an already-hashed file is stored as-is. Access is
 * gated by src/middleware.ts (admin_session cookie); the backend re-checks admin
 * on POST /api/admin/upload-transcript.
 */

import { useCallback, useRef, useState } from "react";

// Accept transcript files by type only. Raw study-id files (SID/DLC …) are
// de-identified on the server; already-hashed files are stored as-is. The server
// makes the final decision — this is just a fast client-side type check.
const ALLOWED_EXT = /\.(csv|xlsx|xls)$/i;

type Status = "pending" | "invalid" | "uploading" | "done" | "error";
interface Item {
  file: File;
  status: Status;
  message?: string;
}

export default function AdminUploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: Item[] = Array.from(files).map((file) =>
      ALLOWED_EXT.test(file.name)
        ? { file, status: "pending" }
        : {
            file,
            status: "invalid",
            message: "Unsupported file type — use .csv, .xlsx, or .xls.",
          },
    );
    setItems((prev) => [...prev, ...next]);
  }, []);

  const setAt = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const uploadAll = async () => {
    setBusy(true);
    const snapshot = items;
    for (let i = 0; i < snapshot.length; i++) {
      const it = snapshot[i];
      if (it.status === "done" || it.status === "invalid") continue;
      setAt(i, { status: "uploading", message: undefined });
      try {
        const fd = new FormData();
        fd.append("file", it.file, it.file.name);
        const res = await fetch("/api/admin/upload-transcript", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const message = data.deidentified
            ? `De-identified & queued: ${data.queued}` +
              (data.mapping?.real_sid
                ? ` (${data.mapping.real_sid} → ${data.mapping.hashed_patient})`
                : "")
            : `Queued for processing: ${data.queued}${data.replaced ? " (replaced existing)" : ""}`;
          setAt(i, { status: "done", message });
        } else {
          setAt(i, { status: "error", message: data.detail || `Upload failed (${res.status}).` });
        }
      } catch {
        setAt(i, { status: "error", message: "Network error — is the backend reachable?" });
      }
    }
    setBusy(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const badge: Record<Status, string> = {
    pending: "bg-slate-100 text-slate-600",
    invalid: "bg-amber-100 text-amber-700",
    uploading: "bg-blue-100 text-blue-700",
    done: "bg-emerald-100 text-emerald-700",
    error: "bg-rose-100 text-rose-700",
  };
  const hasUploadable = items.some((it) => it.status === "pending" || it.status === "error");

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Upload Transcript</h1>
      <p className="mt-2 text-sm text-slate-500">
        Drag &amp; drop a transcript. A raw file (e.g.{" "}
        <code className="px-1 rounded bg-slate-100">SID 22_doc2.xlsx</code>) is
        de-identified <strong>on the server</strong> and processed automatically — no SFTP
        needed. An already de-identified file (e.g.{" "}
        <code className="px-1 rounded bg-slate-100">13511_13571_07142026.csv</code>) is stored
        as-is. Do not upload the mapping CSV. The real&rarr;hash mapping is shown below after a
        raw upload — keep it on the clinical side.
      </p>

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
            {items.map((it, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{it.file.name}</p>
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
              disabled={busy || !hasUploadable}
              onClick={uploadAll}
              className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? "Uploading…" : "Upload"}
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
    </main>
  );
}
