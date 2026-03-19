import { randomInt } from "crypto";

// Challenge frequency: first message + every N messages
export const CHALLENGE_INTERVAL = 50;

export function needsChallenge(messageCount: number): boolean {
  return messageCount === 0 || messageCount % CHALLENGE_INTERVAL === 0;
}

type Operation = "multiply" | "add" | "subtract" | "divide" | "power" | "sqrt_plus";

interface Challenge {
  question: string; // garbled text
  answer: string;   // correct answer as "X.XX"
}

// Number words for garbling
const NUMBER_WORDS: Record<number, string> = {
  0: "zero", 1: "one", 2: "two", 3: "three", 4: "four",
  5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
  10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
  15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen",
  20: "twenty", 30: "thirty", 40: "forty", 50: "fifty",
  60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety",
};

function numberToWords(n: number): string {
  if (n <= 20) return NUMBER_WORDS[n] || String(n);
  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    return ones === 0 ? NUMBER_WORDS[tens] : `${NUMBER_WORDS[tens]} ${NUMBER_WORDS[ones]}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) return `${NUMBER_WORDS[hundreds]} hundred`;
    return `${NUMBER_WORDS[hundreds]} hundred ${numberToWords(remainder)}`;
  }
  return String(n);
}

// Garble a word: random case, inject symbols, duplicate letters
const SYMBOLS = ["~", "^", "|", "\\", "/", "{", "}", "<", ">", "]", "[", "-", "_", "=", "+"];

function garbleWord(word: string): string {
  let result = "";
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    // Random case
    const c = Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase();
    // Sometimes duplicate the letter
    if (Math.random() < 0.15) {
      result += c + c;
    } else {
      result += c;
    }
    // Sometimes inject a symbol after
    if (Math.random() < 0.12) {
      result += SYMBOLS[randomInt(0, SYMBOLS.length)];
    }
  }
  return result;
}

function garbleText(text: string): string {
  return text
    .split(" ")
    .map((word) => {
      // Sometimes split the word with a space
      if (word.length > 3 && Math.random() < 0.2) {
        const mid = randomInt(1, word.length - 1);
        return garbleWord(word.slice(0, mid)) + " " + garbleWord(word.slice(mid));
      }
      return garbleWord(word);
    })
    .join(" ");
}

const OPERATION_TEMPLATES: Record<Operation, (a: number, b: number) => { text: string; result: number }> = {
  multiply: (a, b) => ({
    text: `${numberToWords(a)} multiplied by ${numberToWords(b)}`,
    result: a * b,
  }),
  add: (a, b) => ({
    text: `${numberToWords(a)} plus ${numberToWords(b)}`,
    result: a + b,
  }),
  subtract: (a, b) => ({
    text: `the difference between ${numberToWords(Math.max(a, b))} and ${numberToWords(Math.min(a, b))}`,
    result: Math.abs(a - b),
  }),
  divide: (a, b) => ({
    text: `${numberToWords(a * b)} divided by ${numberToWords(b)}`,
    result: a, // a*b / b = a, always clean
  }),
  power: (a, _b) => ({
    text: `${numberToWords(a)} raised to the power of two`,
    result: a * a,
  }),
  sqrt_plus: (a, b) => ({
    text: `the square root of ${numberToWords(a * a)} plus ${numberToWords(b)}`,
    result: a + b,
  }),
};

const THEMES = [
  { subject: "robot", verb: "processes", unit: "tasks per cycle" },
  { subject: "satellite", verb: "transmits", unit: "signals per orbit" },
  { subject: "quantum computer", verb: "computes", unit: "qubits per second" },
  { subject: "neural network", verb: "trains on", unit: "samples per batch" },
  { subject: "server", verb: "handles", unit: "requests per minute" },
  { subject: "algorithm", verb: "sorts", unit: "elements per pass" },
  { subject: "drone", verb: "covers", unit: "meters per flight" },
  { subject: "compiler", verb: "optimizes", unit: "instructions per run" },
];

export function generateChallenge(): Challenge {
  const ops: Operation[] = ["multiply", "add", "subtract", "divide", "power", "sqrt_plus"];
  const op = ops[randomInt(0, ops.length)];

  // Generate appropriate numbers
  let a: number, b: number;
  switch (op) {
    case "multiply":
      a = randomInt(2, 20);
      b = randomInt(2, 20);
      break;
    case "add":
      a = randomInt(10, 200);
      b = randomInt(10, 200);
      break;
    case "subtract":
      a = randomInt(10, 200);
      b = randomInt(10, 200);
      break;
    case "divide":
      a = randomInt(2, 50);
      b = randomInt(2, 20);
      break;
    case "power":
      a = randomInt(2, 15);
      b = 0;
      break;
    case "sqrt_plus":
      a = randomInt(2, 20);
      b = randomInt(1, 50);
      break;
    default:
      a = randomInt(2, 20);
      b = randomInt(2, 20);
  }

  const { text, result } = OPERATION_TEMPLATES[op](a, b);
  const theme = THEMES[randomInt(0, THEMES.length)];

  // Build the challenge sentence
  const sentence = `A ${theme.subject} ${theme.verb} data. Calculate ${text}. What is the answer?`;

  // Garble it
  const garbled = garbleText(sentence);

  return {
    question: garbled,
    answer: result.toFixed(2),
  };
}
