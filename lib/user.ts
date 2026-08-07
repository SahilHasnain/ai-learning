import AsyncStorage from "@react-native-async-storage/async-storage";
import { createId } from "./utils";

const KEY = "learning.userId";

export async function getUserId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = createId();
    await AsyncStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return createId();
  }
}
