"use client";

import React, { useEffect, useState } from "react";

import {
  STT_ASSET_ORDER,
  type SttAssetId,
  type SttAssetProgress,
} from "@/lib/sttConstants";

import SttLoadingRow from "./SttLoadingRow";

interface Props {
  isDarkMode: boolean;
  assets: Partial<Record<SttAssetId, SttAssetProgress>>;
  onCancel: () => void;
}

/**
 * How long the load has to last before the modal appears.
 *
 * Only the first dictation of a visit downloads anything; every later one is
 * answered from memory within a frame or two. Showing the modal immediately
 * would make those flash a window open and shut, which reads as a fault.
 */
const APPEAR_AFTER_MS = 250;

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/**
 * What the browser is doing between the first click of "Speak" and the
 * microphone actually opening.
 *
 * Reports one row per file rather than a single combined percentage. The files
 * are fetched partly in parallel, so a combined bar runs backwards; naming them
 * also answers the question the doctor is actually asking, which is why this is
 * taking any time at all.
 *
 * Deliberately not dismissible by clicking the backdrop — Cancel is explicit,
 * because a stray click landing on the overlay would otherwise abandon a
 * download the doctor is waiting on.
 */
const SttLoadingModal: React.FC<Props> = ({ isDarkMode, assets, onCancel }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stt-loading-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div
        className={cx(
          "w-full max-w-md rounded-2xl p-6 shadow-xl",
          isDarkMode ? "bg-slate-800" : "bg-white",
        )}
      >
        <h2
          id="stt-loading-title"
          className={cx(
            "text-lg font-bold",
            isDarkMode ? "text-slate-100" : "text-slate-900",
          )}
        >
          Preparing voice input
        </h2>
        <p
          className={cx(
            "mt-2 text-sm",
            isDarkMode ? "text-slate-400" : "text-slate-600",
          )}
        >
          The speech models are downloaded once and then kept in this browser.
          Later visits start instantly. Nothing you say is uploaded.
        </p>

        <ul className="mt-5 space-y-3">
          {STT_ASSET_ORDER.map((id) => (
            <SttLoadingRow
              key={id}
              id={id}
              asset={assets[id]}
              isDarkMode={isDarkMode}
            />
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={cx(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
              isDarkMode
                ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50",
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SttLoadingModal;
