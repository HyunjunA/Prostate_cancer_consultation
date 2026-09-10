"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SAMPLE_RATE, type SttWorkerMessage } from "@/lib/sttConstants";

export type SttStatus = "idle" | "loading" | "listening" | "error";

interface Options {
  /** Called once per recognised sentence, as the doctor speaks. */
  onText: (text: string) => void;
}

/**
 * Microphone dictation for the Re-write Practice box.
 *
 * Owns the browser-side plumbing — permission, a 16 kHz AudioContext, the VAD
 * audio worklet, and the worker that runs both models — and hands back only the
 * recognised text. The audio itself stays inside the tab.
 *
 * The models are loaded on the first `start()`, not on mount: this hook sits on
 * a screen most doctors reach without ever dictating, and the weights are a
 * ~123 MB first-visit download.
 */
export function useSpeechToText({ onText }: Options) {
  const [status, setStatus] = useState<SttStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Keep the latest callback without making start()/stop() change identity.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // getUserMedia only exists in a secure context. Over plain HTTP on a LAN
  // address `navigator.mediaDevices` is undefined, so say why rather than
  // failing at the click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setUnsupportedReason(
        "Voice input needs a secure connection (HTTPS or localhost).",
      );
    } else if (!navigator.mediaDevices?.getUserMedia) {
      setUnsupportedReason("This browser does not support microphone capture.");
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    workerRef.current?.terminate();
    workerRef.current = null;

    setSpeaking(false);
    setProgress(0);
    setStatus((prev) => (prev === "error" ? prev : "idle"));
  }, []);

  const start = useCallback(async () => {
    if (unsupportedReason) return;
    setError(null);
    setStatus("loading");

    try {
      const worker = new Worker(
        new URL("../workers/stt.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      worker.addEventListener("message", (event: MessageEvent) => {
        const message = event.data as SttWorkerMessage;
        switch (message.type) {
          case "progress":
            setProgress(message.progress);
            break;
          case "ready":
            setStatus("listening");
            break;
          case "speech":
            setSpeaking(message.active);
            break;
          case "text":
            onTextRef.current(message.text);
            break;
          case "error":
            setError(message.message);
            setStatus("error");
            break;
        }
      });
      worker.addEventListener("error", (event) => {
        setError(event.message || "Speech recognition failed to start.");
        setStatus("error");
      });
      worker.postMessage({ type: "load" });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: SAMPLE_RATE,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({
        sampleRate: SAMPLE_RATE,
        latencyHint: "interactive",
      });
      audioContextRef.current = audioContext;

      // Static file, not a bundled module — see public/vad-processor.js.
      await audioContext.audioWorklet.addModule("/vad-processor.js");
      const worklet = new AudioWorkletNode(audioContext, "vad-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });
      audioContext.createMediaStreamSource(stream).connect(worklet);

      worklet.port.onmessage = (event: MessageEvent) => {
        workerRef.current?.postMessage({ buffer: event.data.buffer });
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not access the microphone.",
      );
      setStatus("error");
      stop();
    }
  }, [stop, unsupportedReason]);

  // Release the microphone if the doctor navigates away mid-dictation.
  useEffect(() => stop, [stop]);

  return {
    supported: unsupportedReason == null,
    unsupportedReason,
    status,
    progress,
    speaking,
    error,
    start,
    stop,
  };
}
