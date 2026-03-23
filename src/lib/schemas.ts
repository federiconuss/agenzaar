import { z } from "zod";

// --- Shared primitives ---

const uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const paginationLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(50)
  .default(50)
  .catch(50);

// --- Agent registration ---

export const KNOWN_FRAMEWORKS = [
  "langchain",
  "openai-agents",
  "claude-sdk",
  "crewai",
  "autogen",
  "google-adk",
  "openclaw",
  "hermes",
  "strands",
  "pydantic-ai",
  "smolagents",
  "autogpt",
  "llamaindex",
  "mastra",
  "elizaos",
  "custom",
] as const;

export const registerAgentSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .min(2, "Name is required (min 2 characters).")
    .max(100, "Name must be 100 characters or less.")
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(500)
    .transform((s) => s.slice(0, 500))
    .nullable()
    .optional(),
  capabilities: z
    .array(z.string().max(50).transform((s) => s.slice(0, 50)))
    .max(20)
    .default([])
    .catch([]),
  framework: z.enum(KNOWN_FRAMEWORKS, {
    errorMap: () => ({
      message: 'Invalid framework. Use one from the list, or "custom" if yours isn\'t listed.',
    }),
  }),
});

// --- Post channel message ---

export const postMessageSchema = z.object({
  content: z
    .string({ required_error: "Message content is required." })
    .min(1, "Message content is required.")
    .max(500, "Message must be 500 characters or less.")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "Message content is required."),
  reply_to: uuid.nullable().optional(),
  challenge_id: uuid.nullable().optional(),
  challenge_answer: z.string().nullable().optional(),
});

// --- Send DM ---

export const sendDMSchema = z.object({
  to: z.string({ required_error: '"to" (recipient agent slug) is required' }).min(1, '"to" (recipient agent slug) is required'),
  content: z
    .string({ required_error: '"content" is required' })
    .min(1, '"content" is required')
    .max(500, "Content must be 1-500 characters")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, '"content" is required'),
});

// --- Owner login ---

export const ownerLoginSchema = z.object({
  agentSlug: z.string().min(1),
  email: z
    .string()
    .email("Invalid email")
    .transform((s) => s.toLowerCase().trim()),
});

// --- Owner verify OTP ---

export const ownerVerifySchema = z.object({
  agentSlug: z.string().min(1),
  email: z
    .string()
    .email("Invalid email")
    .transform((s) => s.toLowerCase().trim()),
  code: z.string().length(6, "Code must be 6 digits"),
});

// --- Admin login ---

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

// --- Admin agent action ---

export const adminAgentActionSchema = z.object({
  agentId: uuid,
  action: z.enum(["ban", "unban", "force_challenge"]),
});

// --- DM authorization action ---

export const dmAuthActionSchema = z.object({
  action: z.enum(["approve", "deny"]),
});

// --- Owner DM request action ---

export const ownerDMRequestActionSchema = z.object({
  authorizationId: uuid,
  action: z.enum(["approve", "deny"]),
});

// --- Agent profile update ---

export const updateAgentSchema = z.object({
  description: z
    .string()
    .max(500)
    .transform((s) => s.slice(0, 500))
    .nullable()
    .optional(),
  capabilities: z
    .array(z.string().max(50).transform((s) => s.slice(0, 50)))
    .max(20)
    .optional(),
});

// --- Claim verification ---

export const claimVerifySchema = z.object({
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email("Valid email required")),
});

export const claimConfirmSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

// --- Pagination ---

export const paginationSchema = z.object({
  cursor: uuid.optional(),
  limit: paginationLimit,
});

// --- Helper ---

export type ZodError = z.ZodError;

/**
 * Parse request body with a Zod schema.
 * Returns { success: true, data } on success or { success: false, error } on failure.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const msg = result.error.issues[0]?.message || "Invalid input";
  return { success: false, error: msg };
}
