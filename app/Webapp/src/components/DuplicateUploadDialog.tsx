"use client";

/**
 * Confirmation popup shown when the coordinator uploads a transcript whose
 * de-identified filename was already processed into the DB.
 *
 * Why it exists: the pipeline watcher dedupes drop-folder files by path in an
 * in-memory set, so a duplicate drop is skipped silently — no log, no error, the
 * file just sits in the folder looking queued. Surfacing it here turns that silent
 * no-op into an explicit choice. Re-processing stays allowed (it is legitimate
 * after the DB has been cleared); the dialog only makes sure it is deliberate.
 */

interface DuplicateItem {
  name: string;
  message?: string;
}

interface Props {
  open: boolean;
  duplicates: DuplicateItem[];
  onCancel: () => void;
  onSkipDuplicates: () => void;
  onReprocess: () => void;
}

export default function DuplicateUploadDialog({
  open,
  duplicates,
  onCancel,
  onSkipDuplicates,
  onReprocess,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dup-title" className="text-lg font-bold text-slate-900">
          Already processed
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {duplicates.length === 1
            ? "This transcript has already been processed."
            : `${duplicates.length} of these transcripts have already been processed.`}{" "}
          Uploading again re-runs the full pipeline and adds another analysis.
        </p>

        <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto">
          {duplicates.map((d) => (
            <li key={d.name} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="truncate text-xs font-medium text-slate-800">{d.name}</p>
              {d.message && <p className="mt-0.5 text-xs text-amber-800">{d.message}</p>}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSkipDuplicates}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Skip duplicates
          </button>
          <button
            type="button"
            onClick={onReprocess}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Upload anyway
          </button>
        </div>
      </div>
    </div>
  );
}
