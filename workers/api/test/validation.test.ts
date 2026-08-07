import { describe, expect, it } from "vitest";
import { parseExplanation, parseQuiz } from "../src/validation";

describe("parseExplanation", () => {
  it("parses a valid explanation", () => {
    const result = parseExplanation({
      topic: "Photosynthesis",
      sections: [{ heading: "What it is", body: "Plants make food from light." }],
      examples: ["Trees and grass"],
      analogy: "A solar panel",
      keyPoints: ["Uses sunlight", "Makes glucose"],
    });

    expect(result.topic).toBe("Photosynthesis");
    expect(result.sections).toHaveLength(1);
    expect(result.examples).toEqual(["Trees and grass"]);
    expect(result.analogy).toBe("A solar panel");
  });

  it("rejects a non-object payload", () => {
    expect(() => parseExplanation("nope")).toThrow();
    expect(() => parseExplanation(null)).toThrow();
  });

  it("rejects a missing topic", () => {
    expect(() =>
      parseExplanation({
        sections: [{ heading: "H", body: "B" }],
        examples: ["e"],
        keyPoints: ["k"],
      }),
    ).toThrow(/topic/);
  });

  it("rejects empty sections", () => {
    expect(() =>
      parseExplanation({ topic: "t", sections: [], examples: ["e"], keyPoints: ["k"] }),
    ).toThrow(/sections/);
  });

  it("skips malformed sections but keeps valid ones", () => {
    const result = parseExplanation({
      topic: "t",
      sections: [
        { heading: "Good", body: "Real content" },
        { heading: "", body: "" },
        42,
      ],
      examples: ["e"],
      keyPoints: ["k"],
    });
    expect(result.sections).toHaveLength(1);
  });
});

describe("parseQuiz", () => {
  it("parses valid questions and assigns ids", () => {
    const result = parseQuiz({
      questions: [
        {
          prompt: "Q1",
          choices: ["A", "B", "C", "D"],
          correctIndex: 2,
          explanation: "Because B.",
        },
      ],
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBeTruthy();
    expect(result.questions[0].correctIndex).toBe(2);
  });

  it("rejects a correctIndex out of range", () => {
    expect(() =>
      parseQuiz({
        questions: [
          {
            prompt: "Q",
            choices: ["A", "B"],
            correctIndex: 5,
            explanation: "x",
          },
        ],
      }),
    ).toThrow(/no valid questions/);
  });

  it("rejects fewer than two choices", () => {
    expect(() =>
      parseQuiz({
        questions: [{ prompt: "Q", choices: ["A"], correctIndex: 0, explanation: "x" }],
      }),
    ).toThrow(/no valid questions/);
  });

  it("rejects an empty quiz", () => {
    expect(() => parseQuiz({ questions: [] })).toThrow();
  });
});
