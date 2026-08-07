export type Difficulty = "beginner" | "intermediate" | "advanced";

export const DIFFICULTIES: Difficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

export type ExplanationLanguage = "english" | "hinglish";

export const LANGUAGES: ExplanationLanguage[] = ["english", "hinglish"];

export type Provider = "gemini" | "groq";

export interface ExplanationSection {
  heading: string;
  body: string;
}

export interface Explanation {
  topic: string;
  sections: ExplanationSection[];
  examples: string[];
  analogy?: string;
  keyPoints: string[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  questions: QuizQuestion[];
  score?: number;
  total?: number;
  completed?: boolean;
  completedAt?: string;
}

export interface LearningSession {
  id: string;
  question: string;
  topic: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
  createdAt: string;
  updatedAt: string;
  explanations: Record<ExplanationLanguage, Partial<Record<Difficulty, Explanation>>>;
  quiz?: Quiz;
}

export interface ExplainRequest {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
  userId: string;
}

export interface ExplainResponse {
  explanation: Explanation;
  provider: Provider;
  fallbackUsed: boolean;
}

export interface QuizRequest {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
  explanation: Explanation;
  userId: string;
}

export interface QuizResponse {
  quiz: Quiz;
  provider: Provider;
  fallbackUsed: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}
