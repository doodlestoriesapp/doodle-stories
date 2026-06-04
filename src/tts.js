import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_LINES } from "./voiceLines";

const PREFETCH_PROMPT =
  "Read aloud in an upbeat, playful, enthusiastic tone — like a friendly character speaking to young children.";
const STORY_PROMPT =
  "Read aloud in a warm, engaging storytelling voice for children.";

const TTS_API_URL = `${process.env.REACT_APP_API_BASE_URL || ""}/api/tts`;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Module-level — shared across every useSpeech() instance in the app */
const _audioCache = new Map();
const _pendingFetches = new Map();
let _interactionPrefetchStarted = false;
let _interactionListenerRegistered = false;
let _sharedTtsError = false;
const _ttsErrorListeners = new Set();

function setSharedTtsError(value) {
  _sharedTtsError = value;
  _ttsErrorListeners.forEach((fn) => fn(value));
}

export function useTtsErrorBanner() {
  const [ttsError, setTtsError] = useState(_sharedTtsError);
  useEffect(() => {
    const listener = (v) => setTtsError(v);
    _ttsErrorListeners.add(listener);
    return () => _ttsErrorListeners.delete(listener);
  }, []);
  return ttsError;
}

function ttsCacheKey(text, prompt) {
  return `${prompt}::${text}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postTtsWithRetry(text, prompt) {
  let lastRes = null;
  let lastData = {};

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    lastRes = await fetch(TTS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, prompt }),
    });
    lastData = await lastRes.json().catch(() => ({}));

    if (lastRes.status !== 429) return { res: lastRes, data: lastData };
    if (attempt >= RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  return { res: lastRes, data: lastData };
}

/** Only TTS network call in the frontend: POST /api/tts { text, prompt } */
async function fetchTTS(text, prompt = PREFETCH_PROMPT) {
  const key = ttsCacheKey(text, prompt);
  if (_audioCache.has(key)) return _audioCache.get(key);
  if (_pendingFetches.has(key)) return _pendingFetches.get(key);

  const promise = (async () => {
    const { res, data } = await postTtsWithRetry(text, prompt);
    if (!res.ok) {
      const err = data?.error;
      const message =
        typeof err === "string" ? err : err?.message || `TTS ${res.status}`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    if (!data.audio) throw new Error("No audio returned");

    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const mimeType = data.format === "mp3" ? "audio/mpeg" : "audio/wav";
    const blob = new Blob([bytes], { type: mimeType });
    const uri = URL.createObjectURL(blob);
    _audioCache.set(key, uri);
    return uri;
  })();

  _pendingFetches.set(key, promise);
  try {
    return await promise;
  } finally {
    _pendingFetches.delete(key);
  }
}

/** Prefetch mascot lines once per session — only after first user interaction */
async function prefetchVoiceLinesOnInteraction() {
  if (_interactionPrefetchStarted) return;
  _interactionPrefetchStarted = true;

  const lines = Object.values(VOICE_LINES);
  try {
    await fetchTTS(lines[0], PREFETCH_PROMPT);
  } catch {
    /* ignore prefetch failures */
  }
  for (let i = 1; i < lines.length; i++) {
    await new Promise((r) => setTimeout(r, 600));
    fetchTTS(lines[i], PREFETCH_PROMPT).catch(() => {});
  }
}

function registerInteractionPrefetch() {
  if (_interactionListenerRegistered) return;
  _interactionListenerRegistered = true;

  const onFirstInteraction = () => {
    prefetchVoiceLinesOnInteraction();
    document.removeEventListener("pointerdown", onFirstInteraction, true);
    document.removeEventListener("touchstart", onFirstInteraction, true);
    document.removeEventListener("click", onFirstInteraction, true);
  };

  document.addEventListener("pointerdown", onFirstInteraction, true);
  document.addEventListener("touchstart", onFirstInteraction, true);
  document.addEventListener("click", onFirstInteraction, true);
}

export function prefetchStoryTTS(fullText) {
  const paras = fullText
    .split(/\n\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  if (!paras.length) return;
  fetchTTS(paras[0], STORY_PROMPT).catch(() => {});
  if (paras[1]) fetchTTS(paras[1], STORY_PROMPT).catch(() => {});
  fetchTTS(VOICE_LINES.readAloud, PREFETCH_PROMPT).catch(() => {});
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState(_sharedTtsError);
  const audioRef = useRef(null);

  useEffect(() => {
    registerInteractionPrefetch();
    const listener = (v) => setTtsError(v);
    _ttsErrorListeners.add(listener);
    return () => _ttsErrorListeners.delete(listener);
  }, []);

  const stopAll = useCallback(() => {
    if (audioRef.current?.pause) audioRef.current.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  const playUri = useCallback(
    (uri) =>
      new Promise((resolve) => {
        const audio = new Audio(uri);
        audioRef.current = audio;
        audio.onended = () => {
          setSpeaking(false);
          audioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          setSpeaking(false);
          audioRef.current = null;
          resolve();
        };
        audio.play().catch(resolve);
      }),
    []
  );

  const speak = useCallback(
    async (text, _cacheKey) => {
      if (!text) return;
      prefetchVoiceLinesOnInteraction();
      stopAll();
      setSpeaking(true);
      try {
        const uri = await fetchTTS(text, PREFETCH_PROMPT);
        await playUri(uri);
      } catch (err) {
        console.warn("🎙️ TTS failed:", err.message);
        setSpeaking(false);
        setSharedTtsError(true);
      }
    },
    [stopAll, playUri]
  );

  const speakLong = useCallback(
    async (text) => {
      if (!text) return;
      prefetchVoiceLinesOnInteraction();
      stopAll();
      setSpeaking(true);

      const paras = text
        .split(/\n\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      if (!paras.length) {
        setSpeaking(false);
        return;
      }

      audioRef.current = {};

      const pending = paras.map(() => null);
      pending[0] = fetchTTS(paras[0], STORY_PROMPT);
      if (paras[1]) pending[1] = fetchTTS(paras[1], STORY_PROMPT);

      let failed = false;

      for (let i = 0; i < paras.length; i++) {
        if (!audioRef.current) break;
        if (paras[i + 2] && !pending[i + 2]) {
          pending[i + 2] = fetchTTS(paras[i + 2], STORY_PROMPT);
        }
        let uri;
        try {
          uri = await pending[i];
        } catch {
          failed = true;
          break;
        }
        if (!uri || !audioRef.current) break;
        setSpeaking(true);
        await playUri(uri);
      }

      if (failed) setSharedTtsError(true);
      if (audioRef.current !== null) setSpeaking(false);
      audioRef.current = null;
    },
    [stopAll, playUri]
  );

  return { speak, speakLong, stop: stopAll, speaking, ttsError };
}
