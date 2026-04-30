import { z } from "zod";
import { RuleIdSchema, SeveritySchema } from "./rule.js";

export const FindingSchema = z.object({
  ruleId: RuleIdSchema,
  severity: SeveritySchema,
  message: z.string().min(1),
  file: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  details: z.record(z.unknown()).optional()
});

export type Finding = z.infer<typeof FindingSchema>;

