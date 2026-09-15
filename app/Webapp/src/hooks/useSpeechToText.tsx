"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SAMPLE_RATE, type SttWorkerMessage } from "@/lib/sttConstants";
import { disposeSttWorker, getSttWorker } from "@/lib/sttWorkerHost";

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
 * ~123 MB first-visit download. Once loaded they stay loaded for the rest of the
 * visit — the worker belongs to the page, not to this hook (see
 * lib/sttWorkerHost.ts). Stopping releases the microphone, not the models.
 */
export function useSpeechToText({ onText }: Options) {
  const [status, setStatus] = useState<SttStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  // Kept so the listeners added for one dictation can be taken off again. The
  // worker is shared, so leaving them attached would mean a second dictation
  // delivering every sentence twice.
  const listenersRef = useRef<{
    message: (event: MessageEvent) => void;
    error: (event: ErrorEvent) => void;
  } | null>(null);
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

  /**
   * Detach from the worker without ending it. Anything the worker is still
   * transcribing is dropped by the reset, so a sentence finishing after the
   * doctor pressed Stop does not turn up in the box.
   */
  const releaseWorker = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    if (listenersRef.current) {
      worker.removeEventListener("message", listenersRef.current.message);
      worker.removeEventListener("error", listenersRef.current.error);
      listenersRef.current = null;
    }
    worker.postMessage({ type: "reset" });
    workerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    // The microphone goes back immediately — the browser's recording indicator
    // staying lit after Stop would be its own bug, and is the reason this is
    // first.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    // The worker is NOT terminated: it holds both models, and rebuilding them
    // costs the doctor ~3.3 s on the very next click. It is released at the end
    // of the visit by the page going away.
    releaseWorker();

    setSpeaking(false);
    setProgress(0);
    setStatus((prev) => (prev === "error" ? prev : "idle"));
  }, [releaseWorker]);

  const start = useCallback(async () => {
    if (unsupportedReason) return;
    setError(null);
    setStatus("loading");

    try {
      // Shared across dictations, and already holding the models if this is not
      // the first one — in which case "load" is answered with "ready" straight
      // away and the doctor never sees the loading label.
      const worker = getSttWorker();
      workerRef.current = worker;

      const onMessage = (event: MessageEvent) => {
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
      };
      // A worker that throws rather than reporting an error is one that cannot
      // be reused, so it is thrown away and the next click builds a new one.
      const onError = (event: ErrorEvent) => {
        setError(event.message || "Speech recognition failed to start.");
        setStatus("error");
        workerRef.current = null;
        listenersRef.current = null;
        disposeSttWorker();
      };
      listenersRef.current = { message: onMessage, error: onError };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);

      // Start from silence: the worker may still be holding the tail of the
      // previous dictation.
      worker.postMessage({ type: "reset" });
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

      // A 16 kHz context is preferred: the browser then resamples the
      // microphone itself, with a better filter than anything we can afford on
      // the audio thread. Firefox will not do it — it ignores the sampleRate
      // constraint above and then refuses to connect a device-rate stream into
      // a 16 kHz context ("Connecting AudioNodes from AudioContexts with
      // different sample-rate is currently not supported") — so fall back to
      // the device rate there and let the worklet convert. Chromium and WebKit
      // never reach the catch, and their path is unchanged.
      let audioContext = new AudioContext({
        sampleRate: SAMPLE_RATE,
        latencyHint: "interactive",
      });
      let source: MediaStreamAudioSourceNode;
      try {
        source = audioContext.createMediaStreamSource(stream);
      } catch {
        await audioContext.close().catch(() => undefined);
        audioContext = new AudioContext({ latencyHint: "interactive" });
        source = audioContext.createMediaStreamSource(stream);
      }
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
      source.connect(worklet);

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

  // Release the microphone if the doctor navigates away mid-dictation. The
  // models are not unloaded here: moving between sentences and domains unmounts
  // this hook constantly, and the next screen is one more place to dictate from.
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
