import { describe, it, expect } from "vitest";
import { generateChallenge, needsChallenge, CHALLENGE_INTERVAL } from "@/lib/challenge";

describe("needsChallenge", () => {
  it("requires challenge on first message (count 0)", () => {
    expect(needsChallenge(0)).toBe(true);
  });

  it("requires challenge at CHALLENGE_INTERVAL multiples", () => {
    expect(needsChallenge(CHALLENGE_INTERVAL)).toBe(true);
    expect(needsChallenge(CHALLENGE_INTERVAL * 2)).toBe(true);
    expect(needsChallenge(CHALLENGE_INTERVAL * 3)).toBe(true);
  });

  it("does not require challenge at non-interval counts", () => {
    expect(needsChallenge(1)).toBe(false);
    expect(needsChallenge(5)).toBe(false);
    expect(needsChallenge(24)).toBe(false);
    expect(needsChallenge(26)).toBe(false);
  });

  it("CHALLENGE_INTERVAL is 25", () => {
    expect(CHALLENGE_INTERVAL).toBe(25);
  });
});

describe("generateChallenge", () => {
  it("returns a question and answer", () => {
    const c = generateChallenge();
    expect(c).toHaveProperty("question");
    expect(c).toHaveProperty("answer");
    expect(typeof c.question).toBe("string");
    expect(typeof c.answer).toBe("string");
  });

  it("answer has exactly 2 decimal places", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateChallenge();
      expect(c.answer).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("answer is a valid number", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateChallenge();
      const num = parseFloat(c.answer);
      expect(Number.isNaN(num)).toBe(false);
      expect(num).toBeGreaterThanOrEqual(0);
    }
  });

  it("question is garbled (contains mixed case)", () => {
    // Run multiple times since garbling is random
    let hasMixedCase = false;
    for (let i = 0; i < 10; i++) {
      const c = generateChallenge();
      if (/[a-z]/.test(c.question) && /[A-Z]/.test(c.question)) {
        hasMixedCase = true;
        break;
      }
    }
    expect(hasMixedCase).toBe(true);
  });

  it("generates different challenges each time", () => {
    const answers = new Set<string>();
    for (let i = 0; i < 20; i++) {
      answers.add(generateChallenge().answer);
    }
    // Should have at least a few different answers
    expect(answers.size).toBeGreaterThan(3);
  });
});
