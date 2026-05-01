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

const AgentsDoctorConfigSchema = z
  .object({
    ignore: z.array(z.string().min(1)).optional(),
    maxLines: z.number().int().positive().optional(),
    failOnWarning: z.boolean().optional(),
    rules: z.record(RuleIdSchema, RuleConfigSchema).optional()
  })
  .strict();

export type RuleSeverityOverride = z.infer<typeof RuleSeverityOverrideSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type AgentsDoctorConfig = z.infer<typeof AgentsDoctorConfigSchema>;

export interface ResolvedLintConfig {
  ignore: string[];
  maxLines?: number;
  failOnWarning: boolean;
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
  validateIgnorePatterns(ignore);

  return {
    ignore,
    ...(config.maxLines ? { maxLines: config.maxLines } : {}),
    failOnWarning: config.failOnWarning ?? false,
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
