import { useCallback, useEffect, useState } from "react";
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
let _interactionStopRegistered = false;
let _sharedTtsError = false;
const _ttsErrorListeners = new Set();

/** Single active audio element — stops mascot/story overlap across components */
let _activeAudio = null;
let _speakLongActive = false;
let _speechGeneration = 0;
const _speakingStateListeners = new Set();

function notifySpeaking(speaking) {
  _speakingStateListeners.forEach((fn) => fn(speaking));
}

let _playResolve = null;

function haltActiveAudio() {
  if (_activeAudio) {
    try {
      _activeAudio.pause();
      _activeAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    _activeAudio = null;
  }
  if (_playResolve) {
    const done = _playResolve;
    _playResolve = null;
    done();
  }
}

export function stopAllSpeech() {
  _speechGeneration += 1;
  haltActiveAudio();
  _speakLongActive = false;
  notifySpeaking(false);
}

export function registerSpeechInteractionStop() {
  if (_interactionStopRegistered) return;
  _interactionStopRegistered = true;
  document.addEventListener("pointerdown", stopAllSpeech, true);
  document.addEventListener("click", stopAllSpeech, true);
}

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

function ttsCacheKey(text, prompt, language = "English") {
  return `${language}::${prompt}::${text}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postTtsWithRetry(text, prompt, language = "English") {
  let lastRes = null;
  let lastData = {};

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    lastRes = await fetch(TTS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, prompt, language }),
    });
    lastData = await lastRes.json().catch(() => ({}));

    if (lastRes.status !== 429) return { res: lastRes, data: lastData };
    if (attempt >= RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  return { res: lastRes, data: lastData };
}

/** Only TTS network call in the frontend: POST /api/tts { text, prompt } */
async function fetchTTS(text, prompt = PREFETCH_PROMPT, language = "English") {
  const key = ttsCacheKey(text, prompt, language);
  if (_audioCache.has(key)) return _audioCache.get(key);
  if (_pendingFetches.has(key)) return _pendingFetches.get(key);

  const promise = (async () => {
    const { res, data } = await postTtsWithRetry(text, prompt, language);
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

function playUri(uri, sessionGen) {
  return new Promise((resolve) => {
    if (sessionGen !== _speechGeneration) {
      resolve();
      return;
    }

    if (_activeAudio) {
      try {
        _activeAudio.pause();
        _activeAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (_playResolve) {
      const prev = _playResolve;
      _playResolve = null;
      prev();
    }

    let audio;
    const finish = () => {
      if (_playResolve === resolve) _playResolve = null;
      if (_activeAudio === audio) _activeAudio = null;
      notifySpeaking(false);
      resolve();
    };

    _playResolve = resolve;
    audio = new Audio(uri);
    _activeAudio = audio;
    notifySpeaking(true);
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  });
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

export function prefetchStoryTTS(fullText, language = "English") {
  const paras = fullText
    .split(/\n\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  if (!paras.length) return;
  fetchTTS(paras[0], STORY_PROMPT, language).catch(() => {});
  if (paras[1]) fetchTTS(paras[1], STORY_PROMPT, language).catch(() => {});
}

export function useSpeech({ storyLanguage = "English" } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState(_sharedTtsError);

  useEffect(() => {
    registerInteractionPrefetch();
    registerSpeechInteractionStop();
    const errListener = (v) => setTtsError(v);
    const speakListener = (v) => setSpeaking(v);
    _ttsErrorListeners.add(errListener);
    _speakingStateListeners.add(speakListener);
    return () => {
      _ttsErrorListeners.delete(errListener);
      _speakingStateListeners.delete(speakListener);
    };
  }, []);

  const speak = useCallback(async (text, _cacheKey) => {
    if (!text) return;
    prefetchVoiceLinesOnInteraction();
    stopAllSpeech();
    const gen = _speechGeneration;
    try {
      const uri = await fetchTTS(text, PREFETCH_PROMPT);
      if (gen !== _speechGeneration) return;
      await playUri(uri, gen);
    } catch (err) {
      if (gen !== _speechGeneration) return;
      console.warn("🎙️ TTS failed:", err.message);
      notifySpeaking(false);
      setSharedTtsError(true);
    }
  }, []);

  const speakLong = useCallback(
    async (text) => {
      if (!text) return;
      prefetchVoiceLinesOnInteraction();
      stopAllSpeech();
      const gen = _speechGeneration;
      _speakLongActive = true;
      notifySpeaking(true);

      const paras = text
        .split(/\n\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      if (!paras.length) {
        stopAllSpeech();
        return;
      }

      let failed = false;

      for (let i = 0; i < paras.length; i++) {
        if (!_speakLongActive || gen !== _speechGeneration) break;

        let uri;
        try {
          uri = await fetchTTS(paras[i], STORY_PROMPT, storyLanguage);
        } catch {
          failed = true;
          break;
        }

        if (!_speakLongActive || gen !== _speechGeneration) break;
        if (!uri) break;
        await playUri(uri, gen);
        if (!_speakLongActive || gen !== _speechGeneration) break;
      }

      if (failed && gen === _speechGeneration) setSharedTtsError(true);
      if (gen === _speechGeneration) stopAllSpeech();
    },
    [storyLanguage]
  );

  return { speak, speakLong, stop: stopAllSpeech, speaking, ttsError };
}
