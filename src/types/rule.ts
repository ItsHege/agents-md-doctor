import { z } from "zod";

export const ruleCategories = [
  "structure",
  "size",
  "coverage",
  "commands",
  "paths",
  "inheritance",
  "security"
] as const;

export const severityLevels = ["error", "warning", "info"] as const;

export const RuleCategorySchema = z.enum(ruleCategories);
export const SeveritySchema = z.enum(severityLevels);

export const RuleIdSchema = z
  .string()
  .regex(
    /^(structure|size|coverage|commands|paths|inheritance|security)\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
    "Rule id must use problem-type category and snake_case name, such as commands.missing_script"
  );

export const RuleDefinitionSchema = z
  .object({
    id: RuleIdSchema,
    category: RuleCategorySchema,
    defaultSeverity: SeveritySchema,
    title: z.string().min(1),
    description: z.string().min(1),
    docsUrl: z.string().url().optional()
  })
  .superRefine((rule, context) => {
    const [idCategory] = rule.id.split(".");

    if (idCategory !== rule.category) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Rule category must match the category prefix in rule id"
      });
    }
  });

export type RuleCategory = z.infer<typeof RuleCategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type RuleId = z.infer<typeof RuleIdSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;

