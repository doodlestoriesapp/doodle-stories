import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { apiPost } from "./api";
import { VOICE_LINES } from "./constants";

const PREFETCH_PROMPT =
  "Read aloud in an upbeat, playful, enthusiastic tone - like a friendly character speaking to young children.";
const STORY_PROMPT = "Read aloud in a warm, engaging storytelling voice for children.";

const _audioCache = new Map();
const _pendingFetches = new Map();
let _prefetchStarted = false;

function ttsCacheKey(text, prompt) {
  return `${prompt}::${text}`;
}

async function fetchTTS(text, prompt = PREFETCH_PROMPT) {
  const key = ttsCacheKey(text, prompt);
  if (_audioCache.has(key)) return _audioCache.get(key);
  if (_pendingFetches.has(key)) return _pendingFetches.get(key);

  const promise = (async () => {
    const { audio } = await apiPost("/api/tts", { text, prompt });
    if (!audio) throw new Error("No audio returned");

    const uri = `${FileSystem.cacheDirectory}tts-${key.length}-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(uri, audio, { encoding: "base64" });
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

async function prefetchVoiceLines() {
  if (_prefetchStarted) return;
  _prefetchStarted = true;
  const lines = Object.values(VOICE_LINES);
  try {
    await fetchTTS(lines[0], PREFETCH_PROMPT);
  } catch {
    /* ignore */
  }
  for (let i = 1; i < lines.length; i++) {
    await new Promise((r) => setTimeout(r, 600));
    fetchTTS(lines[i], PREFETCH_PROMPT).catch(() => {});
  }
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

async function playUri(uri, soundRef) {
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync({ uri });
  soundRef.current = sound;
  await sound.playAsync();
  await new Promise((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) resolve();
    });
  });
  await sound.unloadAsync();
  soundRef.current = null;
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const soundRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    prefetchVoiceLines();
    return () => {
      soundRef.current?.unloadAsync?.().catch(() => {});
    };
  }, []);

  const stop = useCallback(async () => {
    cancelRef.current = true;
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text, prompt = PREFETCH_PROMPT) => {
      if (!text) return;
      await stop();
      setSpeaking(true);
      try {
        const uri = await fetchTTS(text, prompt);
        await playUri(uri, soundRef);
      } catch (err) {
        console.warn("TTS failed:", err?.message);
      } finally {
        setSpeaking(false);
      }
    },
    [stop]
  );

  const speakLong = useCallback(
    async (text) => {
      if (!text) return;
      await stop();
      cancelRef.current = false;
      setSpeaking(true);

      const paras = text
        .split(/\n\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      if (!paras.length) {
        setSpeaking(false);
        return;
      }

      const pending = paras.map(() => null);
      pending[0] = fetchTTS(paras[0], STORY_PROMPT);
      if (paras[1]) pending[1] = fetchTTS(paras[1], STORY_PROMPT);

      try {
        for (let i = 0; i < paras.length; i++) {
          if (cancelRef.current) break;
          if (paras[i + 2] && !pending[i + 2]) {
            pending[i + 2] = fetchTTS(paras[i + 2], STORY_PROMPT);
          }
          let uri;
          try {
            uri = await pending[i];
          } catch {
            break;
          }
          if (!uri || cancelRef.current) break;
          setSpeaking(true);
          await playUri(uri, soundRef);
        }
      } catch (err) {
        console.warn("TTS long failed:", err?.message);
      } finally {
        setSpeaking(false);
        soundRef.current = null;
      }
    },
    [stop]
  );

  return { speak, speakLong, stop, speaking, prefetchStoryTTS };
}
