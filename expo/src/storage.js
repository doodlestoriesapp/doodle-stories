import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const STORAGE_KEYS = { library: "doodle-library", votes: "doodle-votes", deviceId: "doodle-device-id" };

export async function loadLibrary() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.library);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLibrary(stories) {
  await AsyncStorage.setItem(STORAGE_KEYS.library, JSON.stringify(stories));
}

export async function loadVotes() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.votes);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveVotes(v) {
  await AsyncStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(v));
}

// ── Device ID ─────────────────────────────────────────────────────
// One random ID per install. It is used as BOTH:
//   • the RevenueCat user ID (so purchases are recorded against it), and
//   • the x-device-token header on story requests (so the server can see
//     that this install is premium and skip the free-story limit).
// It is a random UUID (letters, digits, dashes), which matches the format
// the server accepts. It identifies an install, not a person.
const ID_FORMAT = /^[a-zA-Z0-9-]{10,64}$/;
let deviceIdPromise = null;

export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.deviceId);
        if (saved && ID_FORMAT.test(saved)) return saved;
      } catch {
        // fall through and create a new one
      }
      const id = Crypto.randomUUID();
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.deviceId, id);
      } catch {
        // If saving fails we still use the ID for this session.
      }
      return id;
    })();
  }
  return deviceIdPromise;
}
