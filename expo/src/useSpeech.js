import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { apiPost } from "./api";

const PREFETCH_PROMPT =
  "Read aloud in an upbeat, playful, enthusiastic tone — like a friendly character speaking to young children.";
const STORY_PROMPT = "Read aloud in a warm, engaging storytelling voice for children.";

const cache = {};

async function wavUriFromApi(text, prompt) {
  const key = `${prompt}::${text}`;
  if (cache[key]) return cache[key];

  const { audio } = await apiPost("/api/tts", { text, prompt });
  if (!audio) throw new Error("No audio returned");

  const uri = `${FileSystem.cacheDirectory}tts-${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(uri, audio, { encoding: "base64" });
  cache[key] = uri;
  return uri;
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

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    return () => {
      soundRef.current?.unloadAsync?.().catch(() => {});
    };
  }, []);

  const stop = useCallback(async () => {
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
        const uri = await wavUriFromApi(text, prompt);
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
      setSpeaking(true);
      const paras = text
        .split(/\n\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
      try {
        for (const para of paras) {
          const uri = await wavUriFromApi(para, STORY_PROMPT);
          await playUri(uri, soundRef);
        }
      } catch (err) {
        console.warn("TTS long failed:", err?.message);
      } finally {
        setSpeaking(false);
      }
    },
    [stop]
  );

  return { speak, speakLong, stop, speaking };
}
