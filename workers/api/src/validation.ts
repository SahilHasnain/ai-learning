import type {
  Explanation,
  ExplanationSection,
  Quiz,
  QuizQuestion,
} from "../../../shared/types";
import { ValidationError } from "./errors";

const MAX_SECTIONS = 6;
const MAX_EXAMPLES = 6;
const MAX_KEY_POINTS = 8;
const MAX_QUESTIONS = 6;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Expected "${field}" to be an array of strings.`);
  }
  const items = value.filter(isNonEmptyString).slice(0, MAX_KEY_POINTS);
  if (items.length === 0) {
    throw new ValidationError(`Expected "${field}" to contain at least one item.`);
  }
  return items;
}

function asSections(value: unknown): ExplanationSection[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('Expected "sections" to be an array.');
  }
  const sections: ExplanationSection[] = [];
  for (const raw of value) {
    if (sections.length >= MAX_SECTIONS) break;
    if (typeof raw !== "object" || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    if (!isNonEmptyString(obj.heading) || !isNonEmptyString(obj.body)) continue;
    sections.push({ heading: obj.heading.trim(), body: obj.body.trim() });
  }
  if (sections.length === 0) {
    throw new ValidationError('Expected "sections" to contain at least one valid section.');
  }
  return sections;
}

export function parseExplanation(raw: unknown): Explanation {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("Explanation must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const topic = isNonEmptyString(obj.topic) ? obj.topic.trim() : "";
  const sections = asSections(obj.sections);
  const examples = asStringArray(obj.examples, "examples").slice(0, MAX_EXAMPLES);
  const keyPoints = asStringArray(obj.keyPoints, "keyPoints").slice(0, MAX_KEY_POINTS);
  const analogy =
    typeof obj.analogy === "string" && obj.analogy.trim().length > 0
      ? obj.analogy.trim()
      : undefined;

  if (!topic) {
    throw new ValidationError('Explanation is missing a valid "topic".');
  }

  return { topic, sections, examples, keyPoints, ...(analogy ? { analogy } : {}) };
}

export function parseQuiz(raw: unknown): Quiz {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("Quiz must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.questions)) {
    throw new ValidationError('Expected "questions" to be an array.');
  }

  const questions: QuizQuestion[] = [];
  for (const rawQuestion of obj.questions) {
    if (questions.length >= MAX_QUESTIONS) break;
    if (typeof rawQuestion !== "object" || rawQuestion === null) continue;
    const q = rawQuestion as Record<string, unknown>;

    if (!isNonEmptyString(q.prompt)) continue;
    const choices = asStringArray(q.choices, "choices");
    if (choices.length < 2) continue;
    const correctIndex = Number(q.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      continue;
    }
    const explanation = isNonEmptyString(q.explanation)
      ? q.explanation.trim()
      : "No explanation provided.";

    questions.push({
      id: createId(),
      prompt: q.prompt.trim(),
      choices,
      correctIndex,
      explanation,
    });
  }

  if (questions.length === 0) {
    throw new ValidationError("Quiz contains no valid questions.");
  }

  return { questions };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
