const DEFAULT_API_URL = "https://ai-learning-api.decklysahil.workers.dev";

export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_URL;
}
