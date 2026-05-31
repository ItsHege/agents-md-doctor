import { z } from "zod";
import { ToolProfileSchema } from "./tool-profile.js";
import { ToolEvidenceListSchema } from "./tool-evidence.js";

export const ExplainConflictIdSchema = z.enum([
  "tool_manager.disagreement",
  "commands.test_hint_conflict",
  "generated_files.edit_policy_mismatch"
]);

export const ExplainConflictSchema = z.object({
  conflictId: ExplainConflictIdSchema,
  message: z.string().min(1),
  files: z.array(z.string().min(1)),
  details: z.record(z.string(), z.unknown())
});

export const ExplainGraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reference: z.string().min(1),
  line: z.number().int().positive(),
  sourceType: z.string().min(1)
});

export const ExplainGraphDiagnosticSchema = z.object({
  code: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  reference: z.string().min(1).optional(),
  target: z.string().min(1).optional()
});

export const ExplainGraphDetailsSchema = z.object({
  referencedInstructionFiles: z.array(z.string().min(1)),
  instructionEdges: z.array(ExplainGraphEdgeSchema),
  graphDiagnostics: z.array(ExplainGraphDiagnosticSchema)
});

export const AppliedChainDetailsSchema = z.object({
  targetPath: z.string(),
  toolProfile: ToolProfileSchema,
  appliedFiles: z.array(z.string().min(1)),
  conflicts: z.array(ExplainConflictSchema),
  toolEvidence: ToolEvidenceListSchema,
  instructionGraph: ExplainGraphDetailsSchema.optional()
});

export type ExplainConflictId = z.infer<typeof ExplainConflictIdSchema>;
export type ExplainConflict = z.infer<typeof ExplainConflictSchema>;
export type ExplainGraphDetails = z.infer<typeof ExplainGraphDetailsSchema>;
export type AppliedChainDetails = z.infer<typeof AppliedChainDetailsSchema>;
