import { z } from "zod";
import { FindingSchema } from "./finding.js";

export const ReportCommandSchema = z.enum(["lint", "verify", "explain"]);
export const ExitCodeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const ReportSummarySchema = z.object({
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  infoCount: z.number().int().nonnegative()
});

export const ReportSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  tool: z.literal("agents-doctor"),
  command: ReportCommandSchema,
  generatedAt: z.string().datetime({ offset: true }),
  root: z.string().min(1).optional(),
  exitCode: ExitCodeSchema,
  summary: ReportSummarySchema,
  findings: z.array(FindingSchema)
});

export type ReportCommand = z.infer<typeof ReportCommandSchema>;
export type ExitCode = z.infer<typeof ExitCodeSchema>;
export type ReportSummary = z.infer<typeof ReportSummarySchema>;
export type Report = z.infer<typeof ReportSchema>;

