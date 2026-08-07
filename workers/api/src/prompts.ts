import type {
  Difficulty,
  Explanation,
  ExplanationLanguage,
  Quiz,
} from "../../../shared/types";

export interface ExplainContext {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
}

export interface QuizContext {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
  explanation: Explanation;
}

const LANGUAGE_INSTRUCTIONS: Record<ExplanationLanguage, string> = {
  english:
    "Write the explanation in plain English.",
  hinglish:
    "Write the explanation in Hinglish: Hindi written in Latin script, mixed naturally with English words. Use simple, friendly Hindi first; keep English only for words that fit better in English. Do not use Devanagari script.",
};

const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  beginner: "Plain everyday words. Assume zero prior knowledge; explain any jargon.",
  intermediate:
    "Clear language for a general reader. Define specialized terms on first use.",
  advanced:
    "Precise technical language for a reader who knows the fundamentals. Cover nuance and edge cases.",
};

const EXPLANATION_SCHEMA_INSTRUCTIONS = `Return ONLY valid JSON with exactly this shape:
{
  "topic": "short title for the topic",
  "sections": [
    { "heading": "short heading", "body": "one or two short sentences" }
  ],
  "examples": ["1 concrete example"],
  "analogy": "one very short analogy, or an empty string if none fits",
  "keyPoints": ["2-3 very short bullets"]
}`;

const QUIZ_SCHEMA_INSTRUCTIONS = `Return ONLY valid JSON with exactly this shape:
{
  "questions": [
    {
      "prompt": "the question",
      "choices": ["option A", "option B", "option C", "option D"],
      "correctIndex": 0,
      "explanation": "one short sentence explaining the correct answer"
    }
  ]
}`;

function quote(s: string): string {
  return `"""${s}"""`;
}

export function buildExplanationPrompt(ctx: ExplainContext): string {
  return `You are a tutor. Explain clearly and concisely in 60-80 words.

Language: ${ctx.language.toUpperCase()}
${LANGUAGE_INSTRUCTIONS[ctx.language]}

Difficulty: ${ctx.difficulty}
${DIFFICULTY_DESCRIPTIONS[ctx.difficulty]}

Question: ${quote(ctx.question)}

Rules:
- Exactly 2 sections. Each section is 1-2 complete sentences that teach one idea.
- Include exactly 1 concrete example.
- Exactly 3 key points, each a short phrase.
- Analogy only if it genuinely helps, else empty string.
- Write natural, complete sentences. No fragments, no filler, no repetition.
- Stay strictly on topic.

${EXPLANATION_SCHEMA_INSTRUCTIONS}`;
}

export function buildQuizPrompt(ctx: QuizContext): string {
  const explanation = JSON.stringify(ctx.explanation);
  return `You are a tutor writing a short quiz. Write questions that can be answered ONLY from the explanation provided. Do not ask trivia the reader could not learn from it.

Language: ${ctx.language.toUpperCase()}
${LANGUAGE_INSTRUCTIONS[ctx.language]}

Difficulty: ${ctx.difficulty}
Topic question: ${quote(ctx.question)}

Explanation to base the quiz on:
${quote(explanation)}

  Write exactly 4 multiple-choice questions with exactly 4 choices each. One clearly correct answer. Put the choices in a random order. Vary the question types (concept, example, key point).

${QUIZ_SCHEMA_INSTRUCTIONS}`;
}

export interface ParsedModelResult {
  explanation?: Explanation;
  quiz?: Quiz;
}
