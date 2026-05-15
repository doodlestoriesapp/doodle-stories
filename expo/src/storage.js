import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = { library: "doodle-library", votes: "doodle-votes" };

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
