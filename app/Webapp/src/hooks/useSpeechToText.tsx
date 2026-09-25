"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SAMPLE_RATE,
  type SttAssetId,
  type SttAssetProgress,
  type SttWorkerMessage,
} from "@/lib/sttConstants";
import { disposeSttWorker, getSttWorker } from "@/lib/sttWorkerHost";

export type SttStatus =
  | "idle"
  | "loading"
  | "listening"
  // Stop was pressed and the worker is transcribing what was still buffered.
  // Short-lived — a second at most — but the dictation is not over until the
  // last sentence has been delivered, and the button must not say otherwise.
  | "finishing"
  | "error";

/**
 * How long to wait for the worker's `flushed` before giving up on it.
 *
 * The flush is one transcription of at most `MAX_BUFFER_DURATION` of audio, so a
 * second or two in practice. This only exists so that a worker which never
 * answers — wedged, or killed mid-inference — cannot strand the button in
 * "Finishing…" forever.
 */
const FLUSH_TIMEOUT_MS = 5000;

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
  // One entry per weight file being fetched, plus the warm-up. Keyed rather
  // than summed — see SttAssetId in sttConstants.ts for why.
  const [assets, setAssets] = useState<Partial<Record<SttAssetId, SttAssetProgress>>>({});
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
  // Guards the wait for `flushed` — see FLUSH_TIMEOUT_MS.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
   * Detach from the worker without ending it, discarding anything still in
   * flight. This is the hard stop — it bumps the worker's session, so a
   * transcription that has not been delivered yet never will be.
   */
  const releaseWorker = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
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

  /** Hand the microphone back. Always first — see the comment in stop(). */
  const teardownAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, []);

  /**
   * End the dictation without waiting for anything — used when there is no one
   * left to deliver text to (unmount) or when start() failed partway through.
   */
  const stopImmediate = useCallback(() => {
    teardownAudio();
    releaseWorker();
    setSpeaking(false);
    setStatus((prev) => (prev === "error" ? prev : "idle"));
  }, [releaseWorker, teardownAudio]);

  /**
   * The Stop button.
   *
   * A sentence is only handed to the transcriber after 400 ms of silence, and
   * transcribing it takes about another second. Someone who finishes talking and
   * presses Stop straight away is inside that window, so detaching here — which
   * is what this used to do — silently threw away the last thing they said.
   * Instead the worker is asked to flush, and the teardown happens on `flushed`.
   *
   * The microphone still goes back immediately: the browser's recording
   * indicator staying lit while we wait would be its own bug, and the audio
   * needed for the flush is already inside the worker.
   */
  const stop = useCallback(() => {
    teardownAudio();
    setSpeaking(false);

    const worker = workerRef.current;
    if (!worker || !listenersRef.current) {
      stopImmediate();
      return;
    }

    // The worker is NOT terminated: it holds both models, and rebuilding them
    // costs the doctor ~3.3 s on the very next click. It is released at the end
    // of the visit by the page going away.
    setStatus((prev) => (prev === "error" ? prev : "finishing"));
    worker.postMessage({ type: "flush" });

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      stopImmediate();
    }, FLUSH_TIMEOUT_MS);
  }, [stopImmediate, teardownAudio]);

  const start = useCallback(async () => {
    if (unsupportedReason) return;
    setError(null);
    // Clear the rows from any earlier attempt: a worker that failed and was
    // disposed loads again from scratch, and rows left showing "done" from the
    // attempt that failed would be a lie.
    setAssets({});
    setStatus("loading");

    try {
      // A flush from the previous dictation may still be outstanding. Drop it:
      // the worker is shared, so attaching a second set of listeners would
      // deliver every sentence of this dictation twice.
      releaseWorker();

      // Shared across dictations, and already holding the models if this is not
      // the first one — in which case "load" is answered with "ready" straight
      // away and the doctor never sees the loading label.
      const worker = getSttWorker();
      workerRef.current = worker;

      const onMessage = (event: MessageEvent) => {
        const message = event.data as SttWorkerMessage;
        switch (message.type) {
          case "asset":
            setAssets((prev) => ({ ...prev, [message.asset.id]: message.asset }));
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
          case "flushed":
            // The final sentence has been delivered — `text` for it arrived
            // just above this, because the worker posts it before `flushed`.
            stopImmediate();
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
      stopImmediate();
    }
  }, [releaseWorker, stopImmediate, unsupportedReason]);

  // Release the microphone if the doctor navigates away mid-dictation. The
  // models are not unloaded here: moving between sentences and domains unmounts
  // this hook constantly, and the next screen is one more place to dictate from.
  //
  // Deliberately the immediate stop rather than a flush: the box that would
  // receive the text has gone with the component, so there is nothing to wait
  // for and a pending flush would only deliver into a dead callback.
  useEffect(() => stopImmediate, [stopImmediate]);

  return {
    supported: unsupportedReason == null,
    unsupportedReason,
    status,
    assets,
    speaking,
    error,
    start,
    stop,
    // The loading modal's Cancel. It detaches rather than aborting: the fetches
    // already in flight finish into the browser's Cache API, so a doctor who
    // cancels and clicks Speak again a minute later pays for the bytes once,
    // not twice.
    cancel: stopImmediate,
  };
}
