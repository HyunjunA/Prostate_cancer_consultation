"use client";

import React from "react";

import { useSpeechToText } from "@/hooks/useSpeechToText";

interface Props {
  isDarkMode: boolean;
  /** Receives one recognised sentence at a time, as the doctor speaks. */
  onText: (text: string) => void;
}

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19 11a7 7 0 01-14 0M12 18v3"
    />
  </svg>
);

/**
 * Microphone button for the Re-write Practice input.
 *
 * Speech becomes text inside the browser, so no consultation audio is uploaded
 * anywhere — see src/lib/sttConstants.ts. Typing still works exactly as before;
 * this only ever appends to what is already in the box.
 */
const RewriteVoiceInput: React.FC<Props> = ({ isDarkMode, onText }) => {
  const { supported, unsupportedReason, status, progress, speaking, error, start, stop } =
    useSpeechToText({ onText });

  const active = status === "loading" || status === "listening";
  const label = !supported
    ? "Voice unavailable"
    : status === "loading"
      ? `Loading… ${Math.round(progress)}%`
      : status === "listening"
        ? speaking
          ? "Listening…"
          : "Stop"
        : "Speak";

  return (
    // The onboarding tour spotlights this wrapper, so the anchor stays put
    // whether or not the error message beside the button is showing.
    <div data-tour="rewrite-voice-button" className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (active ? stop() : void start())}
        disabled={!supported}
        aria-pressed={status === "listening"}
        title={
          unsupportedReason ??
          "Dictate your rewrite — speech is transcribed in your browser and the audio is never uploaded"
        }
        className={cx(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all",
          !supported
            ? isDarkMode
              ? "border-slate-700 text-slate-500 cursor-not-allowed"
              : "border-slate-200 text-slate-400 cursor-not-allowed"
            : status === "listening"
              ? isDarkMode
                ? "border-rose-500 bg-rose-500/15 text-rose-300"
                : "border-rose-500 bg-rose-50 text-rose-600"
              : isDarkMode
                ? "border-slate-600 text-cyan-400 hover:border-cyan-500 hover:bg-cyan-500/10"
                : "border-slate-300 text-cyan-600 hover:border-cyan-400 hover:bg-cyan-50",
        )}
      >
        <MicIcon
          className={cx("w-4 h-4", speaking && "animate-pulse")}
        />
        {label}
      </button>

      {error && (
        <span
          className={cx(
            "text-xs font-medium",
            isDarkMode ? "text-red-400" : "text-red-600",
          )}
        >
          {error}
        </span>
      )}

      {/* Warning shown while actively listening */}
      {status === "listening" && (
        <span
          className={cx(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            isDarkMode
              ? "bg-amber-900/40 text-amber-300 border border-amber-700/50"
              : "bg-amber-50 text-amber-700 border border-amber-200",
          )}
        >
          ⚠ Speech-to-text may contain errors — please review before clicking Try &amp; Score
        </span>
      )}
    </div>
  );
};

export default RewriteVoiceInput;
