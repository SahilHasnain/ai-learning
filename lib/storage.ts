import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ExplanationLanguage,
  LearningSession,
} from "../shared/types";
import { createId } from "./utils";

const KEY = "learning.sessions";

export function createSession(input: {
  question: string;
  topic: string;
  difficulty: LearningSession["difficulty"];
  language: ExplanationLanguage;
}): LearningSession {
  const now = new Date().toISOString();
  return {
    id: createId(),
    question: input.question,
    topic: input.topic,
    difficulty: input.difficulty,
    language: input.language,
    createdAt: now,
    updatedAt: now,
    explanations: { english: {}, hinglish: {} },
  };
}

async function readAll(): Promise<LearningSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: LearningSession) => {
      const lang = (s.language ?? "english") as ExplanationLanguage;
      if (s.language && (s.explanations as { english?: unknown }).english) {
        return s;
      }
      return {
        ...s,
        language: lang,
        explanations: {
          english: {},
          hinglish: {},
          [lang]: s.explanations,
        },
      };
    }) as LearningSession[];
  } catch {
    return [];
  }
}

async function writeAll(sessions: LearningSession[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
}

export async function listSessions(): Promise<LearningSession[]> {
  const sessions = await readAll();
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSession(id: string): Promise<LearningSession | undefined> {
  const sessions = await readAll();
  return sessions.find((s) => s.id === id);
}

export async function saveSession(session: LearningSession): Promise<void> {
  const sessions = await readAll();
  const index = sessions.findIndex((s) => s.id === session.id);
  const updated = { ...session, updatedAt: new Date().toISOString() };
  if (index >= 0) {
    sessions[index] = updated;
  } else {
    sessions.push(updated);
  }
  await writeAll(sessions);
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await readAll();
  await writeAll(sessions.filter((s) => s.id !== id));
}
