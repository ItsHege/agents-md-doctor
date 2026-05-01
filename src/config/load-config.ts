import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../errors.js";
import { RuleIdSchema, SeveritySchema } from "../types/index.js";

export const CONFIG_FILE_NAME = ".agents-doctor.json";

const RuleSeverityOverrideSchema = z.union([SeveritySchema, z.literal("off")]);

const RuleConfigSchema = z
  .object({
    severity: RuleSeverityOverrideSchema.optional(),
    maxLines: z.number().int().positive().optional(),
    requiredHeadings: z.array(z.string().min(1)).optional()
  })
  .strict();

export const DEFAULT_INSTRUCTION_GRAPH_INCLUDE = [
  "**/AGENTS.md",
  "**/.agents/**/*.md",
  "**/docs/agents/**/*.md",
  "**/docs/agent/**/*.md",
  "**/CLAUDE.md",
  "**/GEMINI.md",
  "**/.claude/**/*.md",
  "**/.github/copilot-instructions.md",
  "**/.cursor/rules/**/*.md"
];

const InstructionGraphConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    include: z.array(z.string().min(1)).optional()
  })
  .strict();

const AgentsDoctorConfigSchema = z
  .object({
    ignore: z.array(z.string().min(1)).optional(),
    maxLines: z.number().int().positive().optional(),
    failOnWarning: z.boolean().optional(),
    instructionGraph: InstructionGraphConfigSchema.optional(),
    rules: z.record(RuleIdSchema, RuleConfigSchema).optional()
  })
  .strict();

export interface ResolvedInstructionGraphConfig {
  enabled: boolean;
  maxDepth: number;
  include: string[];
}

export type RuleSeverityOverride = z.infer<typeof RuleSeverityOverrideSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type AgentsDoctorConfig = z.infer<typeof AgentsDoctorConfigSchema>;

export interface ResolvedLintConfig {
  ignore: string[];
  maxLines?: number;
  failOnWarning: boolean;
  instructionGraph: ResolvedInstructionGraphConfig;
  rules: Record<string, RuleConfig>;
}

export interface LoadConfigOptions {
  root: string;
}

export function loadConfig(options: LoadConfigOptions): ResolvedLintConfig {
  const configPath = path.join(options.root, CONFIG_FILE_NAME);

  if (!fs.existsSync(configPath)) {
    return {
      ignore: [],
      failOnWarning: false,
      instructionGraph: {
        enabled: false,
        maxDepth: 2,
        include: DEFAULT_INSTRUCTION_GRAPH_INCLUDE
      },
      rules: {}
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new AppError("E_CONFIG_INVALID", `${CONFIG_FILE_NAME} is not valid JSON: ${message}`);
  }

  const parsedConfig = AgentsDoctorConfigSchema.safeParse(parsedJson);

  if (!parsedConfig.success) {
    throw new AppError("E_CONFIG_INVALID", `${CONFIG_FILE_NAME} is invalid: ${parsedConfig.error.issues[0]?.message}`);
  }

  const config = parsedConfig.data;
  const ignore = config.ignore ?? [];
  const instructionGraphInclude = config.instructionGraph?.include ?? DEFAULT_INSTRUCTION_GRAPH_INCLUDE;
  validateIgnorePatterns(ignore);
  validateIgnorePatterns(instructionGraphInclude);

  return {
    ignore,
    ...(config.maxLines ? { maxLines: config.maxLines } : {}),
    failOnWarning: config.failOnWarning ?? false,
    instructionGraph: {
      enabled: config.instructionGraph?.enabled ?? false,
      maxDepth: config.instructionGraph?.maxDepth ?? 2,
      include: instructionGraphInclude
    },
    rules: config.rules ?? {}
  };
}

export function validateIgnorePatterns(patterns: string[]): void {
  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    if (path.posix.isAbsolute(normalizedPattern)) {
      throw new AppError("E_IGNORE_PATTERN_INVALID", `ignore pattern must be repo-relative: ${pattern}`);
    }

    if (
      normalizedPattern === ".." ||
      normalizedPattern.startsWith("../") ||
      normalizedPattern.includes("/../") ||
      normalizedPattern.endsWith("/..")
    ) {
      throw new AppError("E_IGNORE_PATTERN_INVALID", `ignore pattern cannot traverse outside the repo: ${pattern}`);
    }
  }
}
