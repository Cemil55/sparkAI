import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "sparkai_session_id";

const createSessionId = (): string => {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getSessionId = async (): Promise<string> => {
  try {
    const existing = await SecureStore.getItemAsync(SESSION_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }

    const newId = createSessionId();
    await SecureStore.setItemAsync(SESSION_KEY, newId);
    return newId;
  } catch (error) {
    console.warn("Session ID konnte nicht aus SecureStore gelesen werden:", error);
    return "default-session";
  }
};
