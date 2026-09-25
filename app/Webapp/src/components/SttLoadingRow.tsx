"use client";

import React from "react";

import {
  STT_ASSET_LABELS,
  type SttAssetId,
  type SttAssetProgress,
} from "@/lib/sttConstants";

interface Props {
  id: SttAssetId;
  /** Absent until the worker has started on this one. */
  asset: SttAssetProgress | undefined;
  isDarkMode: boolean;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** `48.0 / 81.0 MB` while running, just the size once there is nothing to wait for. */
function sizeLabel(asset: SttAssetProgress | undefined): string {
  if (!asset) return "waiting";
  if (asset.id === "warmup") return asset.done ? "done" : "a few seconds";
  if (!asset.total) return asset.done ? "done" : "starting";
  if (asset.done) return mb(asset.total);
  return `${mb(asset.loaded)} / ${mb(asset.total)}`;
}

/**
 * One line of SttLoadingModal: what is being fetched, how far along it is, and
 * how big it is. Each row owns its own percentage — see SttAssetId in
 * sttConstants.ts for why these are not summed into one bar.
 */
const SttLoadingRow: React.FC<Props> = ({ id, asset, isDarkMode }) => {
  const started = asset != null;
  // The warm-up compiles shaders and has no byte count, so it gets an
  // indeterminate stripe rather than a bar that would have to invent a number.
  const indeterminate = id === "warmup" && started && !asset.done;
  const percent = asset?.done
    ? 100
    : asset && asset.total > 0
      ? Math.min(100, (asset.loaded / asset.total) * 100)
      : 0;

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span
          className={cx(
            "font-medium",
            started
              ? isDarkMode
                ? "text-slate-200"
                : "text-slate-700"
              : isDarkMode
                ? "text-slate-500"
                : "text-slate-400",
          )}
        >
          {asset?.done ? "✓ " : started ? "⟳ " : "· "}
          {STT_ASSET_LABELS[id]}
        </span>
        <span
          className={cx(
            "tabular-nums text-xs",
            isDarkMode ? "text-slate-400" : "text-slate-500",
          )}
        >
          {sizeLabel(asset)}
        </span>
      </div>

      <div
        className={cx(
          "h-1.5 w-full overflow-hidden rounded-full",
          isDarkMode ? "bg-slate-700" : "bg-slate-200",
        )}
      >
        <div
          className={cx(
            "h-full rounded-full transition-all duration-200",
            asset?.done ? "bg-emerald-500" : "bg-cyan-500",
            indeterminate && "w-1/3 animate-pulse",
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </li>
  );
};

export default SttLoadingRow;
